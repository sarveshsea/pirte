import type { Scene } from './scene'

// lenia — continuous cellular automata (bert chan, 2018)
// grid ∈ [0,1], step: grid += dt * growth(kernel ∗ grid)
// kernel: radial gaussian ring, growth: gaussian around mu

export type LeniaPreset = { label: string; mu: number; sigma: number }

export const LENIA_PRESETS: LeniaPreset[] = [
  { label: 'orbium',   mu: 0.150, sigma: 0.017 },
  { label: 'hydra',    mu: 0.156, sigma: 0.0224 },
  { label: 'ciliate',  mu: 0.138, sigma: 0.0185 },
  { label: 'flagella', mu: 0.170, sigma: 0.015 },
  { label: 'plasmid',  mu: 0.148, sigma: 0.020 },
]

export type LeniaOptions = {
  radius?: number
  dt?: number
  mu?: number
  sigma?: number
  ramp?: string
  stepMs?: number
}

export type LeniaScene = Scene & {
  reseed(): void
  setPreset(mu: number, sigma: number): void
}

export function createLenia(opts: LeniaOptions = {}): LeniaScene {
  const R = opts.radius ?? 10
  const DT = opts.dt ?? 0.12
  const stepMs = opts.stepMs ?? 55
  const ramp = opts.ramp ?? ' .·:+=*xX%#@█'
  let mu = opts.mu ?? 0.15
  let sigma = opts.sigma ?? 0.017

  const KSIZE = R * 2 + 1
  const K = new Float32Array(KSIZE * KSIZE)
  let kSum = 0
  for (let y = -R; y <= R; y++) {
    for (let x = -R; x <= R; x++) {
      const d = Math.hypot(x, y) / R
      let v = 0
      if (d > 0 && d < 1) {
        const s = (d - 0.5) / 0.15
        v = Math.exp(-0.5 * s * s)
      }
      K[(y + R) * KSIZE + (x + R)] = v
      kSum += v
    }
  }
  if (kSum > 0) for (let i = 0; i < K.length; i++) K[i] /= kSum

  let cols = 0, rows = 0
  let grid: Float32Array = new Float32Array(0)
  let next: Float32Array = new Float32Array(0)
  let stepAt = 0

  const seed = () => {
    grid.fill(0)
    const blobs = 3 + ((Math.random() * 4) | 0)
    for (let b = 0; b < blobs; b++) {
      const cx = (Math.random() * cols) | 0
      const cy = (Math.random() * rows) | 0
      const rr = 5 + ((Math.random() * 7) | 0)
      for (let dy = -rr; dy <= rr; dy++) {
        for (let dx = -rr; dx <= rr; dx++) {
          const d2 = dx * dx + dy * dy
          if (d2 > rr * rr) continue
          const gx = (((cx + dx) % cols) + cols) % cols
          const gy = (((cy + dy) % rows) + rows) % rows
          const falloff = 1 - d2 / (rr * rr)
          const v = Math.random() * falloff
          const i = gy * cols + gx
          if (v > grid[i]) grid[i] = Math.min(1, v + 0.15)
        }
      }
    }
  }

  const reset = (c: number, r: number) => {
    cols = c
    rows = r
    grid = new Float32Array(cols * rows)
    next = new Float32Array(cols * rows)
    seed()
    stepAt = 0
  }

  const step = () => {
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        let s = 0
        for (let ky = -R; ky <= R; ky++) {
          const yy = (((y + ky) % rows) + rows) % rows
          const row = yy * cols
          const krow = (ky + R) * KSIZE
          for (let kx = -R; kx <= R; kx++) {
            const xx = (((x + kx) % cols) + cols) % cols
            s += grid[row + xx] * K[krow + (kx + R)]
          }
        }
        const sd = (s - mu) / sigma
        const g = 2 * Math.exp(-0.5 * sd * sd) - 1
        let v = grid[y * cols + x] + DT * g
        if (v < 0) v = 0
        else if (v > 1) v = 1
        next[y * cols + x] = v
      }
    }
    const tmp = grid
    grid = next
    next = tmp
  }

  const frame = (t: number) => {
    if (t - stepAt > stepMs) {
      step()
      stepAt = t
    }
    const last = ramp.length - 1
    const lines: string[] = new Array(rows)
    for (let y = 0; y < rows; y++) {
      let line = ''
      for (let x = 0; x < cols; x++) {
        const v = grid[y * cols + x]
        const i = v <= 0 ? 0 : v >= 1 ? last : Math.round(v * last)
        line += ramp[i]
      }
      lines[y] = line
    }
    return lines.join('\n')
  }

  return {
    name: 'lenia',
    reset,
    frame,
    reseed: () => seed(),
    setPreset: (m, s) => { mu = m; sigma = s },
  }
}
