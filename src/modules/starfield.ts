export type Star = { x: number; y: number; z: number }

export function makeStars(n: number, depth: number): Star[] {
  return Array.from({ length: n }, () => ({
    x: (Math.random() - 0.5) * 200,
    y: (Math.random() - 0.5) * 120,
    z: Math.random() * depth,
  }))
}

export function stepStars(stars: Star[], speed: number, dt: number, nearReset: number, farDepth: number) {
  for (const s of stars) {
    s.z -= speed * dt * 60
    if (s.z < nearReset) {
      s.x = (Math.random() - 0.5) * 200
      s.y = (Math.random() - 0.5) * 120
      s.z = farDepth
    }
  }
}

const DEPTH_RAMP = '.·:-=+*#%@'

export function renderStars(
  stars: Star[],
  cols: number,
  rows: number,
  steerX: number,
  steerY: number,
  fov: number,
  farDepth: number,
): string {
  const grid: string[][] = Array.from({ length: rows }, () => Array(cols).fill(' '))
  const cx = cols / 2
  const cy = rows / 2
  const scale = fov * Math.min(cols, rows * 2) * 0.5
  for (const s of stars) {
    if (s.z <= 0.2) continue
    const sx = Math.round(cx + ((s.x - steerX * 20) / s.z) * scale)
    const sy = Math.round(cy + ((s.y - steerY * 20) / s.z) * scale * 0.5)
    if (sx < 0 || sx >= cols || sy < 0 || sy >= rows) continue
    const depth = 1 - Math.min(1, s.z / farDepth)
    const idx = Math.max(0, Math.min(DEPTH_RAMP.length - 1, Math.floor(depth * DEPTH_RAMP.length)))
    const ch = DEPTH_RAMP[idx]
    // only overwrite with brighter char
    if (grid[sy][sx] === ' ' || DEPTH_RAMP.indexOf(grid[sy][sx]) < idx) grid[sy][sx] = ch
  }
  return grid.map((r) => r.join('')).join('\n')
}
