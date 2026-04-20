import type { BgProgram } from './program'

// conway's life rendered as ultra-low-opacity dots on the grid.
// reseeds softly when the population collapses so the page never goes dead.

export function createLife(): BgProgram {
  let cols = 0, rows = 0, cell = 24
  let a = new Uint8Array(0)
  let b = new Uint8Array(0)
  let lastStep = 0

  const seed = () => {
    for (let i = 0; i < a.length; i++) a[i] = Math.random() < 0.18 ? 1 : 0
  }

  return {
    name: 'life',
    reset(c, r, cs) {
      cols = c; rows = r; cell = cs
      a = new Uint8Array(cols * rows)
      b = new Uint8Array(cols * rows)
      seed()
      lastStep = 0
    },
    frame(ctx, t, _dt, cursor, ripples) {
      // step ~8 hz
      if (t - lastStep > 125) {
        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            let n = 0
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue
                const nx = (x + dx + cols) % cols
                const ny = (y + dy + rows) % rows
                n += a[ny * cols + nx]
              }
            }
            const alive = a[y * cols + x]
            b[y * cols + x] = alive ? (n === 2 || n === 3 ? 1 : 0) : (n === 3 ? 1 : 0)
          }
        }
        ;[a, b] = [b, a]
        lastStep = t
        let pop = 0
        for (let i = 0; i < a.length; i++) pop += a[i]
        if (pop < cols * rows * 0.015) seed()
      }

      // cursor seeds new cells around the pointer
      if (cursor.active) {
        const cx = Math.floor(cursor.x / cell)
        const cy = Math.floor(cursor.y / cell)
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx, ny = cy + dy
            if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
            if (Math.random() < 0.03) a[ny * cols + nx] = 1
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
            if (Math.random() < alpha * 0.6) a[y * cols + x] = 1
          }
        }
      }

      // render — tiny dots, low opacity
      const size = Math.max(1, Math.floor(cell * 0.12))
      ctx.fillStyle = 'rgba(220, 220, 230, 0.18)'
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          if (!a[y * cols + x]) continue
          ctx.fillRect(x * cell + cell / 2 - size / 2, y * cell + cell / 2 - size / 2, size, size)
        }
      }
    },
  }
}
