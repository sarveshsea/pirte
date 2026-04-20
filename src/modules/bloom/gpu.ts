// bloom — gpu watercolor fluid simulation.
//
// architecture: stam 1999 stable fluids, 2d, ping-ponged half-float textures
// via ogl's RenderTarget. enriched with curtis 1997 watercolor ingredients:
//   - separate water-depth channel that evaporates
//   - capillary velocity (−∇water) added to pigment advection so pigment
//     physically migrates toward drying edges (real cauliflower/backrun)
//   - paper grain: precomputed fractal-perlin texture that modulates both
//     final render (granulation) and brush splat (wet capacity)
//   - ambient curl-of-noise forcing so the field drifts alive between strokes
//     (the touchdesigner "always breathing" feel)
//
// pipeline per frame:
//   0. (optional) ambient curl injection         — small force on velocity
//   1. advect velocity along itself              — semi-lagrangian
//   2. viscosity blur                            — 5-point avg
//   3. divergence                                — ∇·u
//   4. pressure Jacobi × N                       — solve ∇²p = ∇·u
//   5. subtract gradient                         — u −= ∇p  (divergence-free)
//   6. advect density along (velocity + capillary)
//   7. water evaporation + gated pigment diffusion
//   8. render: beer-lambert subtractive + paper grain
//
// density texture (rgba16f): r=water, g=pigR, b=pigG, a=pigB
// velocity (rg16f), pressure (r16f), divergence (r16f)
//
// uses WebGL2. requires EXT_color_buffer_float (near-universal on desktop/ios/android 2018+).

import { Renderer, Program, Mesh, Triangle, RenderTarget, Texture, Vec2 } from 'ogl'
import { noise2 } from '../../lib/perlin'

// ---------------- shaders ----------------

const VERT = /* glsl */`#version 300 es
in vec2 position;
in vec2 uv;
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`

const BASE_FRAG_HEADER = /* glsl */`#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 fragColor;
`

// splat — add a gaussian impulse to a texture's rgba channels
const SPLAT_FRAG = BASE_FRAG_HEADER + /* glsl */`
uniform sampler2D uTarget;
uniform vec2 uPoint;          // 0..1 uv
uniform vec4 uValue;          // per-channel amount to inject
uniform float uRadius;        // in uv units
uniform float uAspect;
uniform float uPaperCapacity; // 0..1 — multiplier from paper grain
void main() {
  vec2 p = vUv - uPoint;
  p.x *= uAspect;
  float d2 = dot(p, p);
  float a = exp(-d2 / uRadius) * uPaperCapacity;
  fragColor = texture(uTarget, vUv) + uValue * a;
}
`

// advect velocity along itself (r,g = vx, vy)
const ADVECT_VEL_FRAG = BASE_FRAG_HEADER + /* glsl */`
uniform sampler2D uVelocity;
uniform vec2 uTexel;
uniform float uDt;
uniform float uDissipation;
void main() {
  vec2 v = texture(uVelocity, vUv).xy;
  vec2 coord = vUv - uDt * v * uTexel;
  fragColor = vec4(texture(uVelocity, coord).xy * uDissipation, 0.0, 1.0);
}
`

// advect density along (velocity + capillary flow from water gradient)
// density rgba = (water, pr, pg, pb)
const ADVECT_DEN_FRAG = BASE_FRAG_HEADER + /* glsl */`
uniform sampler2D uVelocity;
uniform sampler2D uDensity;
uniform vec2 uTexel;
uniform float uDt;
uniform float uEdgeStrength;
uniform float uDyeDecay;
uniform float uWaterDecay;
void main() {
  // capillary velocity = -grad(water). points wet → dry.
  // scaled by local water to kill the effect in dry regions.
  vec2 pix = uTexel;
  float wL = texture(uDensity, vUv - vec2(pix.x, 0.0)).r;
  float wR = texture(uDensity, vUv + vec2(pix.x, 0.0)).r;
  float wT = texture(uDensity, vUv + vec2(0.0, pix.y)).r;
  float wB = texture(uDensity, vUv - vec2(0.0, pix.y)).r;
  vec2 gradW = vec2(wR - wL, wT - wB) * 0.5;
  float wHere = texture(uDensity, vUv).r;
  vec2 cap = -gradW * uEdgeStrength * clamp(wHere, 0.0, 1.0) * 40.0;

  vec2 v = texture(uVelocity, vUv).xy + cap;
  vec2 coord = vUv - uDt * v * uTexel;
  vec4 d = texture(uDensity, coord);
  d.r *= uWaterDecay;
  d.gba *= uDyeDecay;
  fragColor = d;
}
`

