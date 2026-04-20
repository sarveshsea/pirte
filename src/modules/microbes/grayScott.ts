// gray-scott reaction-diffusion.
// two morphogens u (substrate) and v (activator) react + diffuse on a grid.
// the exact kinetic model pearson 1993 used to catalogue turing's 1952
// morphogenesis patterns: spots, stripes, solitons (u-skate), coral.
// the (F, k) plane partitions into regions, each producing a distinct
// stable pattern class — switching sub-presets moves across that plane.

import { rampChar, type SimInstance } from './index'

const Du = 1.0
const Dv = 0.5
const DT = 1.0

type Sub = { label: string; F: number; k: number }
const SUBS: readonly Sub[] = [
  { label: 'spots',    F: 0.0367, k: 0.0649 },  // aka mitosis — self-replicating spots
  { label: 'stripes',  F: 0.0290, k: 0.0570 },  // labyrinthine / maze
  { label: 'solitons', F: 0.0140, k: 0.0540 },  // traveling u-skate pulses
  { label: 'coral',    F: 0.0545, k: 0.0620 },  // coral-growth branching
] as const

export function createGrayScott(): SimInstance {
  let cols = 0, rows = 0
  let u: Float32Array = new Float32Array(0)
  let v: Float32Array = new Float32Array(0)
  let un: Float32Array = new Float32Array(0)
  let vn: Float32Array = new Float32Array(0)
  let subIdx = 0
  let accum = 0

  const seed = () => {
    for (let i = 0; i < u.length; i++) { u[i] = 1; v[i] = 0 }
    // drop a few small v-seeds to nucleate patterns
    const seeds = 6 + Math.floor(Math.random() * 5)
    for (let s = 0; s < seeds; s++) {
      const cx = Math.floor(Math.random() * cols)
      const cy = Math.floor(Math.random() * rows)
      const r = 3 + Math.floor(Math.random() * 4)
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r) continue
          const x = ((cx + dx) % cols + cols) % cols
          const y = ((cy + dy) % rows + rows) % rows
          const i = y * cols + x
          u[i] = 0.50
          v[i] = 0.25
        }
      }
    }
  }

  const reset = (c: number, r: number) => {
    cols = c; rows = r
    u = new Float32Array(cols * rows)
    v = new Float32Array(cols * rows)
    un = new Float32Array(cols * rows)
    vn = new Float32Array(cols * rows)
    seed()
    accum = 0
  }

  const sub = () => {
    const { F, k } = SUBS[subIdx]
    // 5-point laplacian with toroidal wrap
    for (let y = 0; y < rows; y++) {
      const ym = (y - 1 + rows) % rows
      const yp = (y + 1) % rows
      for (let x = 0; x < cols; x++) {
        const xm = (x - 1 + cols) % cols
        const xp = (x + 1) % cols
        const i  = y * cols + x
        const iL = y * cols + xm
        const iR = y * cols + xp
        const iU = ym * cols + x
        const iD = yp * cols + x
        const lu = u[iL] + u[iR] + u[iU] + u[iD] - 4 * u[i]
        const lv = v[iL] + v[iR] + v[iU] + v[iD] - 4 * v[i]
        const uvv = u[i] * v[i] * v[i]
        let nu = u[i] + DT * (Du * lu - uvv + F * (1 - u[i]))
        let nv = v[i] + DT * (Dv * lv + uvv - (F + k) * v[i])
        if (nu < 0) nu = 0; else if (nu > 1) nu = 1
        if (nv < 0) nv = 0; else if (nv > 1) nv = 1
        un[i] = nu; vn[i] = nv
      }
    }
    // double-buffer swap
    let t = u; u = un; un = t
    t = v; v = vn; vn = t
  }

  const step = (dt: number) => {
    accum += dt
    // gray-scott wants many sub-steps per frame for visible evolution
    const budget = Math.min(8, Math.floor(accum / (1 / 60)))
    for (let k = 0; k < budget; k++) sub()
    if (budget > 0) accum -= budget * (1 / 60)
    else if (accum > 0.2) accum = 0.05
  }

  const render = () => {
    const lines: string[] = new Array(rows)
    for (let y = 0; y < rows; y++) {
      let line = ''
      for (let x = 0; x < cols; x++) {
        // scale v up a bit for visibility (v peaks ~0.4 in most regimes)
        const val = Math.min(1, v[y * cols + x] * 2.2)
        line += rampChar(val)
      }
      lines[y] = line
    }
    return lines.join('\n')
  }

  const metrics = () => {
    const N = v.length
    let su = 0, sv = 0, mv = 0
    for (let i = 0; i < N; i++) {
      su += u[i]; sv += v[i]
      if (v[i] > mv) mv = v[i]
    }
    return {
      'mean u': N === 0 ? 0 : su / N,
      'mean v': N === 0 ? 0 : sv / N,
      'peak v': mv,
    }
  }

  const params = () => {
    const s = SUBS[subIdx]
    return {
      'regime': s.label,
      'F': s.F.toFixed(4),
      'k': s.k.toFixed(4),
      'Du': Du.toFixed(2),
      'Dv': Dv.toFixed(2),
    }
  }

  const setSubPreset = (n: number) => {
    if (n < 0 || n >= SUBS.length) return
    subIdx = n
    seed()
  }

  return {
    reset,
    reseed: seed,
    step,
    render,
    metrics,
    params,
    setSubPreset,
    subPresetIdx: () => subIdx,
  }
}
