// phasePortrait — tiny ascii scatter plot of a (x, y) trajectory over time.
// used by biology sims to visualize population orbits (lotka-volterra),
// disease S/I curves, reagent coupled dynamics, etc.
//
// older points render as faint glyphs; newest as the brightest `◉`. axes are
// sketched with faint tick marks + labels along the bottom and left rims.

export type PhaseSpec = {
  xLabel: string
  yLabel: string
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}

export type PhasePoint = { x: number; y: number }

// ring buffer of the last N phase points
export class PhaseTrail {
  readonly size: number
  private buf: PhasePoint[]
  private idx = 0
  private count = 0
  constructor(size: number) {
    this.size = size
    this.buf = new Array(size)
  }
  push(p: PhasePoint) {
    this.buf[this.idx] = p
    this.idx = (this.idx + 1) % this.size
    if (this.count < this.size) this.count++
  }
  clear() { this.idx = 0; this.count = 0 }
  // yields points from oldest to newest
  *iter(): IterableIterator<{ p: PhasePoint; age: number }> {
    for (let i = 0; i < this.count; i++) {
      const slot = (this.idx - this.count + i + this.size * 2) % this.size
      const p = this.buf[slot]
      if (!p) continue
      const age = 1 - i / Math.max(1, this.count - 1)   // 0 = newest, 1 = oldest
      yield { p, age }
    }
  }
  last(): PhasePoint | null {
    if (this.count === 0) return null
    const slot = (this.idx - 1 + this.size) % this.size
    return this.buf[slot] ?? null
  }
}

// four-band age ramp: oldest → newest
const AGE_GLYPHS = ['·', '∙', '○', '●']

export function renderPhase(
  trail: PhaseTrail,
  spec: PhaseSpec,
  cols: number,
  rows: number,
): string {
  if (cols < 10 || rows < 6) return ''
  const grid: string[][] = Array.from({ length: rows }, () => new Array(cols).fill(' '))

  // axes — dim border
  for (let x = 0; x < cols; x++) grid[rows - 1][x] = '─'
  for (let y = 0; y < rows; y++) grid[y][0] = '│'
  grid[rows - 1][0] = '└'

  // mid ticks
  const midX = Math.floor((cols - 1) / 2)
  const midY = Math.floor((rows - 1) / 2)
  grid[rows - 1][midX] = '┴'
  grid[midY][0] = '├'

  const dx = spec.xMax - spec.xMin
  const dy = spec.yMax - spec.yMin
  if (dx <= 0 || dy <= 0) return grid.map((r) => r.join('')).join('\n')

  // plot points
  for (const { p, age } of trail.iter()) {
    const nx = (p.x - spec.xMin) / dx
    const ny = (p.y - spec.yMin) / dy
    if (nx < 0 || nx > 1 || ny < 0 || ny > 1) continue
    // leave col 0 and last row for axes
    const col = 1 + Math.floor(nx * (cols - 3))
    const row = Math.floor((1 - ny) * (rows - 2))
    if (col < 1 || col >= cols - 1 || row < 0 || row >= rows - 1) continue
    const bandIdx = Math.min(AGE_GLYPHS.length - 1, Math.floor((1 - age) * AGE_GLYPHS.length))
    const glyph = AGE_GLYPHS[bandIdx]
    const existing = grid[row][col]
    // never overwrite the newest (●) with an older glyph
    if (existing === '●' || existing === '◉') continue
    grid[row][col] = glyph
  }
  // mark current position brighter
  const cur = trail.last()
  if (cur) {
    const nx = (cur.x - spec.xMin) / dx
    const ny = (cur.y - spec.yMin) / dy
    if (nx >= 0 && nx <= 1 && ny >= 0 && ny <= 1) {
      const col = 1 + Math.floor(nx * (cols - 3))
      const row = Math.floor((1 - ny) * (rows - 2))
      if (col >= 1 && col < cols - 1 && row >= 0 && row < rows - 1) {
        grid[row][col] = '◉'
      }
    }
  }

  return grid.map((r) => r.join('')).join('\n')
}
