// fitzhugh-nagumo excitable media.
// 2-variable reduction of hodgkin-huxley: u (fast, voltage-like) + v (slow
// recovery). with spatial diffusion of u, a broken wavefront curls into a
// rotating spiral — the same topology seen in cardiac fibrillation, neural
// spreading depression, and the belousov-zhabotinsky reaction dish.

import { rampChar, type SimInstance } from './index'

const Du = 1.0
const EPS = 0.015
const ALPHA = 0.80
const BETA = 0.70
const DT = 0.18

export function createExcitable(): SimInstance {
  let cols = 0, rows = 0
  let u: Float32Array = new Float32Array(0)
  let v: Float32Array = new Float32Array(0)
  let un: Float32Array = new Float32Array(0)
  let vn: Float32Array = new Float32Array(0)
  let accum = 0
  let probeHistory: number[] = []

  const seed = () => {
    // broken-wavefront initial condition to spawn a spiral.
    // top-left quadrant excited (high u); top-right refractory (high v).
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x
        if (y < rows / 2) {
          u[i] = x < cols / 2 ? 1.0 : 0.0
          v[i] = x >= cols / 2 ? 1.0 : 0.0
        } else {
          u[i] = 0; v[i] = 0
        }
      }
    }
    // light noise so the spiral is asymmetric
    for (let i = 0; i < u.length; i++) {
      u[i] += (Math.random() - 0.5) * 0.02
      v[i] += (Math.random() - 0.5) * 0.02
    }
    probeHistory = []
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
    for (let y = 0; y < rows; y++) {
      const ym = (y - 1 + rows) % rows
      const yp = (y + 1) % rows
      for (let x = 0; x < cols; x++) {
        const xm = (x - 1 + cols) % cols
        const xp = (x + 1) % cols
        const i  = y * cols + x
        const lu = u[y * cols + xm] + u[y * cols + xp] + u[ym * cols + x] + u[yp * cols + x] - 4 * u[i]
        const ui = u[i], vi = v[i]
        un[i] = ui + DT * (Du * lu + ui - ui * ui * ui - vi)
        vn[i] = vi + DT * EPS * (ui - ALPHA * vi - BETA)
      }
    }
    let t = u; u = un; un = t
    t = v; v = vn; vn = t
    // probe a fixed cell (3/4 across, 1/2 down) for period detection
    const px = Math.floor(cols * 0.75)
    const py = Math.floor(rows * 0.5)
    probeHistory.push(u[py * cols + px])
    if (probeHistory.length > 200) probeHistory.shift()
  }

  const step = (dt: number) => {
    accum += dt
    const budget = Math.min(6, Math.floor(accum / (1 / 60)))
    for (let k = 0; k < budget; k++) sub()
    if (budget > 0) accum -= budget * (1 / 60)
    else if (accum > 0.2) accum = 0.05
  }

  const render = () => {
    // u ∈ [-1, 1] roughly — remap to [0,1]
    const lines: string[] = new Array(rows)
    for (let y = 0; y < rows; y++) {
      let line = ''
      for (let x = 0; x < cols; x++) {
        const val = (u[y * cols + x] + 1) * 0.5
        line += rampChar(Math.max(0, Math.min(1, val)))
      }
      lines[y] = line
    }
    return lines.join('\n')
  }

  // autocorrelation-based period detection on the probe cell.
  // finds the first local max of the autocorrelation after lag 5.
  const detectPeriod = (): number => {
    const n = probeHistory.length
    if (n < 40) return 0
    let mean = 0
    for (let i = 0; i < n; i++) mean += probeHistory[i]
    mean /= n
    let best = 0, bestVal = -Infinity
    for (let lag = 5; lag < Math.floor(n / 2); lag++) {
      let acf = 0
      for (let i = 0; i < n - lag; i++) acf += (probeHistory[i] - mean) * (probeHistory[i + lag] - mean)
      if (acf > bestVal) { bestVal = acf; best = lag }
    }
    return best
  }

  const metrics = () => {
    let activeCount = 0
    let sumU = 0, sumV = 0
    const N = u.length
    for (let i = 0; i < N; i++) {
      sumU += u[i]; sumV += v[i]
      if (u[i] > 0.5) activeCount++
    }
    return {
      'mean u': N === 0 ? 0 : sumU / N,
      'mean v': N === 0 ? 0 : sumV / N,
      'activity': N === 0 ? 0 : activeCount / N,
      'period τ': detectPeriod(),
    }
  }

  const params = () => ({
    'Du': Du.toFixed(2),
    'ε': EPS.toFixed(3),
    'α': ALPHA.toFixed(2),
    'β': BETA.toFixed(2),
    'dt': DT.toFixed(2),
  })

  return { reset, reseed: seed, step, render, metrics, params }
}
