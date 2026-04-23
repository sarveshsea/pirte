// belousov-zhabotinsky reaction — oregonator reduction on a 2d grid.
//
// the bz reaction is a classical autocatalytic chemistry: ce(iv) oxidizes
// malonic acid via bromous intermediates and oscillates between red and
// blue as the ce(iii)/ce(iv) ratio cycles. field & noyes (1974) reduced
// the full mechanism to a 2-variable oregonator:
//
//   ε · du/dt = u(1 − u) − f · v · (u − q)/(u + q) + Du · ∇²u
//         dv/dt = u − v + Dv · ∇²v
//
// u: HBrO2 (activator),  v: Ce(IV) (catalyst / visible color).
// on a grid with a broken-front initial condition this spins off classic
// spiral waves — real, observable chemistry.

import {
  rampChar, SPECIES_COLOR,
  type SimInstance, type SimLayer, type PhaseSample, type PhaseSpec,
} from './index'

const EPSILON = 0.04
const F       = 1.4
const Q       = 2e-3
const DU      = 1.0
const DV      = 0.0     // v doesn't diffuse in the classical reduction; we keep it at 0
const DT      = 0.01

// threshold below which a cell is treated as "clear solution"
const U_THRESH = 0.08
const V_THRESH = 0.12

export function createBelousovZhabotinsky(): SimInstance {
  let cols = 0, rows = 0
  let u: Float32Array = new Float32Array(0)
  let v: Float32Array = new Float32Array(0)
  let un: Float32Array = new Float32Array(0)
  let vn: Float32Array = new Float32Array(0)
  let accum = 0

  const seed = () => {
    // broken-front IC: left half excited, lower band refractory → spirals
    const cx = Math.floor(cols / 2)
    const cy = Math.floor(rows / 2)
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x
        if (x < cx && y > cy - 2) {
          u[i] = 0.9; v[i] = 0.0
        } else if (x >= cx && y > cy) {
          u[i] = 0.0; v[i] = 0.4
        } else {
          u[i] = 0.01 + Math.random() * 0.02
          v[i] = 0.01 + Math.random() * 0.02
        }
      }
    }
  }

  const reset = (c: number, r: number) => {
    cols = c; rows = r
    u  = new Float32Array(cols * rows)
    v  = new Float32Array(cols * rows)
    un = new Float32Array(cols * rows)
    vn = new Float32Array(cols * rows)
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
        const lu = u[iL] + u[iR] + u[iU] + u[iD] - 4 * u[i]
        const uv = u[i], vv = v[i]
        const reaction = (1 / EPSILON) * (uv * (1 - uv) - F * vv * (uv - Q) / (uv + Q))
        let nu = uv + DT * (reaction + DU * lu)
        let nv = vv + DT * (uv - vv + DV * lu)
        if (nu < 0) nu = 0; else if (nu > 1) nu = 1
        if (nv < 0) nv = 0; else if (nv > 1) nv = 1
        un[i] = nu; vn[i] = nv
      }
    }
    let t = u; u = un; un = t
    t = v; v = vn; vn = t
  }

  const step = (dt: number) => {
    accum += dt
    // oregonator wants many tiny substeps — it's stiff at these ε
    const budget = Math.min(20, Math.floor(accum / (1 / 60)))
    for (let k = 0; k < budget; k++) sub()
    if (budget > 0) accum -= budget * (1 / 60)
    else if (accum > 0.2) accum = 0.05
  }

  const render = () => {
    const lines: string[] = new Array(rows)
    for (let y = 0; y < rows; y++) {
      let line = ''
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x
        const val = Math.min(1, Math.max(u[i], v[i] * 0.9))
        line += rampChar(val)
      }
      lines[y] = line
    }
    return lines.join('\n')
  }

  const renderLayers = (): SimLayer[] => {
    const uLines: string[] = new Array(rows)
    const vLines: string[] = new Array(rows)
    for (let y = 0; y < rows; y++) {
      let uL = '', vL = ''
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x
        const uv = u[i], vv = v[i]
        if (uv >= U_THRESH && uv >= vv) {
          uL += rampChar(Math.min(1, (uv - U_THRESH) / 0.9 + 0.2))
          vL += ' '
        } else if (vv >= V_THRESH) {
          vL += rampChar(Math.min(1, (vv - V_THRESH) / 0.6 + 0.2))
          uL += ' '
        } else {
          uL += ' '; vL += ' '
        }
      }
      uLines[y] = uL; vLines[y] = vL
    }
    return [
      // v = Ce(IV) blue-ish catalyst
      { text: vLines.join('\n'), color: SPECIES_COLOR.recovered, opacity: 0.85 },
      // u = HBrO2 warm activator wave
      { text: uLines.join('\n'), color: SPECIES_COLOR.predator, opacity: 1 },
    ]
  }

  const totals = () => {
    const N = Math.max(1, u.length)
    let su = 0, sv = 0
    for (let i = 0; i < u.length; i++) { su += u[i]; sv += v[i] }
    return { meanU: su / N, meanV: sv / N }
  }

  const metrics = () => {
    const { meanU, meanV } = totals()
    return {
      'mean [HBrO2]':    meanU,
      'mean [Ce(IV)]':   meanV,
      'chem potential':  meanU - meanV,
    }
  }

  const params = () => ({
    'ε':  EPSILON.toFixed(3),
    'f':  F.toFixed(2),
    'q':  Q.toExponential(1),
    'Du': DU.toFixed(2),
    'Dv': DV.toFixed(2),
    'dt': DT.toFixed(3),
  })

  const phase = (): PhaseSample => {
    const { meanU, meanV } = totals()
    return { x: meanU, y: meanV }
  }

  const phaseSpec = (): PhaseSpec => ({
    xLabel: 'u',
    yLabel: 'v',
    xMin: 0, xMax: 1,
    yMin: 0, yMax: 1,
  })

  return { reset, reseed: seed, step, render, renderLayers, metrics, params, phase, phaseSpec }
}