// divergence of velocity
const DIVERGENCE_FRAG = BASE_FRAG_HEADER + /* glsl */`
uniform sampler2D uVelocity;
uniform vec2 uTexel;
void main() {
  float L = texture(uVelocity, vUv - vec2(uTexel.x, 0.0)).x;
  float R = texture(uVelocity, vUv + vec2(uTexel.x, 0.0)).x;
  float T = texture(uVelocity, vUv + vec2(0.0, uTexel.y)).y;
  float B = texture(uVelocity, vUv - vec2(0.0, uTexel.y)).y;
  float div = 0.5 * (R - L + T - B);
  fragColor = vec4(div, 0.0, 0.0, 1.0);
}
`

// pressure Jacobi step
const PRESSURE_FRAG = BASE_FRAG_HEADER + /* glsl */`
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
uniform vec2 uTexel;
void main() {
  float L = texture(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
  float R = texture(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
  float T = texture(uPressure, vUv + vec2(0.0, uTexel.y)).x;
  float B = texture(uPressure, vUv - vec2(0.0, uTexel.y)).x;
  float d = texture(uDivergence, vUv).x;
  float p = (L + R + T + B - d) * 0.25;
  fragColor = vec4(p, 0.0, 0.0, 1.0);
}
`

// subtract pressure gradient from velocity
const GRADIENT_FRAG = BASE_FRAG_HEADER + /* glsl */`
uniform sampler2D uVelocity;
uniform sampler2D uPressure;
uniform vec2 uTexel;
void main() {
  float L = texture(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
  float R = texture(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
  float T = texture(uPressure, vUv + vec2(0.0, uTexel.y)).x;
  float B = texture(uPressure, vUv - vec2(0.0, uTexel.y)).x;
  vec2 v = texture(uVelocity, vUv).xy - vec2(R - L, T - B);
  fragColor = vec4(v, 0.0, 1.0);
}
`

// viscosity — 5-point average blur
const BLUR_FRAG = BASE_FRAG_HEADER + /* glsl */`
uniform sampler2D uSource;
uniform vec2 uTexel;
uniform float uAmount;
void main() {
  vec4 c = texture(uSource, vUv);
  vec4 n = (
    texture(uSource, vUv - vec2(uTexel.x, 0.0)) +
    texture(uSource, vUv + vec2(uTexel.x, 0.0)) +
    texture(uSource, vUv + vec2(0.0, uTexel.y)) +
    texture(uSource, vUv - vec2(0.0, uTexel.y))
  ) * 0.25;
  fragColor = mix(c, n, uAmount);
}
`

// water evaporation + pigment diffusion (gated by water)
const WATER_STEP_FRAG = BASE_FRAG_HEADER + /* glsl */`
uniform sampler2D uDensity;
uniform vec2 uTexel;
uniform float uDt;
uniform float uEvap;
uniform float uDiff;
void main() {
  vec4 c = texture(uDensity, vUv);
  vec4 L = texture(uDensity, vUv - vec2(uTexel.x, 0.0));
  vec4 R = texture(uDensity, vUv + vec2(uTexel.x, 0.0));
  vec4 T = texture(uDensity, vUv + vec2(0.0, uTexel.y));
  vec4 B = texture(uDensity, vUv - vec2(0.0, uTexel.y));
  vec4 neigh = (L + R + T + B) * 0.25;
  // pigment diffusion gated by water depth — dry cells don't diffuse
  float gate = clamp(c.r, 0.0, 1.0);
  vec3 diffusedPig = mix(c.gba, neigh.gba, uDiff * gate);
  // evaporate water
  float w = c.r * exp(-uEvap * uDt);
  fragColor = vec4(w, diffusedPig);
}
`

