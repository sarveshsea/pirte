import type { Scene } from './scene'

const CHARS = '01{}[]()<>/\\|=+-*#$@%&?!:;.,_'

export function createMatrixRain(): Scene {
  let cols = 0, rows = 0
  let heads: number[] = []
  let speeds: number[] = []
  let lastAdvance = 0

  const reset = (c: number, r: number) => {
    cols = c; rows = r
    heads = Array.from({ length: cols }, () => Math.floor(Math.random() * rows))
    speeds = Array.from({ length: cols }, () => 0.5 + Math.random() * 1.5)
  }

  const frame = (t: number) => {
    if (lastAdvance === 0) lastAdvance = t
    const dt = (t - lastAdvance) / 60
    lastAdvance = t

    const buf: string[] = Array(rows).fill(0).map(() => ' '.repeat(cols))
    const grid: string[][] = buf.map((r) => r.split(''))

    for (let x = 0; x < cols; x++) {
      heads[x] += speeds[x] * dt
      if (heads[x] > rows + 20) {
        heads[x] = -Math.random() * 20
        speeds[x] = 0.5 + Math.random() * 1.5
      }
      const headY = Math.floor(heads[x])
      const tail = 8 + Math.floor(Math.random() * 8)
      for (let k = 0; k < tail; k++) {
        const y = headY - k
        if (y >= 0 && y < rows) {
          const ch = CHARS[Math.floor(Math.random() * CHARS.length)]
          grid[y][x] = ch
        }
      }
    }
    return grid.map((row) => row.join('')).join('\n')
  }

  return { name: 'matrix rain', reset, frame }
}
