import type { Scene } from './scene'

export function createLife(): Scene {
  let cols = 0, rows = 0
  let grid: Uint8Array = new Uint8Array(0)
  let next: Uint8Array = new Uint8Array(0)
  let stepAt = 0

  const seed = () => {
    for (let i = 0; i < grid.length; i++) grid[i] = Math.random() < 0.28 ? 1 : 0
  }

  const reset = (c: number, r: number) => {
    cols = c; rows = r
    grid = new Uint8Array(cols * rows)
    next = new Uint8Array(cols * rows)
    seed()
    stepAt = 0
  }

  const step = () => {
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        let n = 0
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue
            const nx = (x + dx + cols) % cols
            const ny = (y + dy + rows) % rows
            n += grid[ny * cols + nx]
          }
        }
        const alive = grid[y * cols + x]
        next[y * cols + x] = alive ? (n === 2 || n === 3 ? 1 : 0) : (n === 3 ? 1 : 0)
      }
    }
    ;[grid, next] = [next, grid]
  }

  const frame = (t: number) => {
    if (t - stepAt > 80) { step(); stepAt = t }
    // re-seed occasionally to avoid still lives filling the screen
    let alive = 0
    for (let i = 0; i < grid.length; i++) alive += grid[i]
    if (alive < (cols * rows) * 0.02) seed()
    const lines: string[] = []
    for (let y = 0; y < rows; y++) {
      let line = ''
      for (let x = 0; x < cols; x++) line += grid[y * cols + x] ? '█' : ' '
      lines.push(line)
    }
    return lines.join('\n')
  }

  return { name: "conway's life", reset, frame }
}
