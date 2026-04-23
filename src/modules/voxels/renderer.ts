// 3D voxel renderer — OGL-based.
//
// three passes per frame:
//   (1) wireframe bounding cube  (depth-write, opaque)
//   (2) instanced voxel cubes    (pure additive, order-independent)
//   (3) instanced god-ray beams  (additive, skipped entirely when opacity≈0)
//
// the cubes use pure-additive blending — physically close to light transmitted
// through stained glass (each layer adds its color to whatever's behind it).
// this also makes the pass order-independent so we do NOT sort by depth at
// all, saving an O(n log n) pass + three Float32Array allocations per frame.
//
// instance data comes in already compacted: the simulator emits an
// `aliveIndices` list, so the renderer walks only live cells (O(alive)) rather
// than the full O(N³) grid. on the gpu, only the USED range of each instance
// buffer is re-uploaded each frame via a direct bufferSubData on a subarray
// view, not the full MAX_INSTANCES * 12-byte buffer.

import {
  Renderer, Program, Mesh, Geometry, Camera, Transform, Vec3, Orbit,
  type OGLRenderingContext,
} from 'ogl'
import type { Grid } from './simulation'

export type Palette = {
  sparse: [number, number, number]   // rgb 0..1
  medium: [number, number, number]
  dense:  [number, number, number]
  frame:  [number, number, number]
  background: [number, number, number]
}

export const DEFAULT_PALETTE: Palette = {
  sparse: [0.25, 0.45, 1.0],   // blue
  medium: [1.0, 0.72, 0.18],   // yellow-gold
  dense:  [1.0, 0.28, 0.38],   // red-pink
  frame:  [1.0, 1.0, 1.0],
  background: [0.02, 0.02, 0.03],
}

export type RenderOpts = {
  canvas: HTMLCanvasElement
  gridSize: number
  palette: Palette
  voxelScale: number     // 0..1, fraction of cell that cube occupies
  voxelOpacity: number   // 0..1
  beamLength: number     // world units
  beamOpacity: number    // 0..1
  sunDir: [number, number, number] // normalized — beams extend OPPOSITE to this
}

// classify a cell's neighbor-count-at-birth into sparse/medium/dense buckets
export function densityBucket(count: number): 0 | 1 | 2 {
  if (count <= 5) return 0
  if (count <= 12) return 1
  return 2
}

const MAX_INSTANCES = 16384

// ---- cube geometry: 24 verts (4 per face), normals, indices ----
// faces: +x -x +y -y +z -z
function makeCubeGeometry(): { positions: Float32Array; normals: Float32Array; indices: Uint16Array } {
  const f = 0.5
  type Face = { n: [number, number, number]; v: [number, number, number][] }
  const faces: Face[] = [
    // +x
    { n: [1, 0, 0],  v: [[ f, -f, -f], [ f,  f, -f], [ f,  f,  f], [ f, -f,  f]] },
    // -x
    { n: [-1, 0, 0], v: [[-f, -f,  f], [-f,  f,  f], [-f,  f, -f], [-f, -f, -f]] },
    // +y
    { n: [0, 1, 0],  v: [[-f,  f, -f], [-f,  f,  f], [ f,  f,  f], [ f,  f, -f]] },
    // -y
    { n: [0, -1, 0], v: [[-f, -f,  f], [-f, -f, -f], [ f, -f, -f], [ f, -f,  f]] },
    // +z
    { n: [0, 0, 1],  v: [[-f, -f,  f], [ f, -f,  f], [ f,  f,  f], [-f,  f,  f]] },
    // -z
    { n: [0, 0, -1], v: [[ f, -f, -f], [-f, -f, -f], [-f,  f, -f], [ f,  f, -f]] },
  ]
  const positions = new Float32Array(24 * 3)
  const normals   = new Float32Array(24 * 3)
  const indices   = new Uint16Array(36)
  for (let fi = 0; fi < 6; fi++) {
    const face = faces[fi]
    for (let vi = 0; vi < 4; vi++) {
      const i = fi * 4 + vi
      positions.set(face.v[vi], i * 3)
      normals.set(face.n, i * 3)
    }
    const base = fi * 4
    indices.set([base, base + 1, base + 2, base, base + 2, base + 3], fi * 6)
  }
  return { positions, normals, indices }
}

