// lotka-volterra 2d — predator/prey with diffusion.
//
// classical lotka (1925) / volterra (1926) kinetics lifted onto a grid:
//   dH/dt = Dh∇²H + aH − bHP
//   dP/dt = Dp∇²P + cHP − dP
// where H = herbivore/prey density, P = predator density.
// spatial diffusion + boundary noise turn the usual point-mass orbit into
// traveling pursuit fronts: cyan prey waves chased by rosy predator halos.

import {
  rampChar, SPECIES_COLOR,
  type SimInstance, type SimLayer, type PhaseSample, type PhaseSpec,
} from './index'

const A  = 0.55       // prey growth
const B  = 0.75       // predation rate
const C  = 0.70       // predator growth per prey consumed
const D  = 0.45       // predator mortality
const DH = 0.12       // prey diffusion
const DP = 0.08       // predator diffusion (slower — predators don't wander as fast)
const DT = 0.4

// thresholds below which a cell is treated as empty of that species.
// used to mask renderLayers() output so the two layers don't both paint
// the full dish with their density ramp's dim tail.
const PREY_THRESH = 0.08
const PRED_THRESH = 0.04

export function createLotkaVolterra(): SimInstance {
  let cols = 0, rows = 0
  let H: Float32Array = new Float32Array(0)
  let P: Float32Array = new Float32Array(0)
  let Hn: Float32Array = new Float32Array(0)
  let Pn: Float32Array = new Float32Array(0)
  let accum = 0

  const seed = () => {
    // start with mostly prey, a few predator pockets scattered around
    for (let i = 0; i < H.length; i++) {
      H[i] = 0.5 + Math.random() * 0.2
      P[i] = 0
    }
    const pockets = 6 + Math.floor(Math.random() * 4)
    for (let s = 0; s < pockets; s++) {
      const cx = Math.floor(Math.random() * cols)
      const cy = Math.floor(Math.random() * rows)
      const r = 2 + Math.floor(Math.random() * 3)
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r) continue
          const x = ((cx + dx) % cols + cols) % cols
          const y = ((cy + dy) % rows + rows) % rows
          const i = y * cols + x
          P[i] = 0.55 + Math.random() * 0.2
          H[i] = 0.2                       // predators just ate the local prey
        }
      }
    }
  }

  const reset = (c: number, r: number) => {
    cols = c; rows = r
    H  = new Float32Array(cols * rows)
    P  = new Float32Array(cols * rows)
    Hn = new Float32Array(cols * rows)
    Pn = new Float32Array(cols * rows)
    seed()
    accum = 0
  }

  const sub = () => {
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
        const lh = H[iL] + H[iR] + H[iU] + H[iD] - 4 * H[i]
        const lp = P[iL] + P[iR] + P[iU] + P[iD] - 4 * P[i]
        const h = H[i], p = P[i]
        let nh = h + DT * (DH * lh + A * h - B * h * p)
        let np = p + DT * (DP * lp + C * h * p - D * p)
        if (nh < 0) nh = 0; else if (nh > 2) nh = 2
        if (np < 0) np = 0; else if (np > 2) np = 2
        Hn[i] = nh; Pn[i] = np
      }
    }
    let t = H; H = Hn; Hn = t
    t = P; P = Pn; Pn = t
  }

  const step = (dt: number) => {
    accum += dt
    const budget = Math.min(4, Math.floor(accum / (1 / 60)))
    for (let k = 0; k < budget; k++) sub()
    if (budget > 0) accum -= budget * (1 / 60)
    else if (accum > 0.2) accum = 0.05
  }

  const render = () => {
    // single-layer fallback — dominant species per cell.
    const lines: string[] = new Array(rows)
    for (let y = 0; y < rows; y++) {
      let line = ''
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x
        const v = Math.min(1, Math.max(P[i] * 1.4, H[i] * 0.7))
        line += rampChar(v)
      }
      lines[y] = line
    }
    return lines.join('\n')
  }

  const renderLayers = (): SimLayer[] => {
    const preyLines: string[] = new Array(rows)
    const predLines: string[] = new Array(rows)
    for (let y = 0; y < rows; y++) {
      let prey = ''
      let pred = ''
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x
        const h = H[i], p = P[i]
        // predators paint on top of prey — a cell with both shows the predator
        if (p >= PRED_THRESH) {
          pred += rampChar(Math.min(1, (p - PRED_THRESH) / 0.9 + 0.2))
          prey += ' '
        } else if (h >= PREY_THRESH) {
          prey += rampChar(Math.min(1, (h - PREY_THRESH) / 1.2))
          pred += ' '
        } else {
          prey += ' '
          pred += ' '
        }
      }
      preyLines[y] = prey
      predLines[y] = pred
    }
    return [
      { text: preyLines.join('\n'), color: SPECIES_COLOR.prey, opacity: 0.9 },
      { text: predLines.join('\n'), color: SPECIES_COLOR.predator, opacity: 1 },
    ]
  }

  const totals = () => {
    let sh = 0, sp = 0
    for (let i = 0; i < H.length; i++) { sh += H[i]; sp += P[i] }
    const N = Math.max(1, H.length)
    return { meanH: sh / N, meanP: sp / N }
  }

  const metrics = () => {
    const { meanH, meanP } = totals()
    return {
      'mean prey':     meanH,
      'mean predator': meanP,
      'P/H ratio':     meanH > 1e-6 ? meanP / meanH : 0,
    }
  }

  const params = () => ({
    'a (prey growth)':    A.toFixed(2),
    'b (predation)':      B.toFixed(2),
    'c (prey→pred)':      C.toFixed(2),
    'd (pred mortality)': D.toFixed(2),
    'Dh': DH.toFixed(2),
    'Dp': DP.toFixed(2),
  })

  const phase = (): PhaseSample => {
    const { meanH, meanP } = totals()
    return { x: meanH, y: meanP }
  }

  const phaseSpec = (): PhaseSpec => ({
    xLabel: 'prey',
    yLabel: 'pred',
    xMin: 0, xMax: 1.2,
    yMin: 0, yMax: 1.0,
  })

  return { reset, reseed: seed, step, render, renderLayers, metrics, params, phase, phaseSpec }
}