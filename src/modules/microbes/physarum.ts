// physarum — jones 2010 slime-mold foraging model.
// agents walk a toroidal trail grid; sensors ahead bias the heading toward
// stronger chemical concentrations; each step deposits more chemical; the
// trail diffuses (3x3 box) and decays each tick. this self-reinforcing loop
// produces the branching/network topology real physarum polycephalum uses
// to find optimal transport paths between nutrient sources.

import { rampChar, type SimInstance, type PhaseSample, type PhaseSpec } from './index'

// parameters (jones 2010, tuned for visual clarity at low grid res)
const SA = Math.PI / 4   // sensor angle (±45°)
const RA = Math.PI / 4   // rotation angle when steering
const SO = 9             // sensor offset (cells ahead)
const SS = 1             // step size (cells per tick)
const DEP = 5.0          // deposit amount
const DECAY = 0.90       // trail persistence per tick
const AGENT_DENSITY = 0.15  // fraction of cells with an agent

export function createPhysarum(): SimInstance {
  let cols = 0, rows = 0
  let trail: Float32Array = new Float32Array(0)
  let swap: Float32Array = new Float32Array(0)
  let ax: Float32Array = new Float32Array(0)
  let ay: Float32Array = new Float32Array(0)
  let ah: Float32Array = new Float32Array(0)
  let n = 0
  let accum = 0

  const wrapI = (x: number, max: number) => ((x % max) + max) % max

  const sampleTrail = (x: number, y: number) => {
    const xi = wrapI(Math.round(x), cols)
    const yi = wrapI(Math.round(y), rows)
    return trail[yi * cols + xi]
  }

  const seed = () => {
    trail.fill(0)
    swap.fill(0)
    for (let i = 0; i < n; i++) {
      ax[i] = Math.random() * cols
      ay[i] = Math.random() * rows
      ah[i] = Math.random() * Math.PI * 2
    }
  }

  const reset = (c: number, r: number) => {
    cols = c; rows = r
    trail = new Float32Array(cols * rows)
    swap = new Float32Array(cols * rows)
    n = Math.max(200, Math.floor(cols * rows * AGENT_DENSITY))
    ax = new Float32Array(n)
    ay = new Float32Array(n)
    ah = new Float32Array(n)
    seed()
    accum = 0
  }

  const sub = () => {
    // 1. move + deposit
    for (let i = 0; i < n; i++) {
      const h = ah[i]
      const fx = ax[i] + Math.cos(h) * SO
      const fy = ay[i] + Math.sin(h) * SO
      const lx = ax[i] + Math.cos(h - SA) * SO
      const ly = ay[i] + Math.sin(h - SA) * SO
      const rx = ax[i] + Math.cos(h + SA) * SO
      const ry = ay[i] + Math.sin(h + SA) * SO
      const f = sampleTrail(fx, fy)
      const l = sampleTrail(lx, ly)
      const r = sampleTrail(rx, ry)
      if (f > l && f > r) {
        // keep heading
      } else if (f < l && f < r) {
        // forward is worst — pick a side at random
        ah[i] += (Math.random() < 0.5 ? -RA : RA)
      } else if (l > r) {
        ah[i] -= RA
      } else if (r > l) {
        ah[i] += RA
      }
      // move
      ax[i] = wrapI(ax[i] + Math.cos(ah[i]) * SS, cols)
      ay[i] = wrapI(ay[i] + Math.sin(ah[i]) * SS, rows)
      // deposit
      const gxi = Math.floor(ax[i])
      const gyi = Math.floor(ay[i])
      trail[gyi * cols + gxi] += DEP
    }
    // 2. diffuse 3x3 + decay
    for (let y = 0; y < rows; y++) {
      const ym = (y - 1 + rows) % rows
      const yp = (y + 1) % rows
      for (let x = 0; x < cols; x++) {
        const xm = (x - 1 + cols) % cols
        const xp = (x + 1) % cols
        const s =
          trail[ym * cols + xm] + trail[ym * cols + x] + trail[ym * cols + xp] +
          trail[y  * cols + xm] + trail[y  * cols + x] + trail[y  * cols + xp] +
          trail[yp * cols + xm] + trail[yp * cols + x] + trail[yp * cols + xp]
        swap[y * cols + x] = (s / 9) * DECAY
      }
    }
    const tmp = trail; trail = swap; swap = tmp
  }

  const step = (dt: number) => {
    accum += dt
    // ~30 steps/sec; cap per-frame substeps so we don't spiral after a long pause
    const budget = Math.min(3, Math.floor(accum / (1 / 30)))
    for (let k = 0; k < budget; k++) sub()
    if (budget > 0) accum -= budget * (1 / 30)
    else if (accum > 0.2) accum = 0.05
  }

  const render = () => {
    // normalize by a stable reference — cap of ~8 is a visible mid-tone
    const lines: string[] = new Array(rows)
    for (let y = 0; y < rows; y++) {
      let line = ''
      for (let x = 0; x < cols; x++) {
        const v = trail[y * cols + x]
        line += rampChar(Math.min(1, v / 8))
      }
      lines[y] = line
    }
    return lines.join('\n')
  }

  const metrics = () => {
    let sum = 0
    let max = 0
    let lit = 0
    const N = trail.length
    for (let i = 0; i < N; i++) {
      const v = trail[i]
      sum += v
      if (v > max) max = v
      if (v > 0.25) lit++
    }
    return {
      agents: n,
      coverage: N === 0 ? 0 : lit / N,
      mean: N === 0 ? 0 : sum / N,
      peak: max,
    }
  }

  const params = () => ({
    'SA': '±45°',
    'RA': '45°',
    'SO': `${SO} cells`,
    'deposit': DEP.toFixed(1),
    'decay': DECAY.toFixed(2),
    'density': `${(AGENT_DENSITY * 100).toFixed(0)}%`,
  })

  const phase = (): PhaseSample => {
    // phase: (mean trail density, fraction of lit cells). as the network
    // grows, both rise; at equilibrium they sit in a compact cloud.
    let sum = 0, lit = 0
    const N = trail.length
    for (let i = 0; i < N; i++) {
      sum += trail[i]
      if (trail[i] > 0.25) lit++
    }
    return { x: N === 0 ? 0 : sum / N, y: N === 0 ? 0 : lit / N }
  }

  const phaseSpec = (): PhaseSpec => ({
    xLabel: 'mean',
    yLabel: 'cover',
    xMin: 0, xMax: 2,
    yMin: 0, yMax: 1,
  })

  return { reset, reseed: seed, step, render, metrics, params, phase, phaseSpec }
}
