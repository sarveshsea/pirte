export type Point = { x: number; y: number; px: number; py: number; pinned: boolean }
export type Constraint = { a: number; b: number; rest: number }

export type World = {
  cols: number
  rows: number
  points: Point[]
  constraints: Constraint[]
  gravity: number
  damping: number
  bounce: number
}

export function createWorld(cols: number, rows: number): World {
  return {
    cols, rows,
    points: [],
    constraints: [],
    gravity: 30,
    damping: 0.998,
    bounce: 0.3,
  }
}

export function addPoint(w: World, x: number, y: number, pinned = false): number {
  w.points.push({ x, y, px: x, py: y, pinned })
  return w.points.length - 1
}

export function connect(w: World, a: number, b: number) {
  if (a === b || a < 0 || b < 0 || a >= w.points.length || b >= w.points.length) return
  if (w.constraints.find((c) => (c.a === a && c.b === b) || (c.a === b && c.b === a))) return
  const pa = w.points[a], pb = w.points[b]
  const dx = pa.x - pb.x, dy = pa.y - pb.y
  const rest = Math.sqrt(dx * dx + dy * dy)
  w.constraints.push({ a, b, rest })
}

export function step(w: World, dt: number) {
  const { points, constraints, gravity, damping, cols, rows, bounce } = w
  // verlet
  for (const p of points) {
    if (p.pinned) { p.px = p.x; p.py = p.y; continue }
    const vx = (p.x - p.px) * damping
    const vy = (p.y - p.py) * damping
    p.px = p.x; p.py = p.y
    p.x += vx
    p.y += vy + gravity * dt * dt
  }
  // constraint relaxation
  const iters = 6
  for (let i = 0; i < iters; i++) {
    for (const c of constraints) {
      const pa = points[c.a], pb = points[c.b]
      const dx = pb.x - pa.x, dy = pb.y - pa.y
      const d = Math.sqrt(dx * dx + dy * dy) || 0.001
      const diff = (d - c.rest) / d
      const kx = dx * 0.5 * diff
      const ky = dy * 0.5 * diff
      if (!pa.pinned) { pa.x += kx; pa.y += ky }
      if (!pb.pinned) { pb.x -= kx; pb.y -= ky }
    }
    // bounds
    for (const p of points) {
      if (p.pinned) continue
      if (p.x < 0.5)       { p.x = 0.5;       p.px = p.x + (p.x - p.px) * bounce }
      if (p.x > cols - 1)  { p.x = cols - 1;  p.px = p.x + (p.x - p.px) * bounce }
      if (p.y < 0.5)       { p.y = 0.5;       p.py = p.y + (p.y - p.py) * bounce }
      if (p.y > rows - 1)  { p.y = rows - 1;  p.py = p.y + (p.y - p.py) * bounce }
    }
  }
}

export function render(w: World, selected: number | null): string {
  const grid: string[][] = Array.from({ length: w.rows }, () => Array(w.cols).fill(' '))
  // constraints as lines
  for (const c of w.constraints) {
    const pa = w.points[c.a], pb = w.points[c.b]
    drawLine(grid, Math.round(pa.x), Math.round(pa.y), Math.round(pb.x), Math.round(pb.y), lineChar(pb.x - pa.x, pb.y - pa.y))
  }
  // points on top
  for (let i = 0; i < w.points.length; i++) {
    const p = w.points[i]
    const ix = Math.round(p.x), iy = Math.round(p.y)
    if (ix < 0 || ix >= w.cols || iy < 0 || iy >= w.rows) continue
    grid[iy][ix] = i === selected ? '◉' : p.pinned ? '▣' : '●'
  }
  return grid.map((r) => r.join('')).join('\n')
}

function lineChar(dx: number, dy: number): string {
  const adx = Math.abs(dx), ady = Math.abs(dy)
  if (adx > ady * 2) return '─'
  if (ady > adx * 2) return '│'
  if (dx * dy > 0) return '\\'
  return '/'
}

function drawLine(grid: string[][], x0: number, y0: number, x1: number, y1: number, ch: string) {
  const dx = Math.abs(x1 - x0)
  const dy = -Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx + dy
  let x = x0, y = y0
  // skip endpoints so they don't clobber point glyphs
  let steps = 0
  while (true) {
    if (steps > 0 && !(x === x1 && y === y1)) {
      if (x >= 0 && x < grid[0].length && y >= 0 && y < grid.length && grid[y][x] === ' ') grid[y][x] = ch
    }
    if (x === x1 && y === y1) break
    const e2 = 2 * err
    if (e2 >= dy) { err += dy; x += sx }
    if (e2 <= dx) { err += dx; y += sy }
    steps++
    if (steps > 1000) break
  }
}

export function findNearest(w: World, x: number, y: number, maxDist = 2): number | null {
  let best = -1
  let bestD = maxDist * maxDist
  for (let i = 0; i < w.points.length; i++) {
    const p = w.points[i]
    const dx = p.x - x, dy = p.y - y
    const d2 = dx * dx + dy * dy
    if (d2 < bestD) { bestD = d2; best = i }
  }
  return best === -1 ? null : best
}

export function presetRope(w: World, cols: number, rows: number) {
  w.points.length = 0; w.constraints.length = 0
  const n = 18
  const startX = cols * 0.5
  const startY = 2
  const seg = Math.min(1.4, (rows - 4) / n)
  for (let i = 0; i < n; i++) addPoint(w, startX + i * 0.01, startY + i * seg, i === 0)
  for (let i = 0; i < n - 1; i++) connect(w, i, i + 1)
}

export function presetCloth(w: World, cols: number, rows: number) {
  w.points.length = 0; w.constraints.length = 0
  const W = 12, H = 8
  const sx = (cols - W * 2) / 2
  const sy = Math.max(2, Math.floor(rows * 0.1))
  const spacing = 2
  const idx = (x: number, y: number) => y * W + x
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) addPoint(w, sx + x * spacing, sy + y * spacing, y === 0 && x % 3 === 0)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (x < W - 1) connect(w, idx(x, y), idx(x + 1, y))
    if (y < H - 1) connect(w, idx(x, y), idx(x, y + 1))
  }
}
