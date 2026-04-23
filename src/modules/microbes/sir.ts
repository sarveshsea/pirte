// sir epidemic on a 2d contact grid.
//
// each cell holds S + I + R ≈ 1 (susceptible / infected / recovered fractions
// of its local population). infections spread from neighbors via β and drift
// via a bit of self-diffusion; recovery is constant-rate γ.
//
//   dS/dt = −β · S · ⟨I⟩ₙ
//   dI/dt = +β · S · ⟨I⟩ₙ − γ · I
//   dR/dt = +γ · I
//
// ⟨I⟩ₙ is the Moore-neighborhood infected mean, which is what actually
// drives the visible infection wavefront — without it each cell is just a
// mean-field SIR and nothing spatial happens.

import {
  rampChar, SPECIES_COLOR,
  type SimInstance, type SimLayer, type PhaseSample, type PhaseSpec,
} from './index'

const BETA  = 3.6        // per unit infected neighbor density
const GAMMA = 0.32       // recovery rate
const DT    = 0.12

// render thresholds so the three layers don't all paint a dim tail under
// every cell: only draw where that state holds at least this much of the
// local population.
const S_THRESH = 0.12
const I_THRESH = 0.04
const R_THRESH = 0.08

export function createSIR(): SimInstance {
  let cols = 0, rows = 0
  let S: Float32Array = new Float32Array(0)
  let I: Float32Array = new Float32Array(0)
  let R: Float32Array = new Float32Array(0)
  let Sn: Float32Array = new Float32Array(0)
  let In: Float32Array = new Float32Array(0)
  let Rn: Float32Array = new Float32Array(0)
  let accum = 0
  let elapsed = 0

  const seed = () => {
    for (let i = 0; i < S.length; i++) {
      S[i] = 1
      I[i] = 0
      R[i] = 0
    }
    // one or two outbreak sites
    const outbreaks = 1 + (Math.random() < 0.3 ? 1 : 0)
    for (let s = 0; s < outbreaks; s++) {
      const cx = Math.floor(cols * (0.25 + Math.random() * 0.5))
      const cy = Math.floor(rows * (0.25 + Math.random() * 0.5))
      const r = 2
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r) continue
          const x = ((cx + dx) % cols + cols) % cols
          const y = ((cy + dy) % rows + rows) % rows
          const k = y * cols + x
          I[k] = 0.4 + Math.random() * 0.2
          S[k] = 1 - I[k]
        }
      }
    }
    elapsed = 0
  }

  const reset = (c: number, r: number) => {
    cols = c; rows = r
    S  = new Float32Array(cols * rows)
    I  = new Float32Array(cols * rows)
    R  = new Float32Array(cols * rows)
    Sn = new Float32Array(cols * rows)
    In = new Float32Array(cols * rows)
    Rn = new Float32Array(cols * rows)
    seed()
    accum = 0
  }

  const sub = () => {
    // compute Moore-neighborhood mean of I per cell (8-neighbor, toroidal)
    for (let y = 0; y < rows; y++) {
      const ym = (y - 1 + rows) % rows
      const yp = (y + 1) % rows
      for (let x = 0; x < cols; x++) {
        const xm = (x - 1 + cols) % cols
        const xp = (x + 1) % cols
        const iMean =
          (I[ym * cols + xm] + I[ym * cols + x] + I[ym * cols + xp] +
           I[y  * cols + xm] +                     I[y  * cols + xp] +
           I[yp * cols + xm] + I[yp * cols + x] + I[yp * cols + xp]) / 8
        const k = y * cols + x
        const s = S[k], i = I[k], r = R[k]
        const newInfections = BETA * s * iMean
        const recoveries    = GAMMA * i
        let ns = s - DT * newInfections
        let ni = i + DT * (newInfections - recoveries)
        let nr = r + DT * recoveries
        if (ns < 0) ns = 0; if (ns > 1) ns = 1
        if (ni < 0) ni = 0; if (ni > 1) ni = 1
        if (nr < 0) nr = 0; if (nr > 1) nr = 1
        Sn[k] = ns; In[k] = ni; Rn[k] = nr
      }
    }
    let t = S; S = Sn; Sn = t
    t = I; I = In; In = t
    t = R; R = Rn; Rn = t
    elapsed += DT
  }

  const step = (dt: number) => {
    accum += dt
    const budget = Math.min(4, Math.floor(accum / (1 / 60)))
    for (let k = 0; k < budget; k++) sub()
    if (budget > 0) accum -= budget * (1 / 60)
    else if (accum > 0.2) accum = 0.05
  }

  const render = () => {
    // fallback: dominant state per cell as glyph
    const lines: string[] = new Array(rows)
    for (let y = 0; y < rows; y++) {
      let line = ''
      for (let x = 0; x < cols; x++) {
        const k = y * cols + x
        const s = S[k], i = I[k], r = R[k]
        if (i >= I_THRESH && i >= Math.max(s, r) * 0.6) line += rampChar(Math.min(1, i * 1.4 + 0.2))
        else if (r >= R_THRESH && r >= s) line += '∘'
        else if (s >= S_THRESH) line += '·'
        else line += ' '
      }
      lines[y] = line
    }
    return lines.join('\n')
  }

  const renderLayers = (): SimLayer[] => {
    const sLines: string[] = new Array(rows)
    const iLines: string[] = new Array(rows)
    const rLines: string[] = new Array(rows)
    for (let y = 0; y < rows; y++) {
      let sL = '', iL = '', rL = ''
      for (let x = 0; x < cols; x++) {
        const k = y * cols + x
        const s = S[k], i = I[k], r = R[k]
        // infected takes paint priority (hottest visual)
        if (i >= I_THRESH) {
          iL += rampChar(Math.min(1, (i - I_THRESH) / 0.6 + 0.2))
          sL += ' '; rL += ' '
        } else if (r >= R_THRESH && r > s * 0.8) {
          rL += r > 0.6 ? '●' : '∘'
          sL += ' '; iL += ' '
        } else if (s >= S_THRESH) {
          sL += s > 0.7 ? '·' : '˙'
          iL += ' '; rL += ' '
        } else {
          sL += ' '; iL += ' '; rL += ' '
        }
      }
      sLines[y] = sL; iLines[y] = iL; rLines[y] = rL
    }
    return [
      { text: sLines.join('\n'), color: SPECIES_COLOR.prey, opacity: 0.55 },
      { text: rLines.join('\n'), color: SPECIES_COLOR.recovered, opacity: 0.8 },
      { text: iLines.join('\n'), color: SPECIES_COLOR.predator, opacity: 1 },
    ]
  }

  const totals = () => {
    let ss = 0, si = 0, sr = 0
    for (let k = 0; k < S.length; k++) { ss += S[k]; si += I[k]; sr += R[k] }
    const N = Math.max(1, S.length)
    return { meanS: ss / N, meanI: si / N, meanR: sr / N }
  }

  const metrics = () => {
    const { meanS, meanI, meanR } = totals()
    return {
      'susceptible': meanS,
      'infected':    meanI,
      'recovered':   meanR,
      'R_0 approx':  GAMMA > 0 ? (BETA / GAMMA) * meanS : 0,
    }
  }

  const params = () => ({
    'β (contact)':  BETA.toFixed(2),
    'γ (recovery)': GAMMA.toFixed(2),
    'dt':           DT.toFixed(2),
    'neighborhood': 'moore (8)',
  })

  const phase = (): PhaseSample => {
    const { meanS, meanI } = totals()
    return { x: meanS, y: meanI }
  }

  const phaseSpec = (): PhaseSpec => ({
    xLabel: 'S',
    yLabel: 'I',
    xMin: 0, xMax: 1,
    yMin: 0, yMax: 0.6,
  })

  return { reset, reseed: seed, step, render, renderLayers, metrics, params, phase, phaseSpec }
}
