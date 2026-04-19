import { noise2 } from '../lib/perlin'

export type CursorMode = 'idle' | 'attract' | 'repel' | 'vortex'

export type Agent = {
  x: number
  y: number
  vx: number
  vy: number
  emit: number
}

export const INTENSITY_RAMP = ' .·-:=+*#%@'

export function makeAgents(n: number, cols: number, rows: number): Agent[] {
  const out: Agent[] = []
  for (let i = 0; i < n; i++) {
    out.push({
      x: Math.random() * cols,
      y: Math.random() * rows,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      emit: 0.8 + Math.random() * 0.4,
    })
  }
  return out
}

export type SpritesState = {
  cols: number
  rows: number
  intensity: Float32Array
  agents: Agent[]
  t: number
  cursor: { x: number; y: number; active: boolean }
  mode: CursorMode
  pulses: { x: number; y: number; r: number; age: number }[]
}

export function initState(cols: number, rows: number, count = 48): SpritesState {
  return {
    cols, rows,
    intensity: new Float32Array(cols * rows),
    agents: makeAgents(count, cols, rows),
    t: 0,
    cursor: { x: cols / 2, y: rows / 2, active: false },
    mode: 'attract',
    pulses: [],
  }
}

export function resize(s: SpritesState, cols: number, rows: number) {
  s.cols = cols
  s.rows = rows
  s.intensity = new Float32Array(cols * rows)
  for (const a of s.agents) {
    a.x = ((a.x / s.cols) * cols) || Math.random() * cols
    a.y = ((a.y / s.rows) * rows) || Math.random() * rows
  }
}

export function spawnPulse(s: SpritesState, x: number, y: number) {
  s.pulses.push({ x, y, r: 0, age: 0 })
}

export function step(s: SpritesState, dt: number) {
  s.t += dt
  const { cols, rows, intensity, agents } = s

  // decay intensity field
  for (let i = 0; i < intensity.length; i++) intensity[i] *= 0.86

  // advance pulses
  for (const p of s.pulses) {
    p.age += dt
    p.r += dt * 30
  }
  s.pulses = s.pulses.filter((p) => p.age < 1.2)

  for (const a of agents) {
    // ambient flow from perlin
    const fx = noise2(a.x * 0.06 + s.t * 0.15, a.y * 0.06) * 2
    const fy = noise2(a.x * 0.06 + 13.7, a.y * 0.06 + s.t * 0.15 + 7.1) * 2
    a.vx += Math.cos(fx) * 0.03
    a.vy += Math.sin(fy) * 0.03

    // cursor force
    if (s.cursor.active && s.mode !== 'idle') {
      const dx = s.cursor.x - a.x
      const dy = s.cursor.y - a.y
      const d2 = dx * dx + dy * dy + 1
      const d = Math.sqrt(d2)
      const falloff = 40 / d2
      if (s.mode === 'attract') {
        a.vx += (dx / d) * falloff
        a.vy += (dy / d) * falloff
      } else if (s.mode === 'repel') {
        a.vx -= (dx / d) * falloff * 1.6
        a.vy -= (dy / d) * falloff * 1.6
      } else if (s.mode === 'vortex') {
        // tangential force
        a.vx += (-dy / d) * falloff * 1.4
        a.vy += (dx / d) * falloff * 1.4
      }
    }

    // pulse kick
    for (const p of s.pulses) {
      const dx = a.x - p.x
      const dy = a.y - p.y
      const d = Math.sqrt(dx * dx + dy * dy) + 0.001
      const ring = Math.max(0, 1 - Math.abs(d - p.r) / 3)
      a.vx += (dx / d) * ring * 1.2
      a.vy += (dy / d) * ring * 1.2
    }

    // damping
    a.vx *= 0.9
    a.vy *= 0.9

    // integrate
    a.x += a.vx
    a.y += a.vy

    // wrap
    if (a.x < 0) a.x += cols
    if (a.x >= cols) a.x -= cols
    if (a.y < 0) a.y += rows
    if (a.y >= rows) a.y -= rows

    // emit gaussian splat
    const ix = Math.floor(a.x)
    const iy = Math.floor(a.y)
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = ix + dx
        const ny = iy + dy
        if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue
        const falloff = 1 / (1 + dx * dx + dy * dy)
        intensity[ny * cols + nx] = Math.min(1.3, intensity[ny * cols + nx] + a.emit * falloff * 0.35)
      }
    }
  }
}

export function render(s: SpritesState): string {
  const { cols, rows, intensity } = s
  const ramp = INTENSITY_RAMP
  const lastIdx = ramp.length - 1
  const lines: string[] = []
  for (let y = 0; y < rows; y++) {
    let line = ''
    for (let x = 0; x < cols; x++) {
      const v = Math.max(0, Math.min(1, intensity[y * cols + x]))
      line += ramp[Math.floor(v * lastIdx)]
    }
    lines.push(line)
  }
  return lines.join('\n')
}