// ambient curl-of-noise forcing — keeps the field drifting when idle
const AMBIENT_FRAG = BASE_FRAG_HEADER + /* glsl */`
uniform sampler2D uVelocity;
uniform sampler2D uNoise;
uniform float uTime;
uniform float uStrength;
void main() {
  float eps = 1.0 / 512.0;
  vec2 drift = uTime * vec2(0.013, 0.009);
  float nU = texture(uNoise, vUv + vec2(0.0,  eps) + drift).r;
  float nD = texture(uNoise, vUv + vec2(0.0, -eps) + drift).r;
  float nR = texture(uNoise, vUv + vec2( eps, 0.0) + drift).r;
  float nL = texture(uNoise, vUv + vec2(-eps, 0.0) + drift).r;
  // curl of scalar noise field
  vec2 curl = vec2(nU - nD, -(nR - nL)) / (2.0 * eps);
  vec2 v = texture(uVelocity, vUv).xy;
  fragColor = vec4(v + curl * uStrength, 0.0, 1.0);
}
`

// final display pass — beer-lambert subtractive + paper grain + vignette
const DISPLAY_FRAG = BASE_FRAG_HEADER + /* glsl */`
uniform sampler2D uDensity;
uniform sampler2D uPaper;
uniform vec3 uPaperColor;
uniform float uAbsorption;
uniform float uGrain;
uniform float uVignette;
void main() {
  vec4 d = texture(uDensity, vUv);
  float grain = texture(uPaper, vUv).r;
  // subtle paper darkening at low-grain (valleys) and slight highlight at ridges
  float paperMod = 1.0 - (grain - 0.5) * uGrain * 0.6;
  vec3 paper = uPaperColor * paperMod;
  // beer-lambert: out = paper * exp(-pigment * k). add a granulation bias
  // so heavy pigment settles more in paper valleys.
  vec3 pigment = d.gba * (1.0 + (1.0 - grain) * 0.35);
  vec3 col = paper * exp(-pigment * uAbsorption);
  // vignette for mood
  vec2 c = vUv - 0.5;
  float vig = 1.0 - dot(c, c) * uVignette;
  fragColor = vec4(col * vig, 1.0);
}
`

// ---------------- public types ----------------

export type Pigment = {
  label: string
  /** subtractive absorbance per rgb channel. 1 fully blocks that channel. */
  absorb: [number, number, number]
}

export const PIGMENTS: Pigment[] = [
  { label: 'sumi',        absorb: [1.00, 1.00, 1.00] },
  { label: 'ultramarine', absorb: [0.95, 0.75, 0.10] },
  { label: 'alizarin',    absorb: [0.20, 0.90, 0.80] },
  { label: 'sienna',      absorb: [0.30, 0.80, 0.95] },
  { label: 'sap green',   absorb: [0.85, 0.20, 0.85] },
  { label: 'cadmium',     absorb: [0.10, 0.20, 0.95] },
  { label: 'payne',       absorb: [0.70, 0.60, 0.50] },
  { label: 'indigo',      absorb: [0.88, 0.80, 0.30] },
]

export type PaperTint = {
  label: string
  rgb: [number, number, number]
}

export const PAPERS: PaperTint[] = [
  { label: 'arches',  rgb: [252, 248, 235] },
  { label: 'cream',   rgb: [245, 236, 214] },
  { label: 'kraft',   rgb: [222, 196, 157] },
  { label: 'ink',     rgb: [18,  18,  22 ] },
]

