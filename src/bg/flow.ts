import { noise2 } from '../lib/perlin'
import type { BgProgram } from './program'

// glyphs that feel like drifting sediment, low-density
const GLYPHS = '.,·-~:=+*'

export function createFlow(): BgProgram {
  let cols = 0, rows = 0, cell = 24
  let heat: Float32Array = new Float32Array(0)

  return {
    name: 'flow',
    reset(c, r, cs) {
      cols = c; rows = r; cell = cs
      heat = new Float32Array(cols * rows)
    },
    frame(ctx, t, dt, cursor, ripples) {
      const phase = t * 0.00008
      // advect: each cell samples perlin and nudges intensity from a neighbour
      for (let i = 0; i < heat.length; i++) heat[i] *= 0.985
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const n = noise2(x * 0.08 + phase, y * 0.08)
          const ang = n * Math.PI * 2
          const px = x - Math.cos(ang)
          const py = y - Math.sin(ang)
          const ix = Math.floor(px), iy = Math.floor(py)
          if (ix < 0 || ix >= cols || iy < 0 || iy >= rows) continue
          const src = heat[iy * cols + ix]
          heat[y * cols + x] = Math.max(heat[y * cols + x], src * 0.96)
        }
      }
      // sprinkle low-level seeds so the field doesn't die
      for (let i = 0; i < 6; i++) {
        const x = Math.floor(Math.random() * cols)
        const y = Math.floor(Math.random() * rows)
        heat[y * cols + x] = Math.min(1, heat[y * cols + x] + 0.5)
      }
      // cursor leaves hot splats
      if (cursor.active) {
        const cx = Math.floor(cursor.x / cell)
        const cy = Math.floor(cursor.y / cell)
        const rad = 3
        for (let dy = -rad; dy <= rad; dy++) {
          for (let dx = -rad; dx <= rad; dx++) {
            const nx = cx + dx, ny = cy + dy
            if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
            const d = Math.hypot(dx, dy)
            if (d > rad) continue
            heat[ny * cols + nx] = Math.min(1, heat[ny * cols + nx] + (1 - d / rad) * 0.5 * dt * 60)
          }
        }
      }
      for (const rip of ripples) {
        const rC = rip.age * 24 / cell
        const ccx = rip.x / cell, ccy = rip.y / cell
        const alpha = Math.max(0, 1 - rip.age * 1.8)
        const minX = Math.max(0, Math.floor(ccx - rC - 1))
        const maxX = Math.min(cols - 1, Math.ceil(ccx + rC + 1))
        const minY = Math.max(0, Math.floor(ccy - rC - 1))
        const maxY = Math.min(rows - 1, Math.ceil(ccy + rC + 1))
        for (let y = minY; y <= maxY; y++) {
          for (let x = minX; x <= maxX; x++) {
            const d = Math.hypot(x + 0.5 - ccx, y + 0.5 - ccy)
            if (Math.abs(d - rC) > 1) continue
            heat[y * cols + x] = Math.min(1, heat[y * cols + x] + 0.4 * alpha)
          }
        }
      }

      ctx.font = `${Math.floor(cell * 0.6)}px "JetBrains Mono Variable", monospace`
      ctx.textBaseline = 'top'
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const v = heat[y * cols + x]
          if (v < 0.05) continue
          const gi = Math.min(GLYPHS.length - 1, Math.floor(v * GLYPHS.length))
          const a = Math.min(0.22, v * 0.25)
          ctx.fillStyle = `rgba(200, 215, 235, ${a.toFixed(3)})`
          ctx.fillText(GLYPHS[gi], x * cell + 3, y * cell + 4)
        }
      }
    },
  }
}
