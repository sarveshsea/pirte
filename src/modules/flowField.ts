import type { Scene } from './scene'
import { noise2 } from '../lib/perlin'

const RAMP = ' .·-:=+*#%@'

export function createFlowField(): Scene {
  let cols = 0, rows = 0
  let particles: { x: number; y: number }[] = []
  let heat: Float32Array = new Float32Array(0)

  const reset = (c: number, r: number) => {
    cols = c; rows = r
    heat = new Float32Array(cols * rows)
    particles = Array.from({ length: Math.max(60, Math.floor(cols * rows / 40)) }, () => ({
      x: Math.random() * cols,
      y: Math.random() * rows,
    }))
  }

  const frame = (t: number) => {
    const T = t * 0.0002
    for (let i = 0; i < heat.length; i++) heat[i] *= 0.92
    for (const p of particles) {
      const nx = noise2(p.x * 0.08, p.y * 0.08 + T)
      const ny = noise2(p.x * 0.08 + 31.7, p.y * 0.08 + T + 17.3)
      const a = Math.atan2(ny, nx) * 2
      p.x += Math.cos(a) * 0.8
      p.y += Math.sin(a) * 0.8
      if (p.x < 0) p.x += cols
      if (p.x >= cols) p.x -= cols
      if (p.y < 0) p.y += rows
      if (p.y >= rows) p.y -= rows
      const ix = Math.floor(p.x), iy = Math.floor(p.y)
      heat[iy * cols + ix] = Math.min(1, heat[iy * cols + ix] + 0.4)
    }
    const lines: string[] = []
    for (let y = 0; y < rows; y++) {
      let line = ''
      for (let x = 0; x < cols; x++) {
        const v = heat[y * cols + x]
        line += RAMP[Math.min(RAMP.length - 1, Math.floor(v * RAMP.length))]
      }
      lines.push(line)
    }
    return lines.join('\n')
  }

  return { name: 'flow field', reset, frame }
}
