import { type DoomInput, type GameState, newInput } from './types'

// empty-box test map for step (b). replaced by e1m1 in step (c).
const TEST_MAP = [
  '################',
  '#..............#',
  '#..............#',
  '#..............#',
  '#.....###......#',
  '#.....#........#',
  '#.....#........#',
  '#..............#',
  '#..............#',
  '#........###...#',
  '#........#.....#',
  '#........#.....#',
  '#..............#',
  '#..............#',
  '#..............#',
  '################',
]

const FOV = Math.PI / 3
const MOVE_SPEED = 3.0 // tiles / sec
const TURN_SPEED = 2.4 // rad / sec
// chars are ~2x taller than wide; squash vertical scale so a 1x1 tile reads square.
const ASPECT = 0.5
// wall density ramp, near → far
const WALL_NEAR = '█'
const WALL_MID  = '▓'
const WALL_FAR  = '▒'
const WALL_MIST = '░'
const WALL_SIDE_NEAR = '▓'
const WALL_SIDE_MID  = '▒'
const WALL_SIDE_FAR  = '░'

export type Doom = {
  reset(cols: number, rows: number): void
  frame(t: number): string
  readonly input: DoomInput
  readonly state: GameState
}

function makeState(cols: number, rows: number): GameState {
  const grid = TEST_MAP.slice()
  const mapW = grid[0].length
  const mapH = grid.length
  return {
    cols,
    rows,
    mapW,
    mapH,
    grid,
    phase: 'play',
    startedAt: 0,
    kills: 0,
    totalKills: 0,
    items: 0,
    totalItems: 0,
    player: {
      pos: { x: 3.5, y: 3.5 },
      dir: { x: 1, y: 0 },
      plane: { x: 0, y: Math.tan(FOV / 2) },
      health: 100,
      armor: 0,
      ammo: 50,
      alive: true,
    },
  }
}

function isWall(grid: string[], x: number, y: number): boolean {
  if (y < 0 || y >= grid.length) return true
  const row = grid[y]
  if (x < 0 || x >= row.length) return true
  return row[x] === '#'
}

function tryMove(state: GameState, nx: number, ny: number) {
  const r = 0.2
  const p = state.player.pos
  if (!isWall(state.grid, Math.floor(nx + Math.sign(nx - p.x) * r), Math.floor(p.y))) {
    p.x = nx
  }
  if (!isWall(state.grid, Math.floor(p.x), Math.floor(ny + Math.sign(ny - p.y) * r))) {
    p.y = ny
  }
}

function update(state: GameState, input: DoomInput, dt: number) {
  if (state.phase !== 'play') return
  const p = state.player

  // turn
  let rot = 0
  if (input.turnL) rot -= TURN_SPEED * dt
  if (input.turnR) rot += TURN_SPEED * dt
  if (rot !== 0) {
    const c = Math.cos(rot), s = Math.sin(rot)
    const dx = p.dir.x, dy = p.dir.y
    p.dir.x = dx * c - dy * s
    p.dir.y = dx * s + dy * c
    const px = p.plane.x, py = p.plane.y
    p.plane.x = px * c - py * s
    p.plane.y = px * s + py * c
  }

  // move
  let mx = 0, my = 0
  if (input.forward)  { mx += p.dir.x; my += p.dir.y }
  if (input.backward) { mx -= p.dir.x; my -= p.dir.y }
  // strafe perpendicular to dir: rotate dir by +90°
  if (input.strafeR)  { mx += -p.dir.y; my +=  p.dir.x }
  if (input.strafeL)  { mx +=  p.dir.y; my += -p.dir.x }
  const mag = Math.hypot(mx, my)
  if (mag > 0) {
    const sp = MOVE_SPEED * dt / mag
    tryMove(state, p.pos.x + mx * sp, p.pos.y + my * sp)
  }
}

function render(state: GameState): string {
  const { cols, rows, player: p, grid } = state
  const halfRows = rows / 2
  // top = ceiling, bottom = floor
  const out: string[][] = Array.from({ length: rows }, () => new Array<string>(cols).fill(' '))

  for (let x = 0; x < cols; x++) {
    const cameraX = (2 * x) / cols - 1
    const rayDirX = p.dir.x + p.plane.x * cameraX
    const rayDirY = p.dir.y + p.plane.y * cameraX
    let mapX = Math.floor(p.pos.x)
    let mapY = Math.floor(p.pos.y)
    const deltaX = rayDirX === 0 ? Infinity : Math.abs(1 / rayDirX)
    const deltaY = rayDirY === 0 ? Infinity : Math.abs(1 / rayDirY)
    let stepX: number, stepY: number
    let sideDistX: number, sideDistY: number
    if (rayDirX < 0) { stepX = -1; sideDistX = (p.pos.x - mapX) * deltaX }
    else             { stepX =  1; sideDistX = (mapX + 1 - p.pos.x) * deltaX }
    if (rayDirY < 0) { stepY = -1; sideDistY = (p.pos.y - mapY) * deltaY }
    else             { stepY =  1; sideDistY = (mapY + 1 - p.pos.y) * deltaY }

    let hit = false
    let side = 0
    let guard = 0
    while (!hit && guard++ < 64) {
      if (sideDistX < sideDistY) { sideDistX += deltaX; mapX += stepX; side = 0 }
      else                       { sideDistY += deltaY; mapY += stepY; side = 1 }
      if (isWall(grid, mapX, mapY)) hit = true
    }
    const perp = side === 0
      ? (mapX - p.pos.x + (1 - stepX) / 2) / rayDirX
      : (mapY - p.pos.y + (1 - stepY) / 2) / rayDirY
    const dist = Math.max(0.0001, perp)

    const lineH = Math.floor((rows * ASPECT) / dist)
    const drawStart = Math.max(0, Math.floor(halfRows - lineH / 2))
    const drawEnd   = Math.min(rows - 1, Math.floor(halfRows + lineH / 2))

    // wall char by distance, dimmer for y-side to fake shading
    let ch: string
    if (side === 0) {
      if      (dist < 2)  ch = WALL_NEAR
      else if (dist < 5)  ch = WALL_MID
      else if (dist < 10) ch = WALL_FAR
      else                ch = WALL_MIST
    } else {
      if      (dist < 2)  ch = WALL_SIDE_NEAR
      else if (dist < 5)  ch = WALL_SIDE_MID
      else if (dist < 10) ch = WALL_SIDE_FAR
      else                ch = WALL_MIST
    }

    for (let y = 0; y < rows; y++) {
      if (y < drawStart) {
        out[y][x] = ' '
      } else if (y > drawEnd) {
        // floor shading: closer = denser
        const rowDist = halfRows / (y - halfRows + 0.0001)
        out[y][x] = rowDist < 3 ? '·' : rowDist < 7 ? '.' : ' '
      } else {
        out[y][x] = ch
      }
    }
  }

  return out.map((r) => r.join('')).join('\n')
}

export function createDoom(): Doom {
  let state: GameState = makeState(80, 30)
  const input = newInput()
  let lastT = 0

  return {
    reset(cols, rows) {
      state = makeState(cols, rows)
      lastT = 0
    },
    frame(t) {
      const dt = lastT === 0 ? 0 : Math.min(0.05, (t - lastT) / 1000)
      lastT = t
      update(state, input, dt)
      return render(state)
    },
    get input() { return input },
    get state() { return state },
  }
}
