import type { Scene } from './scene'

const RULE = 30
const BITS = Array.from({ length: 8 }, (_, i) => (RULE >> i) & 1)

export function createRule30(): Scene {
  let cols = 0, rows = 0
  let history: Uint8Array[] = []
  let row: Uint8Array = new Uint8Array(0)
  let stepAt = 0

  const seed = () => {
    row = new Uint8Array(cols)
    row[Math.floor(cols / 2)] = 1
    history = [row.slice()]
  }

  const reset = (c: number, r: number) => {
    cols = c; rows = r
    seed()
    stepAt = 0
  }

  const step = () => {
    const n = new Uint8Array(cols)
    for (let i = 0; i < cols; i++) {
      const l = row[(i - 1 + cols) % cols]
      const c = row[i]
      const r = row[(i + 1) % cols]
      const idx = (l << 2) | (c << 1) | r
      n[i] = BITS[idx]
    }
    row = n
    history.push(row.slice())
    if (history.length > rows) history.shift()
    // restart when it degenerates
    let sum = 0
    for (let i = 0; i < cols; i++) sum += row[i]
    if (sum === 0 || sum === cols) seed()
  }

  const frame = (t: number) => {
    if (t - stepAt > 60) { step(); stepAt = t }
    const lines: string[] = []
    const offset = rows - history.length
    for (let y = 0; y < rows; y++) {
      if (y < offset) { lines.push(' '.repeat(cols)); continue }
      const h = history[y - offset]
      let line = ''
      for (let x = 0; x < cols; x++) line += h[x] ? '█' : ' '
      lines.push(line)
    }
    return lines.join('\n')
  }

  return { name: 'rule 30', reset, frame }
}
