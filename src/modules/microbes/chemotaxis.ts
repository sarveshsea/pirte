// chemotaxis — berg & brown 1972 run-and-tumble.
// e. coli swim straight ("run") then briefly tumble to a new heading. the
// tumble rate is biased by short-term memory of ligand concentration: if
// things are getting better, keep running; if worse, tumble sooner. this
// single mechanism produces directed drift up a nutrient gradient without
// any actual steering — the organism literally cannot measure a gradient
// instantaneously (it's too small), only a change over time.

import { RAMP, type SimInstance, type PhaseSample, type PhaseSpec } from './index'

const N_AGENTS = 600
const STEP = 0.6           // swim distance per tick
const TUMBLE_BASE = 0.08   // p(tumble) when dc = 0
const TUMBLE_BAD = 0.28    // p(tumble) when concentration decreased
const TUMBLE_GOOD = 0.015  // p(tumble) when concentration increased
const GRADIENT_SIGMA = 0.22  // relative to grid diagonal

export function createChemotaxis(): SimInstance {
  let cols = 0, rows = 0
  let field: Float32Array = new Float32Array(0)   // glucose field
  let ax: Float32Array = new Float32Array(0)
  let ay: Float32Array = new Float32Array(0)
  let ah: Float32Array = new Float32Array(0)
  let lastC: Float32Array = new Float32Array(0)
  let runLen: Float32Array = new Float32Array(0)    // current run length (cells since last tumble)
  let runHistory: number[] = []                     // completed run lengths for mean calc
  let gx = 0, gy = 0
  let accum = 0

  const sampleField = (x: number, y: number) => {
    const xi = Math.max(0, Math.min(cols - 1, Math.round(x)))
    const yi = Math.max(0, Math.min(rows - 1, Math.round(y)))
    return field[yi * cols + xi]
  }

  const rebuildField = () => {
    // single gaussian well, random center
    gx = cols * (0.3 + Math.random() * 0.4)
    gy = rows * (0.3 + Math.random() * 0.4)
    const diag = Math.hypot(cols, rows)
    const sigma = diag * GRADIENT_SIGMA
    const s2 = 2 * sigma * sigma
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const dx = x - gx, dy = y - gy
        field[y * cols + x] = Math.exp(-(dx * dx + dy * dy) / s2)
      }
    }
  }

  const seed = () => {
    for (let i = 0; i < N_AGENTS; i++) {
      // bias initial positions away from the gradient so drift is visible
      ax[i] = Math.random() * cols
      ay[i] = Math.random() * rows
      ah[i] = Math.random() * Math.PI * 2
      lastC[i] = sampleField(ax[i], ay[i])
      runLen[i] = 0
    }
    runHistory = []
  }

  const reset = (c: number, r: number) => {
    cols = c; rows = r
    field = new Float32Array(cols * rows)
    ax = new Float32Array(N_AGENTS)
    ay = new Float32Array(N_AGENTS)
    ah = new Float32Array(N_AGENTS)
    lastC = new Float32Array(N_AGENTS)
    runLen = new Float32Array(N_AGENTS)
    rebuildField()
    seed()
    accum = 0
  }

  const sub = () => {
    for (let i = 0; i < N_AGENTS; i++) {
      // swim
      ax[i] += Math.cos(ah[i]) * STEP
      ay[i] += Math.sin(ah[i]) * STEP
      // wrap (torus) so population stays on-screen
      if (ax[i] < 0) ax[i] += cols
      else if (ax[i] >= cols) ax[i] -= cols
      if (ay[i] < 0) ay[i] += rows
      else if (ay[i] >= rows) ay[i] -= rows
      runLen[i] += 1
      // sample + decide
      const c = sampleField(ax[i], ay[i])
      const dc = c - lastC[i]
      const p = dc > 1e-5 ? TUMBLE_GOOD : dc < -1e-5 ? TUMBLE_BAD : TUMBLE_BASE
      if (Math.random() < p) {
        runHistory.push(runLen[i])
        if (runHistory.length > 120) runHistory.shift()
        runLen[i] = 0
        ah[i] = Math.random() * Math.PI * 2
      }
      lastC[i] = c
    }
  }

  const step = (dt: number) => {
    accum += dt
    const budget = Math.min(4, Math.floor(accum / (1 / 45)))
    for (let k = 0; k < budget; k++) sub()
    if (budget > 0) accum -= budget * (1 / 45)
    else if (accum > 0.2) accum = 0.05
  }

  const render = () => {
    // start with dim gradient
    const dimRamp = RAMP.slice(0, 5)  // 0..4 — very subtle background
    const grid: string[][] = new Array(rows)
    for (let y = 0; y < rows; y++) {
      grid[y] = new Array(cols)
      for (let x = 0; x < cols; x++) {
        const v = field[y * cols + x]
        const idx = Math.floor(Math.max(0, Math.min(dimRamp.length - 1, v * dimRamp.length)))
        grid[y][x] = dimRamp[idx]
      }
    }
    // overlay the gradient peak
    const gxi = Math.max(0, Math.min(cols - 1, Math.round(gx)))
    const gyi = Math.max(0, Math.min(rows - 1, Math.round(gy)))
    grid[gyi][gxi] = '◉'
    // agents
    for (let i = 0; i < N_AGENTS; i++) {
      const x = Math.max(0, Math.min(cols - 1, Math.floor(ax[i])))
      const y = Math.max(0, Math.min(rows - 1, Math.floor(ay[i])))
      grid[y][x] = '@'
    }
    return grid.map((r) => r.join('')).join('\n')
  }

  const metrics = () => {
    let biasCount = 0
    let sumC = 0
    for (let i = 0; i < N_AGENTS; i++) {
      const c = sampleField(ax[i], ay[i])
      sumC += c
      if (c > 0.75) biasCount++
    }
    const meanRun = runHistory.length
      ? runHistory.reduce((a, b) => a + b, 0) / runHistory.length
      : 0
    return {
      'mean run': meanRun,
      'bias ≥0.75': biasCount / N_AGENTS,
      'mean c': sumC / N_AGENTS,
    }
  }

  const params = () => ({
    'agents': `${N_AGENTS}`,
    'step': STEP.toFixed(2),
    'p tumble +': TUMBLE_GOOD.toFixed(3),
    'p tumble 0': TUMBLE_BASE.toFixed(3),
    'p tumble −': TUMBLE_BAD.toFixed(3),
    'σ field': GRADIENT_SIGMA.toFixed(2),
  })

  const phase = (): PhaseSample => {
    // phase: (mean c sampled by population, bias ≥0.75 fraction).
    // population climbing the gradient → both numbers rise together.
    let sumC = 0, bias = 0
    for (let i = 0; i < N_AGENTS; i++) {
      const c = sampleField(ax[i], ay[i])
      sumC += c
      if (c > 0.75) bias++
    }
    return { x: sumC / N_AGENTS, y: bias / N_AGENTS }
  }

  const phaseSpec = (): PhaseSpec => ({
    xLabel: 'mean c',
    yLabel: 'bias',
    xMin: 0, xMax: 1,
    yMin: 0, yMax: 1,
  })

  return { reset, reseed: () => { rebuildField(); seed() }, step, render, metrics, params, phase, phaseSpec }
}