export type BloomParams = {
  viscosity: number       // 0..1 — velocity blur per step
  velocityDissipation: number // 0..1 per step
  waterDissipation: number   // 0..1 per advect — tight water decay
  dyeDissipation: number     // 0..1 per advect — pigment decay
  evaporation: number        // water evap rate (per second)
  pigmentDiffusion: number   // 0..1 — pigment diffusion amount
  edgeDarken: number         // 0..2 — capillary strength
  absorption: number         // 0.5..6 — beer-lambert contrast
  grain: number              // 0..1 — paper grain visibility
  vignette: number           // 0..1 — vignette strength
  ambient: number            // 0..1 — ambient curl-noise drift
  pressureIter: number       // Jacobi iterations per step (20 default)
  timeScale: number          // dt multiplier — "flow speed"
}

export const DEFAULT_PARAMS: BloomParams = {
  viscosity: 0.08,
  velocityDissipation: 0.985,
  waterDissipation: 0.9985,
  dyeDissipation: 0.9995,
  evaporation: 0.14,
  pigmentDiffusion: 0.06,
  edgeDarken: 0.85,
  absorption: 2.4,
  grain: 0.55,
  vignette: 0.20,
  ambient: 0.035,
  pressureIter: 20,
  timeScale: 1.0,
}

export type SplatArgs = {
  /** uv 0..1 */ x: number; y: number
  /** velocity impulse (in uv units/s) */ dx: number; dy: number
  /** radius in uv units (small = tight) */ radius: number
  /** water injected */ wetness: number
  /** pigment amount (before absorb mask) */ density: number
  /** subtractive absorbance [r,g,b] */ absorb: [number, number, number]
}

export type BloomGpu = {
  readonly canvas: HTMLCanvasElement
  /** width/height in *css* pixels */
  resize(w: number, h: number): void
  step(dt: number, p: BloomParams): void
  splat(a: SplatArgs): void
  render(paperRgb: [number, number, number], p: BloomParams): void
  clear(): void
  reseedPaper(seed?: number): void
  destroy(): void
}

// ---------------- implementation ----------------

// resolutions for sim vs dye. dye is higher-res because that's what we see.
// sim runs cheap; dye carries detail. classic dobryakov split.
const SIM_RES = 256        // velocity/pressure/divergence — square fit, then matched by aspect
const DYE_RES = 1024       // density (water + pigment)
const PAPER_RES = 1024     // paper grain texture

// webgl2 constants (ogl's types don't narrow to WebGL2, so reference by value)
const GL_HALF_FLOAT = 0x140B
const GL_RED        = 0x1903
const GL_RG         = 0x8227
const GL_R16F       = 0x822D
const GL_RG16F      = 0x822F
const GL_RGBA16F    = 0x881A

type RTPair = { read: RenderTarget; write: RenderTarget; swap: () => void }

