import type { Station } from './api'

// equirectangular projection of lat/lon → grid cell.
// cell coords are integers; cols go 0..COLS-1 left→right, rows 0..ROWS-1 top→bottom.
// latitude is clamped to ±75° so the high-latitude distortion doesn't waste rows on
// greenland/antarctica where almost no stations live.

const CLAMP_LAT = 75

export function project(lat: number, lon: number, cols: number, rows: number): { x: number; y: number } {
  const la = Math.max(-CLAMP_LAT, Math.min(CLAMP_LAT, lat))
  const x = Math.floor(((lon + 180) / 360) * cols)
  const y = Math.floor(((CLAMP_LAT - la) / (CLAMP_LAT * 2)) * rows)
  return { x: Math.max(0, Math.min(cols - 1, x)), y: Math.max(0, Math.min(rows - 1, y)) }
}

export type CellIndex = {
  cols: number
  rows: number
  grid: Uint16Array            // station count per cell (rows * cols)
  stations: Station[][]        // parallel array: station list per cell
}

export function buildIndex(list: Station[], cols: number, rows: number): CellIndex {
  const grid = new Uint16Array(rows * cols)
  const stations: Station[][] = Array.from({ length: rows * cols }, () => [])
  for (const s of list) {
    const { x, y } = project(s.lat, s.lon, cols, rows)
    const k = y * cols + x
    grid[k]++
    stations[k].push(s)
  }
  // sort each cell's stations by votes desc so cell-click picks the most loved
  for (const cell of stations) cell.sort((a, b) => b.votes - a.votes || b.clickcount - a.clickcount)
  return { cols, rows, grid, stations }
}

// character ramp: more stations in a cell = denser glyph.
// a single '·' reads as a solitary pin; multi-pin cells brighten.
const DENSITY_RAMP = ['·', '∙', '•', '●', '◉', '◎']

export function glyphFor(count: number): string {
  if (count <= 0) return ' '
  if (count >= DENSITY_RAMP.length) return '◎'
  return DENSITY_RAMP[count - 1] ?? '·'
}

// find the nearest non-empty cell to (px, py) within `radius` cells,
// returning the cell index (row * cols + col) and its stations, or null.
export function nearestCell(
  idx: CellIndex,
  col: number,
  row: number,
  radius = 2,
): { cell: number; stations: Station[] } | null {
  if (col < 0 || row < 0 || col >= idx.cols || row >= idx.rows) return null
  // try exact cell first
  const k0 = row * idx.cols + col
  if (idx.grid[k0] > 0) return { cell: k0, stations: idx.stations[k0] }
  // spiral outwards up to `radius`
  for (let r = 1; r <= radius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
        const nx = col + dx, ny = row + dy
        if (nx < 0 || ny < 0 || nx >= idx.cols || ny >= idx.rows) continue
        const k = ny * idx.cols + nx
        if (idx.grid[k] > 0) return { cell: k, stations: idx.stations[k] }
      }
    }
  }
  return null
}
