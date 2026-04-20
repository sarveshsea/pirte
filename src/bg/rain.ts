import type { BgProgram } from './program'

const KATAKANA =
  'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789:;<>/\\{}[]#'

type Cell = { ch: string; intensity: number }
type Drop = { col: number; y: number; speed: number }

export function createRain(): BgProgram {
  let cols = 0, rows = 0, cell = 24
  let grid: Cell[] = []
  let drops: Drop[] = []

  return {
    name: 'rain',
    reset(c, r, cs) {
      cols = c; rows = r; cell = cs
      grid = new Array(cols * rows)
      for (let i = 0; i < grid.length; i++) grid[i] = { ch: ' ', intensity: 0 }
      // fewer drops than cols so the rain feels sparse + deliberate
      const nDrops = Math.max(8, Math.floor(cols * 0.55))
      drops = Array.from({ length: nDrops }, () => ({
        col: Math.floor(Math.random() * cols),
        y: -Math.random() * rows,
        speed: 3 + Math.random() * 7, // rows per second
      }))
    },
    frame(ctx, _t, dt, cursor, ripples) {
      // global trail decay
      for (let i = 0; i < grid.length; i++) {
        if (grid[i].intensity > 0) grid[i].intensity = Math.max(0, grid[i].intensity - dt * 0.6)
      }

      // advance drops, paint heads
      for (const d of drops) {
        d.y += d.speed * dt
        const iy = Math.floor(d.y)
        if (iy >= 0 && iy < rows) {
          const k = iy * cols + d.col
          const ch = KATAKANA[Math.floor(Math.random() * KATAKANA.length)]
          // bright head
          if (grid[k].intensity < 1) grid[k] = { ch, intensity: 1 }
          // trail above head (set once, decays naturally)
          if (iy - 1 >= 0) {
            const k2 = (iy - 1) * cols + d.col
            if (grid[k2].intensity < 0.5) grid[k2] = { ch, intensity: 0.5 }
          }
        }
        if (d.y > rows + 4 && Math.random() < 0.03) {
          d.y = -Math.random() * 6
          d.col = Math.floor(Math.random() * cols)
          d.speed = 3 + Math.random() * 7
        }
      }

      // cursor wake — small radius, brightens nearby cells
      if (cursor.active) {
        const ccx = cursor.x / cell
        const ccy = cursor.y / cell
        const r = 3.2
        const r2 = r * r
        const minX = Math.max(0, Math.floor(ccx - r))
        const maxX = Math.min(cols - 1, Math.ceil(ccx + r))
        const minY = Math.max(0, Math.floor(ccy - r))
        const maxY = Math.min(rows - 1, Math.ceil(ccy + r))
        for (let y = minY; y <= maxY; y++) {
          for (let x = minX; x <= maxX; x++) {
            const dx = x + 0.5 - ccx
            const dy = y + 0.5 - ccy
            const d2 = dx * dx + dy * dy
            if (d2 > r2) continue
            const k = y * cols + x
            const bump = (1 - d2 / r2) * 0.25
            if (grid[k].intensity < 0.2) grid[k].ch = KATAKANA[Math.floor(Math.random() * KATAKANA.length)]
            grid[k].intensity = Math.min(1, grid[k].intensity + bump)
          }
        }
      }

      // click ripples — expanding ring of brighter glyphs
      for (const rip of ripples) {
        const radius = rip.age * 24  // px/s
        const rC = radius / cell
        const ringW = 1.2
        const ccx = rip.x / cell, ccy = rip.y / cell
        const minX = Math.max(0, Math.floor(ccx - rC - ringW))
        const maxX = Math.min(cols - 1, Math.ceil(ccx + rC + ringW))
        const minY = Math.max(0, Math.floor(ccy - rC - ringW))
        const maxY = Math.min(rows - 1, Math.ceil(ccy + rC + ringW))
        const alpha = Math.max(0, 1 - rip.age * 1.8)
        for (let y = minY; y <= maxY; y++) {
          for (let x = minX; x <= maxX; x++) {
            const dx = x + 0.5 - ccx
            const dy = y + 0.5 - ccy
            const d = Math.sqrt(dx * dx + dy * dy)
            if (Math.abs(d - rC) > ringW) continue
            const k = y * cols + x
            if (grid[k].intensity < 0.15) grid[k].ch = KATAKANA[Math.floor(Math.random() * KATAKANA.length)]
            grid[k].intensity = Math.min(1, grid[k].intensity + 0.5 * alpha)
          }
        }
      }

      // paint
      ctx.font = `${Math.floor(cell * 0.7)}px "JetBrains Mono Variable", monospace`
      ctx.textBaseline = 'top'
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const c = grid[y * cols + x]
          if (c.intensity <= 0.01) continue
          const a = Math.min(0.28, c.intensity * 0.26)
          ctx.fillStyle = `rgba(200, 220, 220, ${a.toFixed(3)})`
          ctx.fillText(c.ch, x * cell + 2, y * cell + 2)
        }
      }
    },
  }
}