// ---- wireframe bounding cube: 12 edges as GL_LINES, centered on origin ----
function makeWireCube(n: number): Float32Array {
  const a = -n / 2, b = n / 2
  const edges: [number, number, number, number, number, number][] = [
    // bottom square
    [a, a, a, b, a, a], [b, a, a, b, a, b], [b, a, b, a, a, b], [a, a, b, a, a, a],
    // top square
    [a, b, a, b, b, a], [b, b, a, b, b, b], [b, b, b, a, b, b], [a, b, b, a, b, a],
    // pillars
    [a, a, a, a, b, a], [b, a, a, b, b, a], [b, a, b, b, b, b], [a, a, b, a, b, b],
  ]
  const out = new Float32Array(edges.length * 6)
  edges.forEach((e, i) => out.set(e, i * 6))
  return out
}

// ---- shaders ----

const VOXEL_VERT = /* glsl */ `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
attribute vec3 iOffset;
attribute vec3 iColor;
attribute float iAlpha;
uniform mat4 uProjection;
uniform mat4 uView;
uniform vec3 uSunDir;
uniform float uVoxelScale;
varying vec3 vColor;
varying float vAlpha;
varying vec3 vLocal;
varying float vLight;
void main() {
  vec3 localPos = position * uVoxelScale;
  vec3 worldPos = localPos + iOffset;
  gl_Position = uProjection * uView * vec4(worldPos, 1.0);
  vColor = iColor;
  vAlpha = iAlpha;
  vLocal = position * 2.0; // -1..1 across the cube
  // half-lambert — soft side light
  float d = dot(normalize(normal), normalize(uSunDir));
  vLight = 0.55 + 0.45 * d;
}
`

const VOXEL_FRAG = /* glsl */ `
precision highp float;
varying vec3 vColor;
varying float vAlpha;
varying vec3 vLocal;
varying float vLight;
void main() {
  // distance-to-edge in the face's 2D frame — produces a bright rim on cube
  // faces reminiscent of leaded stained glass. we use the max of the 2 smallest
  // |vLocal| components (the 2 that aren't pointing out of this face).
  vec3 a = abs(vLocal);
  float m = max(max(min(a.x, a.y), min(a.x, a.z)), min(a.y, a.z));
  // edge factor: 1 at rim, 0 at center
  float edge = smoothstep(0.86, 1.0, m);
  // inner glow — tiny gradient toward center so the cube doesn't read as flat
  float inner = 1.0 - 0.35 * length(vLocal) / 1.732;
  vec3 col = vColor * vLight * inner;
  // rim is brighter + slightly tinted white — the "glass lead" look
  col = mix(col, vColor * 1.4 + vec3(0.08), edge * 0.7);
  float alpha = vAlpha * mix(0.85, 1.0, edge);
  gl_FragColor = vec4(col * alpha, alpha);
}
`

// beam vertex: quad in "beam space" — x in [-1,1] across width, y in [0,1]
// along length. we billboard around the beam axis so the quad always faces
// the camera perpendicular to the beam. fade the far tip via y.
const BEAM_VERT = /* glsl */ `
precision highp float;
attribute vec3 position;         // -1..1 on x, 0..1 on y, 0 on z
attribute vec3 iOffset;
attribute vec3 iColor;
attribute float iAlpha;
uniform mat4 uProjection;
uniform mat4 uView;
uniform vec3 uSunDir;           // normalized, points toward sun
uniform float uBeamLength;
uniform float uBeamWidth;
uniform vec3 uCamPos;
varying vec3 vColor;
varying float vAlpha;
varying vec2 vUv;
void main() {
  // axis of extrusion — OPPOSITE of sun direction (shaft extends away from light)
  vec3 axis = -normalize(uSunDir);
  // direction from this voxel to the camera
  vec3 toCam = normalize(uCamPos - iOffset);
  // perpendicular in screen plane — axis × toCam, re-orthogonalized
  vec3 side = normalize(cross(axis, toCam));
  float widthSign = position.x;
  float alongT = position.y;
  vec3 world = iOffset
             + side * (widthSign * uBeamWidth * 0.5)
             + axis * (alongT * uBeamLength);
  gl_Position = uProjection * uView * vec4(world, 1.0);
  vColor = iColor;
  vAlpha = iAlpha;
  vUv = vec2(widthSign * 0.5 + 0.5, alongT);
}
`

