import { type DoomInput, type GameState, newInput } from './types'
import { parseMap, isBlocking, isHazard } from './map'

const FOV = Math.PI / 3
const MOVE_SPEED = 3.0   // tiles / sec
const TURN_SPEED = 2.4   // rad / sec
// chars are ~2x taller than wide; squash vertical scale so a 1x1 tile reads square.
const ASPECT = 0.5

// wall glyphs by distance, near → far; `side` uses the lighter set for depth cue
const WALL_X = ['█', '▓', '▒', '░']
const WALL_Y = ['▓', '▒', '░', '·']
const DOOR_X = ['╬', '╫', '╪', '·']
const DOOR_Y = ['╫', '╪', '·', '·']

export type Doom = {
  reset(cols: number, rows: number): void
  frame(t: number): string
  readonly input: DoomInput
  readonly state: GameState
}

function makeState(cols: number, rows: number): GameState {
  const parsed = parseMap()
  const player = parsed.spawns.find((s) => s.kind === 'player')
  const spawn = player?.at ?? { x: 2.5, y: 2.5 }
  return {
    cols,
    rows,
    mapW: parsed.width,
    mapH: parsed.height,
    grid: parsed.grid,
    phase: 'play',
    startedAt: performance.now(),
    kills: 0,
    totalKills: parsed.spawns.filter((s) => s.kind === 'imp').length,
    items: 0,
    totalItems: parsed.spawns.filter((s) => s.kind !== 'player' && s.kind !== 'imp').length,
    player: {
      pos: { x: spawn.x, y: spawn.y },
      dir: { x: 1, y: 0 },
      plane: { x: 0, y: Math.tan(FOV / 2) },
      health: 100,
      armor: 0,
      ammo: 50,
      alive: true,
    },
  }
}

function tileAt(grid: string[], x: number, y: number): string {
  if (y < 0 || y >= grid.length) return '#'
  const row = grid[y]
  if (x < 0 || x >= row.length) return '#'
  return row[x]
}

function tryMove(state: GameState, nx: number, ny: number) {
  const r = 0.2
  const p = state.player.pos
  const txh = Math.floor(nx + Math.sign(nx - p.x) * r)
  const tyv = Math.floor(ny + Math.sign(ny - p.y) * r)
  if (!isBlocking(tileAt(state.grid, txh, Math.floor(p.y)))) p.x = nx
  if (!isBlocking(tileAt(state.grid, Math.floor(p.x), tyv))) p.y = ny
}

function applyHazard(state: GameState, dt: number) {
  const p = state.player
  const ch = tileAt(state.grid, Math.floor(p.pos.x), Math.floor(p.pos.y))
  if (isHazard(ch)) {
    // 5 hp/sec; armor absorbs half
    const dmg = 5 * dt
    const absorbed = Math.min(p.armor, dmg * 0.5)
    p.armor -= absorbed
    p.health -= dmg - absorbed
    if (p.health <= 0) {
      p.health = 0
      p.alive = false
      state.phase = 'dead'
    }
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
  if (input.strafeR)  { mx += -p.dir.y; my +=  p.dir.x }
  if (input.strafeL)  { mx +=  p.dir.y; my += -p.dir.x }
  const mag = Math.hypot(mx, my)
  if (mag > 0) {
    const sp = MOVE_SPEED * dt / mag
    tryMove(state, p.pos.x + mx * sp, p.pos.y + my * sp)
  }

  applyHazard(state, dt)
}

function distBand(dist: number): number {
  if (dist < 2) return 0
  if (dist < 5) return 1
  if (dist < 10) return 2
  return 3
}

function render(state: GameState, t: number): string {
  const { cols, rows, player: p, grid } = state
  const halfRows = rows / 2
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

    let hit = ''
    let side = 0
    let guard = 0
    while (!hit && guard++ < 96) {
      if (sideDistX < sideDistY) { sideDistX += deltaX; mapX += stepX; side = 0 }
      else                       { sideDistY += deltaY; mapY += stepY; side = 1 }
      const ch = tileAt(grid, mapX, mapY)
      if (isBlocking(ch)) hit = ch
    }
    const perp = side === 0
      ? (mapX - p.pos.x + (1 - stepX) / 2) / rayDirX
      : (mapY - p.pos.y + (1 - stepY) / 2) / rayDirY
    const dist = Math.max(0.0001, perp)

    const lineH = Math.floor((rows * ASPECT) / dist)
    const drawStart = Math.max(0, Math.floor(halfRows - lineH / 2))
    const drawEnd   = Math.min(rows - 1, Math.floor(halfRows + lineH / 2))

    const band = distBand(dist)
    const glyph = hit === 'D'
      ? (side === 0 ? DOOR_X[band] : DOOR_Y[band])
      : (side === 0 ? WALL_X[band] : WALL_Y[band])

    for (let y = 0; y < rows; y++) {
      if (y < drawStart) {
        out[y][x] = ' '
      } else if (y > drawEnd) {
        // floor — if the tile at the projected floor point is nukage, shimmer it
        const rowDist = (halfRows * ASPECT) / (y - halfRows + 0.0001)
        const fx = p.pos.x + rayDirX * rowDist
        const fy = p.pos.y + rayDirY * rowDist
        const fch = tileAt(grid, Math.floor(fx), Math.floor(fy))
        if (fch === '~') {
          const phase = ((fx + fy) * 1.7 + t * 0.004) % 4
          out[y][x] = phase < 1 ? '~' : phase < 2 ? '≈' : phase < 3 ? '-' : '·'
        } else {
          out[y][x] = rowDist < 3 ? '·' : rowDist < 7 ? '.' : ' '
        }
      } else {
        out[y][x] = glyph
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
      return render(state, t)
    },
    get input() { return input },
    get state() { return state },
  }
}