export function createBloomGpu(mount: HTMLElement): BloomGpu {
  const renderer = new Renderer({
    dpr: Math.min(window.devicePixelRatio || 1, 2),
    webgl: 2,
    alpha: false,
    antialias: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: true, // so toDataURL works for png save
  })
  const gl = renderer.gl
  const canvas = gl.canvas as HTMLCanvasElement
  canvas.style.width = '100%'
  canvas.style.height = '100%'
  canvas.style.display = 'block'
  mount.appendChild(canvas)

  // required for render-to-float
  gl.getExtension('EXT_color_buffer_float')
  gl.getExtension('OES_texture_float_linear')

  const geom = new Triangle(gl)

  // factory for a ping-pong pair
  const pair = (w: number, h: number, type: number, internalFormat: number, format: number): RTPair => {
    const opts = {
      width: w, height: h,
      minFilter: gl.LINEAR, magFilter: gl.LINEAR,
      wrapS: gl.CLAMP_TO_EDGE, wrapT: gl.CLAMP_TO_EDGE,
      depth: false, stencil: false,
      type, format, internalFormat,
    }
    const a = new RenderTarget(gl, opts)
    const b = new RenderTarget(gl, opts)
    const p = { read: a, write: b, swap: () => {} }
    p.swap = () => { const t = p.read; p.read = p.write; p.write = t }
    return p
  }

  // aspect-matched sim resolution (so pixels are square in uv space)
  const computeSim = (w: number, h: number) => {
    const aspect = w / h
    const simH = Math.max(64, Math.round(SIM_RES / Math.max(1, aspect)))
    const simW = Math.max(64, Math.round(SIM_RES * Math.max(1, 1 / aspect)))
    // normalize so max dim = SIM_RES
    const m = Math.max(simW, simH)
    return { w: Math.round(simW * (SIM_RES / m)), h: Math.round(simH * (SIM_RES / m)) }
  }
  const computeDye = (w: number, h: number) => {
    const aspect = w / h
    const dyeW = aspect >= 1 ? DYE_RES : Math.round(DYE_RES * aspect)
    const dyeH = aspect >= 1 ? Math.round(DYE_RES / aspect) : DYE_RES
    return { w: dyeW, h: dyeH }
  }

  // state held across frames
  let simW = 0, simH = 0, dyeW = 0, dyeH = 0
  let velocity!: RTPair
  let pressure!: RTPair
  let divergence!: RenderTarget
  let density!: RTPair
  let paperTex!: Texture
  let noiseTex!: Texture

  // -------- programs (one per shader) --------
  const mkProgram = (frag: string, uniforms: Record<string, { value: unknown }>) =>
    new Program(gl, { vertex: VERT, fragment: frag, uniforms, depthTest: false, depthWrite: false })

  const P_splat = mkProgram(SPLAT_FRAG, {
    uTarget: { value: null },
    uPoint: { value: new Vec2(0.5, 0.5) },
    uValue: { value: [0, 0, 0, 0] },
    uRadius: { value: 0.01 },
    uAspect: { value: 1 },
    uPaperCapacity: { value: 1 },
  })
  const P_advectVel = mkProgram(ADVECT_VEL_FRAG, {
    uVelocity: { value: null },
    uTexel: { value: new Vec2() },
    uDt: { value: 0.016 },
    uDissipation: { value: 0.99 },
  })
  const P_advectDen = mkProgram(ADVECT_DEN_FRAG, {
    uVelocity: { value: null },
    uDensity: { value: null },
    uTexel: { value: new Vec2() },
    uDt: { value: 0.016 },
    uEdgeStrength: { value: 0.8 },
    uDyeDecay: { value: 0.999 },
    uWaterDecay: { value: 0.998 },
  })
  const P_div = mkProgram(DIVERGENCE_FRAG, {
    uVelocity: { value: null },
    uTexel: { value: new Vec2() },
  })
  const P_pres = mkProgram(PRESSURE_FRAG, {
    uPressure: { value: null },
    uDivergence: { value: null },
    uTexel: { value: new Vec2() },
  })
  const P_grad = mkProgram(GRADIENT_FRAG, {
    uVelocity: { value: null },
    uPressure: { value: null },
    uTexel: { value: new Vec2() },
  })
  const P_blur = mkProgram(BLUR_FRAG, {
    uSource: { value: null },
    uTexel: { value: new Vec2() },
    uAmount: { value: 0.1 },
  })
  const P_waterStep = mkProgram(WATER_STEP_FRAG, {
    uDensity: { value: null },
    uTexel: { value: new Vec2() },
    uDt: { value: 0.016 },
    uEvap: { value: 0.1 },
    uDiff: { value: 0.05 },
  })
  const P_ambient = mkProgram(AMBIENT_FRAG, {
    uVelocity: { value: null },
    uNoise: { value: null },
    uTime: { value: 0 },
    uStrength: { value: 0.03 },
  })
  const P_display = mkProgram(DISPLAY_FRAG, {
    uDensity: { value: null },
    uPaper: { value: null },
    uPaperColor: { value: [1, 1, 1] },
    uAbsorption: { value: 2.4 },
    uGrain: { value: 0.4 },
    uVignette: { value: 0.2 },
  })

  const mesh = (prog: Program) => new Mesh(gl, { geometry: geom, program: prog })
  const M_splat = mesh(P_splat)
  const M_advectVel = mesh(P_advectVel)
  const M_advectDen = mesh(P_advectDen)
  const M_div = mesh(P_div)
  const M_pres = mesh(P_pres)
  const M_grad = mesh(P_grad)
  const M_blur = mesh(P_blur)
  const M_waterStep = mesh(P_waterStep)
  const M_ambient = mesh(P_ambient)
  const M_display = mesh(P_display)

  // build paper grain texture on the CPU (perlin fbm), upload once
  const buildPaperTexture = (seed: number) => {
    const W = PAPER_RES, H = PAPER_RES
    const data = new Uint8Array(W * H * 4)
    // simple fbm, seed via coordinate offsets
    const ox = (seed * 0.137) % 1000
    const oy = (seed * 0.613) % 1000
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let v = 0, amp = 0.5, freq = 0.008
        for (let o = 0; o < 5; o++) {
          v += noise2((x + ox) * freq, (y + oy) * freq) * amp
          amp *= 0.5; freq *= 2.1
        }
        // normalize roughly to [0,1]
        const n = Math.max(0, Math.min(1, v * 0.7 + 0.5))
        // bias toward paper-like histogram — slight s-curve
        const s = n < 0.5 ? 2 * n * n : 1 - 2 * (1 - n) * (1 - n)
        const b = Math.round(s * 255)
        const i = (y * W + x) * 4
        data[i] = b; data[i + 1] = b; data[i + 2] = b; data[i + 3] = 255
      }
    }
    if (!paperTex) {
      paperTex = new Texture(gl, {
        image: data, width: W, height: H,
        minFilter: gl.LINEAR, magFilter: gl.LINEAR,
        wrapS: gl.REPEAT, wrapT: gl.REPEAT,
        format: gl.RGBA, internalFormat: gl.RGBA, type: gl.UNSIGNED_BYTE,
      })
    } else {
      paperTex.image = data
      paperTex.needsUpdate = true
    }
  }

  // a small independent noise texture for ambient curl — lower freq
  const buildNoiseTexture = () => {
    const W = 256, H = 256
    const data = new Uint8Array(W * H * 4)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let v = 0, amp = 0.5, freq = 0.02
        for (let o = 0; o < 4; o++) {
          v += noise2(x * freq + 91, y * freq + 37) * amp
          amp *= 0.5; freq *= 2.0
        }
        const b = Math.round(Math.max(0, Math.min(1, v * 0.6 + 0.5)) * 255)
        const i = (y * W + x) * 4
        data[i] = b; data[i + 1] = b; data[i + 2] = b; data[i + 3] = 255
      }
    }
    noiseTex = new Texture(gl, {
      image: data, width: W, height: H,
      minFilter: gl.LINEAR, magFilter: gl.LINEAR,
      wrapS: gl.REPEAT, wrapT: gl.REPEAT,
      format: gl.RGBA, internalFormat: gl.RGBA, type: gl.UNSIGNED_BYTE,
    })
  }

  // allocate render targets at given sim / dye sizes
  const allocate = (w: number, h: number) => {
    const s = computeSim(w, h)
    const d = computeDye(w, h)
    simW = s.w; simH = s.h
    dyeW = d.w; dyeH = d.h
    velocity    = pair(simW, simH, GL_HALF_FLOAT, GL_RG16F, GL_RG)
    pressure    = pair(simW, simH, GL_HALF_FLOAT, GL_R16F,  GL_RED)
    divergence  = new RenderTarget(gl, {
      width: simW, height: simH,
      minFilter: gl.LINEAR, magFilter: gl.LINEAR,
      wrapS: gl.CLAMP_TO_EDGE, wrapT: gl.CLAMP_TO_EDGE,
      depth: false, stencil: false,
      type: GL_HALF_FLOAT, format: GL_RED, internalFormat: GL_R16F,
    })
    density     = pair(dyeW, dyeH, GL_HALF_FLOAT, GL_RGBA16F, gl.RGBA)
  }

  // helper: render prog into target (omit target = render to canvas)
  const blit = (m: Mesh, target?: RenderTarget) => {
    renderer.render({ scene: m, target })
  }

  // ---- public ops ----

  const resize = (w: number, h: number) => {
    renderer.setSize(w, h)
    // (re)allocate if sim dimensions changed
    const s = computeSim(w, h)
    if (s.w !== simW || s.h !== simH || !velocity) {
      allocate(w, h)
    }
  }

  const clear = () => {
    // zero out both buffers in each pair by splatting with uValue=0 and uRadius=huge isn't great.
    // simpler: bind each RT, glClear.
    for (const rt of [velocity.read, velocity.write, pressure.read, pressure.write, divergence, density.read, density.write]) {
      renderer.bindFramebuffer(rt)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
    }
    renderer.bindFramebuffer()
  }

  const reseedPaper = (seed?: number) => {
    const s = seed ?? (Math.random() * 2 ** 31) | 0
    buildPaperTexture(s)
  }

  const splat = (a: SplatArgs) => {
    const aspect = (canvas.width || 1) / (canvas.height || 1)

    // 1. inject velocity into velocity RT
    P_splat.uniforms.uTarget.value = velocity.read.texture
    ;(P_splat.uniforms.uPoint.value as Vec2).set(a.x, a.y)
    P_splat.uniforms.uValue.value = [a.dx, a.dy, 0, 0]
    P_splat.uniforms.uRadius.value = Math.max(1e-5, a.radius * a.radius)
    P_splat.uniforms.uAspect.value = aspect
    P_splat.uniforms.uPaperCapacity.value = 1
    blit(M_splat, velocity.write); velocity.swap()

    // 2. inject into density — water + pigment channels. pigment scaled by absorb mask.
    P_splat.uniforms.uTarget.value = density.read.texture
    ;(P_splat.uniforms.uPoint.value as Vec2).set(a.x, a.y)
    P_splat.uniforms.uValue.value = [
      a.wetness,
      a.absorb[0] * a.density,
      a.absorb[1] * a.density,
      a.absorb[2] * a.density,
    ]
    P_splat.uniforms.uRadius.value = Math.max(1e-5, a.radius * a.radius)
    P_splat.uniforms.uAspect.value = aspect
    // paper grain modulates how much the brush leaves — sampled *inside* shader would be ideal,
    // but for now keep per-splat constant of 1 (paper still influences render).
    P_splat.uniforms.uPaperCapacity.value = 1
    blit(M_splat, density.write); density.swap()
  }

  let t = 0
  const step = (dt: number, p: BloomParams) => {
    if (dt <= 0) return
    const sdt = Math.min(0.033, dt) * p.timeScale
    t += sdt

    // ambient curl forcing
    if (p.ambient > 0) {
      P_ambient.uniforms.uVelocity.value = velocity.read.texture
      P_ambient.uniforms.uNoise.value = noiseTex
      P_ambient.uniforms.uTime.value = t
      P_ambient.uniforms.uStrength.value = p.ambient
      blit(M_ambient, velocity.write); velocity.swap()
    }

    // advect velocity along itself
    P_advectVel.uniforms.uVelocity.value = velocity.read.texture
    ;(P_advectVel.uniforms.uTexel.value as Vec2).set(1 / simW, 1 / simH)
    P_advectVel.uniforms.uDt.value = sdt * 60  // tuned so pixel speeds map to useful motion
    P_advectVel.uniforms.uDissipation.value = p.velocityDissipation
    blit(M_advectVel, velocity.write); velocity.swap()

    // viscosity — a few small blurs (watercolor is viscous; smooths high-freq)
    P_blur.uniforms.uSource.value = velocity.read.texture
    ;(P_blur.uniforms.uTexel.value as Vec2).set(1 / simW, 1 / simH)
    P_blur.uniforms.uAmount.value = p.viscosity
    blit(M_blur, velocity.write); velocity.swap()

    // divergence
    P_div.uniforms.uVelocity.value = velocity.read.texture
    ;(P_div.uniforms.uTexel.value as Vec2).set(1 / simW, 1 / simH)
    blit(M_div, divergence)

    // clear pressure to 0 before iterating (avoids pressure drift between frames)
    renderer.bindFramebuffer(pressure.read)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    renderer.bindFramebuffer()

    // Jacobi pressure iterations
    const iter = Math.max(1, Math.floor(p.pressureIter))
    for (let i = 0; i < iter; i++) {
      P_pres.uniforms.uPressure.value = pressure.read.texture
      P_pres.uniforms.uDivergence.value = divergence.texture
      ;(P_pres.uniforms.uTexel.value as Vec2).set(1 / simW, 1 / simH)
      blit(M_pres, pressure.write); pressure.swap()
    }

    // subtract gradient → divergence-free velocity
    P_grad.uniforms.uVelocity.value = velocity.read.texture
    P_grad.uniforms.uPressure.value = pressure.read.texture
    ;(P_grad.uniforms.uTexel.value as Vec2).set(1 / simW, 1 / simH)
    blit(M_grad, velocity.write); velocity.swap()

    // advect density along (velocity + capillary)
    P_advectDen.uniforms.uVelocity.value = velocity.read.texture
    P_advectDen.uniforms.uDensity.value = density.read.texture
    ;(P_advectDen.uniforms.uTexel.value as Vec2).set(1 / dyeW, 1 / dyeH)
    P_advectDen.uniforms.uDt.value = sdt * 60
    P_advectDen.uniforms.uEdgeStrength.value = p.edgeDarken
    P_advectDen.uniforms.uDyeDecay.value = p.dyeDissipation
    P_advectDen.uniforms.uWaterDecay.value = p.waterDissipation
    blit(M_advectDen, density.write); density.swap()

    // water evaporation + pigment diffusion
    P_waterStep.uniforms.uDensity.value = density.read.texture
    ;(P_waterStep.uniforms.uTexel.value as Vec2).set(1 / dyeW, 1 / dyeH)
    P_waterStep.uniforms.uDt.value = sdt
    P_waterStep.uniforms.uEvap.value = p.evaporation
    P_waterStep.uniforms.uDiff.value = p.pigmentDiffusion
    blit(M_waterStep, density.write); density.swap()
  }

  const render = (paperRgb: [number, number, number], p: BloomParams) => {
    P_display.uniforms.uDensity.value = density.read.texture
    P_display.uniforms.uPaper.value = paperTex
    P_display.uniforms.uPaperColor.value = [paperRgb[0] / 255, paperRgb[1] / 255, paperRgb[2] / 255]
    P_display.uniforms.uAbsorption.value = p.absorption
    P_display.uniforms.uGrain.value = p.grain
    P_display.uniforms.uVignette.value = p.vignette
    renderer.render({ scene: M_display })
  }

  const destroy = () => {
    try { mount.removeChild(canvas) } catch { /* ignore */ }
    // gl resources are owned by the renderer; letting gc reclaim is fine here
  }

  // ---- initialize ----
  buildPaperTexture(42)
  buildNoiseTexture()
  // allocate with mount size (caller will resize)
  const rect = mount.getBoundingClientRect()
  const w = Math.max(64, Math.floor(rect.width))
  const h = Math.max(64, Math.floor(rect.height))
  resize(w, h)

  return { canvas, resize, step, splat, render, clear, reseedPaper, destroy }
}