const BEAM_FRAG = /* glsl */ `
precision highp float;
varying vec3 vColor;
varying float vAlpha;
varying vec2 vUv;
void main() {
  // width falloff: fades out toward x=0 and x=1, peak at 0.5
  float w = 1.0 - abs(vUv.x * 2.0 - 1.0);
  // soft gaussian-ish profile
  w = pow(w, 1.8);
  // length falloff: full brightness near source, fades to 0 at tip
  float l = 1.0 - vUv.y;
  l = pow(l, 1.3);
  float a = w * l * vAlpha;
  gl_FragColor = vec4(vColor * a, a);
}
`

const WIRE_VERT = /* glsl */ `
precision highp float;
attribute vec3 position;
uniform mat4 uProjection;
uniform mat4 uView;
void main() {
  gl_Position = uProjection * uView * vec4(position, 1.0);
}
`

const WIRE_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uColor;
void main() {
  gl_FragColor = vec4(uColor, 1.0);
}
`

// ---- the renderer ----

export class VoxelRenderer {
  private renderer: Renderer
  private gl: OGLRenderingContext
  private camera: Camera
  private controls: Orbit
  private scene: Transform
  // cube pass
  private voxelGeom: Geometry
  private voxelProgram: Program
  private voxelMesh: Mesh
  // beam pass
  private beamGeom: Geometry
  private beamProgram: Program
  private beamMesh: Mesh
  // wire
  private wireProgram: Program
  private wireMesh: Mesh
  // cpu buffers
  private iOffset: Float32Array
  private iColor:  Float32Array
  private iAlpha:  Float32Array
  private bOffset: Float32Array
  private bColor:  Float32Array
  private bAlpha:  Float32Array
  // flat palette table: 9 floats — [sparse rgb, medium rgb, dense rgb].
  // rebuilt whenever the palette changes; hot loop indexes this directly.
  private palTable: Float32Array
  // state
  private n: number
  private palette: Palette
  private voxelScale: number
  private voxelOpacity: number
  private beamLength: number
  private beamOpacity: number
  private sunDir: Vec3
  private voxelCount = 0
  private beamCount = 0

  constructor(opts: RenderOpts) {
    this.n = opts.gridSize
    this.palette = opts.palette
    this.voxelScale = opts.voxelScale
    this.voxelOpacity = opts.voxelOpacity
    this.beamLength = opts.beamLength
    this.beamOpacity = opts.beamOpacity
    this.sunDir = new Vec3(...opts.sunDir).normalize()

    this.renderer = new Renderer({
      canvas: opts.canvas,
      dpr: Math.min(window.devicePixelRatio, 2),
      alpha: false,
      antialias: true,
    })
    this.gl = this.renderer.gl
    this.gl.clearColor(this.palette.background[0], this.palette.background[1], this.palette.background[2], 1)

    this.camera = new Camera(this.gl, { fov: 42, near: 0.1, far: 500 })
    const dist = this.n * 2.2
    this.camera.position.set(dist, dist * 0.8, dist)
    this.camera.lookAt([0, 0, 0])
    this.controls = new Orbit(this.camera, {
      element: opts.canvas,
      target: new Vec3(0, 0, 0),
      ease: 0.18,
      inertia: 0.82,
      rotateSpeed: 0.16,
      zoomSpeed: 0.8,
      minDistance: this.n * 0.7,
      maxDistance: this.n * 6,
    })

    this.scene = new Transform()

    // ---- voxel cube geometry ----
    const cube = makeCubeGeometry()
    this.iOffset = new Float32Array(MAX_INSTANCES * 3)
    this.iColor  = new Float32Array(MAX_INSTANCES * 3)
    this.iAlpha  = new Float32Array(MAX_INSTANCES)

    this.voxelGeom = new Geometry(this.gl, {
      position: { size: 3, data: cube.positions },
      normal:   { size: 3, data: cube.normals },
      index:    { data: cube.indices },
      iOffset:  { size: 3, data: this.iOffset, instanced: 1, usage: this.gl.DYNAMIC_DRAW },
      iColor:   { size: 3, data: this.iColor,  instanced: 1, usage: this.gl.DYNAMIC_DRAW },
      iAlpha:   { size: 1, data: this.iAlpha,  instanced: 1, usage: this.gl.DYNAMIC_DRAW },
    })

    this.voxelProgram = new Program(this.gl, {
      vertex: VOXEL_VERT,
      fragment: VOXEL_FRAG,
      transparent: true,
      cullFace: 0, // no cull — show back faces for glass look
      depthWrite: false,
      uniforms: {
        uProjection: { value: this.camera.projectionMatrix },
        uView:       { value: this.camera.viewMatrix },
        uSunDir:     { value: [this.sunDir.x, this.sunDir.y, this.sunDir.z] },
        uVoxelScale: { value: this.voxelScale },
      },
    })
    // pure additive blend — order-independent so we don't need to sort
    // cubes by depth. overlapping cubes saturate to white at their centers,
    // matching the stained-glass optical-mix behavior of the reference renders.
    this.voxelProgram.setBlendFunc(this.gl.ONE, this.gl.ONE)
    this.voxelMesh = new Mesh(this.gl, { geometry: this.voxelGeom, program: this.voxelProgram })
    this.voxelMesh.setParent(this.scene)

    // ---- beam geometry ----
    // quad: x ∈ {-1, 1}, y ∈ {0, 1}
    const beamPos = new Float32Array([
      -1, 0, 0,
       1, 0, 0,
       1, 1, 0,
      -1, 1, 0,
    ])
    const beamIdx = new Uint16Array([0, 1, 2, 0, 2, 3])
    this.bOffset = new Float32Array(MAX_INSTANCES * 3)
    this.bColor  = new Float32Array(MAX_INSTANCES * 3)
    this.bAlpha  = new Float32Array(MAX_INSTANCES)

    this.beamGeom = new Geometry(this.gl, {
      position: { size: 3, data: beamPos },
      index:    { data: beamIdx },
      iOffset:  { size: 3, data: this.bOffset, instanced: 1, usage: this.gl.DYNAMIC_DRAW },
      iColor:   { size: 3, data: this.bColor,  instanced: 1, usage: this.gl.DYNAMIC_DRAW },
      iAlpha:   { size: 1, data: this.bAlpha,  instanced: 1, usage: this.gl.DYNAMIC_DRAW },
    })

    this.beamProgram = new Program(this.gl, {
      vertex: BEAM_VERT,
      fragment: BEAM_FRAG,
      transparent: true,
      cullFace: 0,
      depthWrite: false,
      uniforms: {
        uProjection: { value: this.camera.projectionMatrix },
        uView:       { value: this.camera.viewMatrix },
        uSunDir:     { value: [this.sunDir.x, this.sunDir.y, this.sunDir.z] },
        uCamPos:     { value: [0, 0, 0] },
        uBeamLength: { value: this.beamLength },
        uBeamWidth:  { value: 0.85 },
      },
    })
    this.beamProgram.setBlendFunc(this.gl.ONE, this.gl.ONE) // pure additive
    this.beamMesh = new Mesh(this.gl, { geometry: this.beamGeom, program: this.beamProgram })
    this.beamMesh.setParent(this.scene)

    // ---- wireframe bounding cube ----
    const wirePos = makeWireCube(this.n)
    const wireGeom = new Geometry(this.gl, {
      position: { size: 3, data: wirePos },
    })
    this.wireProgram = new Program(this.gl, {
      vertex: WIRE_VERT,
      fragment: WIRE_FRAG,
      uniforms: {
        uProjection: { value: this.camera.projectionMatrix },
        uView:       { value: this.camera.viewMatrix },
        uColor:      { value: [...this.palette.frame] },
      },
      depthTest: true,
      depthWrite: true,
      transparent: false,
    })
    this.wireMesh = new Mesh(this.gl, { geometry: wireGeom, program: this.wireProgram, mode: this.gl.LINES })
    this.wireMesh.setParent(this.scene)

    // palette lookup table — populated from setPalette below
    this.palTable = new Float32Array(9)
    this.rebuildPaletteTable()
  }

  private rebuildPaletteTable() {
    const p = this.palette
    const t = this.palTable
    t[0] = p.sparse[0]; t[1] = p.sparse[1]; t[2] = p.sparse[2]
    t[3] = p.medium[0]; t[4] = p.medium[1]; t[5] = p.medium[2]
    t[6] = p.dense[0];  t[7] = p.dense[1];  t[8] = p.dense[2]
  }

  resize(w: number, h: number) {
    this.renderer.setSize(w, h)
    this.camera.perspective({ aspect: w / h })
  }

  setPalette(p: Palette) {
    this.palette = p
    this.rebuildPaletteTable()
    this.gl.clearColor(p.background[0], p.background[1], p.background[2], 1)
    this.wireProgram.uniforms.uColor.value = [...p.frame] as unknown as number[]
  }

  setVoxelScale(s: number)     { this.voxelScale = s; this.voxelProgram.uniforms.uVoxelScale.value = s }
  setVoxelOpacity(o: number)   { this.voxelOpacity = o }
  setBeamLength(l: number)     { this.beamLength = l; this.beamProgram.uniforms.uBeamLength.value = l }
  setBeamOpacity(o: number)    { this.beamOpacity = o }
  setSunDir(d: [number, number, number]) {
    this.sunDir.set(...d).normalize()
    const arr = [this.sunDir.x, this.sunDir.y, this.sunDir.z]
    this.voxelProgram.uniforms.uSunDir.value = arr as unknown as number[]
    this.beamProgram.uniforms.uSunDir.value = arr as unknown as number[]
  }
  setGridSize(n: number) {
    this.n = n
    const wirePos = makeWireCube(n)
    const attr = this.wireMesh.geometry.attributes.position
    attr.data = wirePos
    attr.needsUpdate = true
    this.wireMesh.geometry.updateAttribute(attr)
    this.controls.minDistance = n * 0.7
    this.controls.maxDistance = n * 6
  }

  // update instance buffers from the current grid state + push to gpu.
  // `maxState` is rule.states - 1 (the value of a freshly-born cell).
  // iterates only the simulator's aliveIndices list — O(alive), not O(N³).
  update(grid: Grid, gen: number, maxState: number): { alive: number; beams: number } {
    const { cells, birthDensity, birthGen, n, aliveIndices, aliveCount } = grid
    const half = n / 2
    const nn = n * n
    const pt = this.palTable
    const vo = this.iOffset, vc = this.iColor, va = this.iAlpha
    const bo = this.bOffset, bc = this.bColor, ba = this.bAlpha
    const beamsOn = this.beamOpacity > 0.005
    const voxelOpacity = this.voxelOpacity
    const beamOpacity = this.beamOpacity
    const invMaxState = 1 / Math.max(1, maxState)

    // beam exposure: step one grid cell along -sunDir, but reduce to the
    // dominant axis so the lookup stays axis-aligned and correct. this is a
    // faithful artistic approximation — shafts emerge from cells facing open
    // sky along the strongest sun direction.
    const sdx = -this.sunDir.x, sdy = -this.sunDir.y, sdz = -this.sunDir.z
    const adx = Math.abs(sdx), ady = Math.abs(sdy), adz = Math.abs(sdz)
    let axis: 0 | 1 | 2 = 0
    let sign = 0
    if (adx >= ady && adx >= adz) { axis = 0; sign = Math.sign(sdx) | 0 }
    else if (ady >= adz)           { axis = 1; sign = Math.sign(sdy) | 0 }
    else                           { axis = 2; sign = Math.sign(sdz) | 0 }
    const stepIdx = axis === 0 ? sign : axis === 1 ? sign * n : sign * nn

    let vi = 0, bi = 0
    const limit = Math.min(aliveCount, MAX_INSTANCES)

    for (let k = 0; k < limit; k++) {
      const i = aliveIndices[k]
      const v = cells[i]
      if (v === 0) continue // shouldn't happen but cheap to guard

      // decode linear index into x,y,z — integer divmod is fast on V8
      const z = (i / nn) | 0
      const rem = i - z * nn
      const y = (rem / n) | 0
      const x = rem - y * n

      // palette lookup via bucket: 0=sparse, 1=medium, 2=dense
      const bd = birthDensity[i]
      const bucket = bd <= 5 ? 0 : bd <= 12 ? 1 : 2
      const pbase = bucket * 3
      const cr = pt[pbase], cg = pt[pbase + 1], cb = pt[pbase + 2]

      // vitality folds decay state + age fade into a single multiplier
      const vitality = v === maxState ? 1 : 0.35 + 0.55 * (v * invMaxState)
      const age = (gen - birthGen[i] + 256) & 0xff
      const ageFade = age < 512 ? 1 - (age / 512) * 0.2 : 0.8

      const vi3 = vi * 3
      vo[vi3]     = x - half + 0.5
      vo[vi3 + 1] = y - half + 0.5
      vo[vi3 + 2] = z - half + 0.5
      vc[vi3]     = cr
      vc[vi3 + 1] = cg
      vc[vi3 + 2] = cb
      va[vi]      = voxelOpacity * vitality * ageFade
      vi++

      // beam: emit iff this cell is sky-exposed along -sunDir (dominant axis).
      // the dominant-axis check is one bounds-test + one cell lookup.
      if (beamsOn && sign !== 0 && bi < MAX_INSTANCES) {
        const coord = axis === 0 ? x : axis === 1 ? y : z
        const nc = coord + sign
        const exposed = nc < 0 || nc >= n || cells[i + stepIdx] === 0
        if (exposed) {
          const bi3 = bi * 3
          bo[bi3]     = vo[vi3]
          bo[bi3 + 1] = vo[vi3 + 1]
          bo[bi3 + 2] = vo[vi3 + 2]
          bc[bi3]     = cr
          bc[bi3 + 1] = cg
          bc[bi3 + 2] = cb
          ba[bi]      = beamOpacity * vitality
          bi++
        }
      }
    }

    this.voxelCount = vi
    this.beamCount = bi

    // upload only the used range of each instance buffer — saves huge amounts
    // of bus bandwidth when alive count << MAX_INSTANCES.
    this.uploadRange(this.voxelGeom, 'iOffset', vi * 3, vo)
    this.uploadRange(this.voxelGeom, 'iColor',  vi * 3, vc)
    this.uploadRange(this.voxelGeom, 'iAlpha',  vi,     va)
    this.voxelGeom.instancedCount = vi

    if (beamsOn) {
      this.uploadRange(this.beamGeom, 'iOffset', bi * 3, bo)
      this.uploadRange(this.beamGeom, 'iColor',  bi * 3, bc)
      this.uploadRange(this.beamGeom, 'iAlpha',  bi,     ba)
      this.beamGeom.instancedCount = bi
    } else {
      this.beamGeom.instancedCount = 0
    }

    return { alive: vi, beams: bi }
  }

  // bind the attribute's gpu buffer and push ONLY the used prefix of the
  // cpu-side typed array. avoids re-uploading MAX_INSTANCES-sized buffers
  // when only a few hundred voxels are alive. zero cpu allocation.
  private uploadRange(geom: Geometry, key: string, usedLen: number, src: Float32Array) {
    if (usedLen === 0) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const attr = geom.attributes[key] as any
    if (!attr.buffer) {
      // first upload has not happened yet — fall back to OGL's path
      attr.needsUpdate = true
      geom.updateAttribute(attr)
      return
    }
    const gl = this.gl
    gl.bindBuffer(gl.ARRAY_BUFFER, attr.buffer)
    // subarray is a zero-copy view (no data allocation — just a tiny header
    // object). bufferSubData uploads exactly usedLen * 4 bytes.
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, src.subarray(0, usedLen))
  }

  render() {
    this.controls.update()
    // update shared uniforms
    this.beamProgram.uniforms.uCamPos.value = [
      this.camera.position.x, this.camera.position.y, this.camera.position.z,
    ]
    this.renderer.render({ scene: this.scene, camera: this.camera, clear: true })
  }

  get stats() {
    return { alive: this.voxelCount, beams: this.beamCount }
  }

  destroy() {
    // we intentionally do NOT forcibly lose the context — StrictMode's double
    // mount cycle would then leave the remount with a permanently-dead canvas.
    // browsers reclaim the context automatically when the canvas is removed
    // from the dom or this module is garbage-collected.
  }
}
