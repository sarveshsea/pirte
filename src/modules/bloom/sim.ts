// bloom — wet-on-wet watercolor simulation.
//
// physics layer, loosely after curtis et al 1997 "computer-generated
// watercolor" with a stable-fluids (stam 1999) advection step. simplified
// for 256×160 grids at 60fps in the browser without a webgl dep.
//
// fields
//   water        — fluid depth on the paper (the "puddle")
//   pr pg pb     — subtractive pigment density per rgb channel
//   vx vy        — fluid velocity (impulse from the brush; no pressure solve,
//                  just viscous decay — watercolor isn't turbulent)
//   paper        — precomputed grain noise, shapes absorption + a bit of render
//
// per step
//   1. advect pigment along (velocity + capillary flow).
//      capillary = −∇water — points from wet toward dry. this is the physical
//      driver of the "cauliflower / backrun" edge darkening: as water
//      evaporates at the boundary, capillary action pulls more water + pigment
//      outward, concentrating pigment at the drying edge.
//   2. viscosity blur + decay on velocity
//   3. evaporate water
//   4. diffuse pigment, gated by water depth (dry cells don't diffuse — once
//      paper dries the pigment is locked)
//
// render: paper_rgb · exp(−k · pigment_rgb) with a light grain multiplier.
// beer-lambert subtractive model — physically correct for thin pigment layers.

import { noise2 } from '../../lib/perlin'
import { mulberry32 } from '../../lib/rng'

export type Pigment = {
  label: string
  // subtractive absorbance per rgb channel. 1.0 fully blocks that band.
  absorb: [number, number, number]
}

// chosen to match real watercolor pigments by reflectance. rough but readable.
export const PIGMENTS: Pigment[] = [
  { label: 'sumi',        absorb: [1.00, 1.00, 1.00] },  // black — blocks all
  { label: 'ultramarine', absorb: [0.95, 0.75, 0.10] },  // deep blue
  { label: 'alizarin',    absorb: [0.20, 0.90, 0.80] },  // crimson
  { label: 'sienna',      absorb: [0.30, 0.80, 0.95] },  // warm brown
  { label: 'sap green',   absorb: [0.85, 0.20, 0.85] },  // olive green
  { label: 'cadmium',     absorb: [0.10, 0.20, 0.95] },  // yellow
  { label: 'payne',       absorb: [0.70, 0.60, 0.50] },  // cool grey
  { label: 'indigo',      absorb: [0.88, 0.80, 0.30] },  // indigo
]

export type PaperTint = {
  label: string
  rgb: [number, number, number]
}

export const PAPERS: PaperTint[] = [
  { label: 'arches',  rgb: [252, 248, 235] },  // warm white cotton paper
  { label: 'cream',   rgb: [245, 236, 214] },  // cream / bone
  { label: 'kraft',   rgb: [222, 196, 157] },  // craft / tan
  { label: 'ink',     rgb: [18,  18,  22 ] },  // dark for white-on-black
]

export type BloomParams = {
  diffusion: number      // 0..1 — capillary pigment spread per step
  viscosity: number      // 0..1 — velocity blur per step
  evaporation: number    // 0..1 — water loss rate (per simulated second)
  edgeDarken: number     // 0..2 — strength of capillary flow toward dry edges
  absorption: number     // 0.5..6 — beer-lambert scale (contrast of pigment)
  grain: number          // 0..1 — paper-texture visibility
  velocityDecay: number  // 0..1 — per-step velocity multiplier (inertia)
  flow: number           // 0..3 — global speed of advection (dt multiplier)
}

export const DEFAULT_PARAMS: BloomParams = {
  diffusion: 0.28,
  viscosity: 0.20,
  evaporation: 0.18,
  edgeDarken: 0.80,
  absorption: 2.4,
  grain: 0.40,
  velocityDecay: 0.94,
  flow: 1.0,
}

