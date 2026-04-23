// gene toggle switch — spatial gardner-cantor-collins on a grid.
//
// each cell expresses two mutually-repressing genes a, b. the hill-form
// kinetics have two stable fixed points ("a high" and "b high") separated
// by an unstable saddle. add langevin noise and cells commit stochastically;
// add a bit of inter-cell coupling and the dish self-organizes into
// coarse-grained domains of each phenotype with a rough front between them.
//
//   da/dt = α₁ / (1 + bⁿ) − a + ξ_a
//   db/dt = α₂ / (1 + aⁿ) − b + ξ_b
//
// (gardner · cantor · collins · "construction of a genetic toggle switch
//  in escherichia coli" · nature 403 · 2000)

import {
  SPECIES_COLOR,
  type SimInstance, type SimLayer, type PhaseSample, type PhaseSpec,
} from './index'

const ALPHA1 = 3.0
const ALPHA2 = 3.0
const N_HILL = 3
const DIFF   = 0.08          // neighbor coupling (shared lac-like metabolite)
const NOISE  = 0.35          // langevin noise amplitude
const DT     = 0.04

// classify a cell by (a, b) dominance for layered rendering
function classify(a: number, b: number): 'A' | 'B' | 'mid' | 'off' {
  const maxv = Math.max(a, b)
  if (maxv < 0.2) return 'off'
  const ratio = a / Math.max(a, b, 1e-6)
  if (ratio > 0.62) return 'A'
  if (ratio < 0.38) return 'B'
  return 'mid'
}

export function createToggleSwitch(): SimInstance {
  let cols = 0, rows = 0
  let A: Float32Array = new Float32Array(0)
  let B: Float32Array = new Float32Array(0)
  let An: Float32Array = new Float32Array(0)
  let Bn: Float32Array = new Float32Array(0)
  let accum = 0

  const seed = () => {
    for (let i = 0; i < A.length; i++) {
      // start near the unstable fixed point with tiny jitter so noise decides
      A[i] = 0.7 + (Math.random() - 0.5) * 0.4
      B[i] = 0.7 + (Math.random() - 0.5) * 0.4
    }
  }

  const reset = (c: number, r: number) => {
    cols = c; rows = r
    A  = new Float32Array(cols * rows)
    B  = new Float32Array(cols * rows)
    An = new Float32Array(cols * rows)
    Bn = new Float32Array(cols * rows)
    seed()
    accum = 0
  }

  const sub = () => {
    const sqrtDT = Math.sqrt(DT)
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
        const la = A[iL] + A[iR] + A[iU] + A[iD] - 4 * A[i]
        const lb = B[iL] + B[iR] + B[iU] + B[iD] - 4 * B[i]
        const a = A[i], b = B[i]
        const bn = Math.pow(b, N_HILL)
        const an = Math.pow(a, N_HILL)
        const da = ALPHA1 / (1 + bn) - a + DIFF * la
        const db = ALPHA2 / (1 + an) - b + DIFF * lb
        // simple euler-maruyama noise
        const xi_a = (Math.random() - 0.5) * 2
        const xi_b = (Math.random() - 0.5) * 2
        let na = a + DT * da + NOISE * sqrtDT * xi_a
        let nb = b + DT * db + NOISE * sqrtDT * xi_b
        if (na < 0) na = 0; else if (na > 5) na = 5
        if (nb < 0) nb = 0; else if (nb > 5) nb = 5
        An[i] = na; Bn[i] = nb
      }
    }
    let t = A; A = An; An = t
    t = B; B = Bn; Bn = t
  }

  const step = (dt: number) => {
    accum += dt
    const budget = Math.min(6, Math.floor(accum / (1 / 60)))
    for (let k = 0; k < budget; k++) sub()
    if (budget > 0) accum -= budget * (1 / 60)
    else if (accum > 0.2) accum = 0.05
  }

  const render = () => {
    // fallback: single glyph per cell based on dominant gene
    const lines: string[] = new Array(rows)
    for (let y = 0; y < rows; y++) {
      let line = ''
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x
        const cls = classify(A[i], B[i])
        line += cls === 'A' ? 'a' : cls === 'B' ? 'b' : cls === 'mid' ? '±' : ' '
      }
      lines[y] = line
    }
    return lines.join('\n')
  }

  const renderLayers = (): SimLayer[] => {
    const aLines: string[] = new Array(rows)
    const bLines: string[] = new Array(rows)
    const midLines: string[] = new Array(rows)
    for (let y = 0; y < rows; y++) {
      let aL = '', bL = '', mL = ''
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x
        const cls = classify(A[i], B[i])
        if (cls === 'A') { aL += A[i] > 2 ? 'A' : 'a'; bL += ' '; mL += ' ' }
        else if (cls === 'B') { bL += B[i] > 2 ? 'B' : 'b'; aL += ' '; mL += ' ' }
        else if (cls === 'mid') { mL += '±'; aL += ' '; bL += ' ' }
        else { aL += ' '; bL += ' '; mL += ' ' }
      }
      aLines[y] = aL; bLines[y] = bL; midLines[y] = mL
    }
    return [
      { text: midLines.join('\n'), color: SPECIES_COLOR.mixed, opacity: 0.55 },
      { text: aLines.join('\n'),   color: SPECIES_COLOR.geneA, opacity: 0.95 },
      { text: bLines.join('\n'),   color: SPECIES_COLOR.geneB, opacity: 0.95 },
    ]
  }

  const stats = () => {
    const N = Math.max(1, A.length)
    let sa = 0, sb = 0, countA = 0, countB = 0
    for (let i = 0; i < A.length; i++) {
      sa += A[i]; sb += B[i]
      const cls = classify(A[i], B[i])
      if (cls === 'A') countA++
      else if (cls === 'B') countB++
    }
    return {
      meanA: sa / N,
      meanB: sb / N,
      fracA: countA / N,
      fracB: countB / N,
    }
  }

  const metrics = () => {
    const { meanA, meanB, fracA, fracB } = stats()
    return {
      'mean [A]':  meanA,
      'mean [B]':  meanB,
      'fraction A': fracA,
      'fraction B': fracB,
    }
  }

  const params = () => ({
    'α₁': ALPHA1.toFixed(2),
    'α₂': ALPHA2.toFixed(2),
    'hill n': String(N_HILL),
    'diffusion': DIFF.toFixed(2),
    'noise': NOISE.toFixed(2),
    'dt': DT.toFixed(3),
  })

  const phase = (): PhaseSample => {
    const { fracA, fracB } = stats()
    return { x: fracA, y: fracB }
  }

  const phaseSpec = (): PhaseSpec => ({
    xLabel: 'frac A',
    yLabel: 'frac B',
    xMin: 0, xMax: 1,
    yMin: 0, yMax: 1,
  })

  return { reset, reseed: seed, step, render, renderLayers, metrics, params, phase, phaseSpec }
}