export type BrushOp = {
  x: number; y: number
  dx: number; dy: number
  radius: number
  wetness: number
  density: number
  absorb: [number, number, number]
}

type Buffers = {
  vx: Float32Array
  vy: Float32Array
  water: Float32Array
  pr: Float32Array
  pg: Float32Array
  pb: Float32Array
  paper: Float32Array
  a: Float32Array   // scratch
  b: Float32Array   // scratch
}

export type BloomSim = {
  readonly cols: number
  readonly rows: number
  resize(cols: number, rows: number): void
  clear(): void
  reseedPaper(seed?: number): void
  step(dt: number, p: BloomParams): void
  stamp(op: BrushOp): void
  render(imageData: ImageData, paperRgb: [number, number, number], p: BloomParams): void
}

export function createBloomSim(initialCols: number, initialRows: number, initialSeed = 42): BloomSim {
  let COLS = 0
  let ROWS = 0
  let seed = initialSeed
  let buf: Buffers = {} as Buffers

  const alloc = () => {
    const n = COLS * ROWS
    buf = {
      vx: new Float32Array(n),
      vy: new Float32Array(n),
      water: new Float32Array(n),
      pr: new Float32Array(n),
      pg: new Float32Array(n),
      pb: new Float32Array(n),
      paper: new Float32Array(n),
      a: new Float32Array(n),
      b: new Float32Array(n),
    }
  }

  const seedPaper = (s: number) => {
    // multi-octave perlin. shift coordinates by seed to get different grain.
    const rng = mulberry32(s)
    const ox = rng() * 1000
    const oy = rng() * 1000
    const { paper } = buf
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const v1 = noise2((x + ox) * 0.03, (y + oy) * 0.03)
        const v2 = noise2((x + ox) * 0.09, (y + oy) * 0.09) * 0.4
        const v3 = noise2((x + ox) * 0.22, (y + oy) * 0.22) * 0.15
        // normalize to roughly [0.5, 1.0]
        paper[y * COLS + x] = 0.75 + (v1 + v2 + v3) * 0.22
      }
    }
  }

  const resize = (c: number, r: number) => {
    if (c === COLS && r === ROWS) return
    COLS = c; ROWS = r
    alloc()
    seedPaper(seed)
  }

  const clear = () => {
    buf.vx.fill(0); buf.vy.fill(0); buf.water.fill(0)
    buf.pr.fill(0); buf.pg.fill(0); buf.pb.fill(0)
  }

  const reseedPaper = (s?: number) => {
    seed = s ?? ((Math.random() * 2 ** 31) | 0)
    seedPaper(seed)
  }

  // bilinear sample. edge-clamped.
  const sample = (field: Float32Array, x: number, y: number): number => {
    if (x < 0) x = 0; else if (x > COLS - 1) x = COLS - 1
    if (y < 0) y = 0; else if (y > ROWS - 1) y = ROWS - 1
    const x0 = x | 0, y0 = y | 0
    const x1 = x0 + 1 < COLS ? x0 + 1 : x0
    const y1 = y0 + 1 < ROWS ? y0 + 1 : y0
    const fx = x - x0, fy = y - y0
    const a = field[y0 * COLS + x0]
    const b = field[y0 * COLS + x1]
    const c = field[y1 * COLS + x0]
    const d = field[y1 * COLS + x1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy
  }

  // 5-point diffusion; `weight` (water depth) gates the diffusion per cell.
  // dry cells keep their pigment — ink dries in place.
  const diffuseGated = (field: Float32Array, amount: number, weight: Float32Array) => {
    const out = buf.a
    for (let y = 0; y < ROWS; y++) {
      const ym = y === 0 ? 0 : y - 1
      const yp = y === ROWS - 1 ? ROWS - 1 : y + 1
      for (let x = 0; x < COLS; x++) {
        const xm = x === 0 ? 0 : x - 1
        const xp = x === COLS - 1 ? COLS - 1 : x + 1
        const i = y * COLS + x
        // gate by min(water, 1) so a dry cell neither sends nor receives much
        const w = weight[i] > 1 ? 1 : weight[i]
        const neigh = (
          field[ym * COLS + x] + field[yp * COLS + x] +
          field[y  * COLS + xm] + field[y  * COLS + xp]
        ) * 0.25
        out[i] = field[i] + amount * w * (neigh - field[i])
      }
    }
    field.set(out)
  }

  // plain 5-point blur (used for velocity viscosity).
  const diffuse = (field: Float32Array, amount: number) => {
    const out = buf.a
    for (let y = 0; y < ROWS; y++) {
      const ym = y === 0 ? 0 : y - 1
      const yp = y === ROWS - 1 ? ROWS - 1 : y + 1
      for (let x = 0; x < COLS; x++) {
        const xm = x === 0 ? 0 : x - 1
        const xp = x === COLS - 1 ? COLS - 1 : x + 1
        const i = y * COLS + x
        const neigh = (
          field[ym * COLS + x] + field[yp * COLS + x] +
          field[y  * COLS + xm] + field[y  * COLS + xp]
        ) * 0.25
        out[i] = field[i] + amount * (neigh - field[i])
      }
    }
    field.set(out)
  }

  // semi-lagrangian advect of `src` along a velocity field (ux, uy).
  const advectField = (
    src: Float32Array, dst: Float32Array,
    ux: Float32Array, uy: Float32Array,
    dtScaled: number,
  ) => {
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const i = y * COLS + x
        const px = x - ux[i] * dtScaled
        const py = y - uy[i] * dtScaled
        dst[i] = sample(src, px, py)
      }
    }
  }

  // fill ux/uy with (velocity + capillary flow from water gradient).
  const computeEffectiveVelocity = (
    ux: Float32Array, uy: Float32Array,
    edgeStrength: number,
  ) => {
    const { vx, vy, water } = buf
    for (let y = 0; y < ROWS; y++) {
      const ym = y === 0 ? 0 : y - 1
      const yp = y === ROWS - 1 ? ROWS - 1 : y + 1
      for (let x = 0; x < COLS; x++) {
        const xm = x === 0 ? 0 : x - 1
        const xp = x === COLS - 1 ? COLS - 1 : x + 1
        const i = y * COLS + x
        // capillary points toward dry (−∇water), stronger in wet regions
        const gx = water[y * COLS + xp] - water[y * COLS + xm]
        const gy = water[yp * COLS + x] - water[ym * COLS + x]
        const w = water[i] > 1 ? 1 : water[i]
        ux[i] = vx[i] - gx * edgeStrength * w * 10
        uy[i] = vy[i] - gy * edgeStrength * w * 10
      }
    }
  }

  const step = (dt: number, p: BloomParams) => {
    if (dt <= 0 || COLS === 0 || ROWS === 0) return
    // cap the step so a long pause doesn't cause overshoot
    const sdt = Math.min(0.05, dt) * p.flow

    // 1. effective velocity = true velocity + capillary
    //    stored in (a, b) scratch buffers
    const ux = buf.a, uy = buf.b
    computeEffectiveVelocity(ux, uy, p.edgeDarken)

    // 2. advect water + each pigment channel along effective velocity
    //    scale is the per-step step size in cells
    const scale = sdt * 40
    const tmp = new Float32Array(COLS * ROWS) // temp dst (re-alloc cheap at this size)
    for (const field of [buf.water, buf.pr, buf.pg, buf.pb]) {
      advectField(field, tmp, ux, uy, scale)
      field.set(tmp)
    }
    // advect velocity along itself (self-advection, lite — no pressure solve)
    advectField(buf.vx, tmp, buf.vx, buf.vy, scale); buf.vx.set(tmp)
    advectField(buf.vy, tmp, buf.vx, buf.vy, scale); buf.vy.set(tmp)

    // 3. viscosity + velocity decay
    diffuse(buf.vx, p.viscosity)
    diffuse(buf.vy, p.viscosity)
    const vdecay = Math.pow(p.velocityDecay, sdt * 60)
    for (let i = 0; i < buf.vx.length; i++) {
      buf.vx[i] *= vdecay
      buf.vy[i] *= vdecay
    }

    // 4. evaporation — water *= (1 − evapRate)^(seconds)
    const evap = Math.pow(1 - p.evaporation, sdt)
    const waterArr = buf.water
    for (let i = 0; i < waterArr.length; i++) waterArr[i] *= evap

    // 5. pigment diffusion, gated by water depth
    diffuseGated(buf.pr, p.diffusion, buf.water)
    diffuseGated(buf.pg, p.diffusion, buf.water)
    diffuseGated(buf.pb, p.diffusion, buf.water)
  }

  const stamp = (op: BrushOp) => {
    const { x: cx, y: cy, radius: r } = op
    if (r <= 0) return
    const r2 = r * r
    const x0 = Math.max(0, Math.floor(cx - r))
    const x1 = Math.min(COLS - 1, Math.ceil(cx + r))
    const y0 = Math.max(0, Math.floor(cy - r))
    const y1 = Math.min(ROWS - 1, Math.ceil(cy + r))
    const { water, pr, pg, pb, vx, vy, paper } = buf
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx, dy = y - cy
        const d2 = dx * dx + dy * dy
        if (d2 > r2) continue
        const i = y * COLS + x
        // smooth circular falloff, slightly textured by paper grain
        const base = 1 - d2 / r2
        const fall = base * base * (paper[i] * 0.6 + 0.4)
        water[i] = Math.min(2.0, water[i] + op.wetness * fall)
        pr[i] = Math.min(3, pr[i] + op.absorb[0] * op.density * fall)
        pg[i] = Math.min(3, pg[i] + op.absorb[1] * op.density * fall)
        pb[i] = Math.min(3, pb[i] + op.absorb[2] * op.density * fall)
        vx[i] += op.dx * fall
        vy[i] += op.dy * fall
      }
    }
  }

  const render = (
    imageData: ImageData,
    paperRgb: [number, number, number],
    p: BloomParams,
  ) => {
    const data = imageData.data
    const k = p.absorption
    const grainAmt = p.grain
    const { pr, pg, pb, paper } = buf
    const n = COLS * ROWS
    const baseR = paperRgb[0]
    const baseG = paperRgb[1]
    const baseB = paperRgb[2]
    for (let i = 0; i < n; i++) {
      // paper micro-darkening — subtle shadow following fibers
      const g = 1 - (paper[i] - 0.75) * grainAmt * 0.5
      // beer-lambert subtractive: darker where pigment is, per channel
      const aR = Math.exp(-pr[i] * k)
      const aG = Math.exp(-pg[i] * k)
      const aB = Math.exp(-pb[i] * k)
      const px = i * 4
      let r = baseR * aR * g
      let gch = baseG * aG * g
      let b = baseB * aB * g
      if (r < 0) r = 0; else if (r > 255) r = 255
      if (gch < 0) gch = 0; else if (gch > 255) gch = 255
      if (b < 0) b = 0; else if (b > 255) b = 255
      data[px]     = r
      data[px + 1] = gch
      data[px + 2] = b
      data[px + 3] = 255
    }
  }

  // initial allocation
  resize(initialCols, initialRows)

  return {
    get cols() { return COLS },
    get rows() { return ROWS },
    resize, clear, reseedPaper, step, stamp, render,
  }
}

// convenience: preview color for a pigment (for ui palette swatches).
export function pigmentPreviewCss(p: Pigment, density = 2): string {
  const r = Math.round(255 * Math.exp(-p.absorb[0] * density))
  const g = Math.round(255 * Math.exp(-p.absorb[1] * density))
  const b = Math.round(255 * Math.exp(-p.absorb[2] * density))
  return `rgb(${r}, ${g}, ${b})`
}
