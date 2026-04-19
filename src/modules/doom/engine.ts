import { type DoomInput, type Enemy, type GameState, type Pickup, newInput } from './types'
import { parseMap, isBlocking, isHazard } from './map'
import {
  IMP_IDLE, IMP_ATTACK, IMP_DEAD, FIREBALL,
  HEALTH_PACK, ARMOR, AMMO_CLIP,
  PISTOL_IDLE, PISTOL_FIRE,
} from './sprites'
import { drawHud, HUD_H } from './hud'
import { mulberry32 } from '../../lib/rng'

const FOV = Math.PI / 3
const MOVE_SPEED = 3.0
const TURN_SPEED = 2.4
const ASPECT = 0.5

const WALL_X = ['█', '▓', '▒', '░']
const WALL_Y = ['▓', '▒', '░', '·']
const DOOR_X = ['╬', '╫', '╪', '·']
const DOOR_Y = ['╫', '╪', '·', '·']

const IMP_HP = 60
const IMP_SIGHT = 14
const IMP_ATTACK_RANGE = 9
const IMP_ATTACK_COOLDOWN = 1.8
const IMP_SPEED = 1.6
const FIREBALL_SPEED = 7
const FIREBALL_DAMAGE = 15

const PISTOL_COOLDOWN = 0.25
const PISTOL_RANGE = 20
const PICKUP_RADIUS = 0.6

const rand = mulberry32(0xd00f)

export type Doom = {
  reset(cols: number, rows: number): void
  frame(t: number): string
  readonly input: DoomInput
  readonly state: GameState
}

function makeState(cols: number, rows: number): GameState {
  const parsed = parseMap()
  const enemies: Enemy[] = []
  const pickups: Pickup[] = []
  let spawn = { x: 2.5, y: 2.5 }
  for (const s of parsed.spawns) {
    if (s.kind === 'player') spawn = s.at
    else if (s.kind === 'imp') enemies.push({
      kind: 'imp', pos: { ...s.at }, hp: IMP_HP,
      state: 'idle', stateT: 0, attackCooldown: IMP_ATTACK_COOLDOWN, deadT: 0,
    })
    else pickups.push({ kind: s.kind, pos: { ...s.at } })
  }
  return {
    cols, rows,
    mapW: parsed.width, mapH: parsed.height,
    grid: parsed.grid.slice(),
    phase: 'play',
    startedAt: performance.now(),
    kills: 0, totalKills: enemies.length,
    items: 0, totalItems: pickups.length,
    enemies, pickups,
    projectiles: [],
    fireCooldown: 0, muzzleFlash: 0, shake: 0,
    player: {
      pos: { x: spawn.x, y: spawn.y },
      dir: { x: 1, y: 0 },
      plane: { x: 0, y: Math.tan(FOV / 2) },
      health: 100, armor: 0, ammo: 50, alive: true,
    },
  }
}

function tileAt(grid: string[], x: number, y: number): string {
  if (y < 0 || y >= grid.length) return '#'
  const row = grid[y]
  if (x < 0 || x >= row.length) return '#'
  return row[x]
}

function hasLOS(grid: string[], ax: number, ay: number, bx: number, by: number): boolean {
  const dx = bx - ax, dy = by - ay
  const d = Math.hypot(dx, dy)
  const steps = Math.max(1, Math.ceil(d / 0.15))
  for (let i = 1; i < steps; i++) {
    const t = i / steps
    if (isBlocking(tileAt(grid, Math.floor(ax + dx * t), Math.floor(ay + dy * t)))) return false
  }
  return true
}

function tryMove(state: GameState, pos: { x: number; y: number }, nx: number, ny: number, r = 0.2) {
  const txh = Math.floor(nx + Math.sign(nx - pos.x) * r)
  const tyv = Math.floor(ny + Math.sign(ny - pos.y) * r)
  if (!isBlocking(tileAt(state.grid, txh, Math.floor(pos.y)))) pos.x = nx
  if (!isBlocking(tileAt(state.grid, Math.floor(pos.x), tyv))) pos.y = ny
}

function damagePlayer(state: GameState, dmg: number) {
  const p = state.player
  const absorbed = Math.min(p.armor, dmg * 0.5)
  p.armor -= absorbed
  p.health -= dmg - absorbed
  if (p.health <= 0) {
    p.health = 0
    p.alive = false
    state.phase = 'dead'
  }
}

function updatePlayer(state: GameState, input: DoomInput, dt: number) {
  const p = state.player
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

  let mx = 0, my = 0
  if (input.forward)  { mx += p.dir.x; my += p.dir.y }
  if (input.backward) { mx -= p.dir.x; my -= p.dir.y }
  if (input.strafeR)  { mx += -p.dir.y; my +=  p.dir.x }
  if (input.strafeL)  { mx +=  p.dir.y; my += -p.dir.x }
  const mag = Math.hypot(mx, my)
  if (mag > 0) {
    const sp = MOVE_SPEED * dt / mag
    tryMove(state, p.pos, p.pos.x + mx * sp, p.pos.y + my * sp)
  }

  // hazards
  const ch = tileAt(state.grid, Math.floor(p.pos.x), Math.floor(p.pos.y))
  if (isHazard(ch)) damagePlayer(state, 5 * dt)

  // pickups
  for (let i = state.pickups.length - 1; i >= 0; i--) {
    const it = state.pickups[i]
    const d = Math.hypot(it.pos.x - p.pos.x, it.pos.y - p.pos.y)
    if (d < PICKUP_RADIUS) {
      if (it.kind === 'health') p.health = Math.min(100, p.health + 25)
      else if (it.kind === 'armor') p.armor = Math.min(100, p.armor + 50)
      else p.ammo += 20
      state.pickups.splice(i, 1)
      state.items++
    }
  }
}

function firePistol(state: GameState) {
  const p = state.player
  if (p.ammo <= 0 || state.fireCooldown > 0) return
  p.ammo--
  state.fireCooldown = PISTOL_COOLDOWN
  state.muzzleFlash = 0.1
  state.shake = 0.06

  // hitscan: find nearest enemy within a narrow cone forward
  let best: Enemy | null = null
  let bestT = PISTOL_RANGE
  for (const e of state.enemies) {
    if (e.state === 'dead') continue
    const dx = e.pos.x - p.pos.x
    const dy = e.pos.y - p.pos.y
    const forward = dx * p.dir.x + dy * p.dir.y
    if (forward <= 0) continue
    const lateral = Math.abs(dx * -p.dir.y + dy * p.dir.x)
    if (lateral > 0.6) continue // must be near the crosshair
    if (forward > bestT) continue
    if (!hasLOS(state.grid, p.pos.x, p.pos.y, e.pos.x, e.pos.y)) continue
    best = e
    bestT = forward
  }
  if (best) {
    const dmg = 20 + Math.floor(rand() * 20)
    best.hp -= dmg
    if (best.hp <= 0) {
      best.state = 'dead'
      best.stateT = 0
      best.deadT = 0
      state.kills++
    }
  }
}

function updateEnemies(state: GameState, dt: number) {
  const p = state.player
  for (const e of state.enemies) {
    e.stateT += dt
    if (e.state === 'dead') { e.deadT += dt; continue }
    const dx = p.pos.x - e.pos.x
    const dy = p.pos.y - e.pos.y
    const d = Math.hypot(dx, dy)
    const canSee = d < IMP_SIGHT && hasLOS(state.grid, e.pos.x, e.pos.y, p.pos.x, p.pos.y)
    e.attackCooldown -= dt

    if (e.state === 'idle') {
      if (canSee) { e.state = 'chase'; e.stateT = 0 }
    } else if (e.state === 'chase') {
      if (canSee && d < IMP_ATTACK_RANGE && e.attackCooldown <= 0) {
        e.state = 'attack'
        e.stateT = 0
      } else if (d > 0.1) {
        const sp = IMP_SPEED * dt / d
        tryMove(state, e.pos, e.pos.x + dx * sp, e.pos.y + dy * sp, 0.25)
      }
    } else if (e.state === 'attack') {
      if (e.stateT > 0.35) {
        // launch fireball toward player's current position
        const vx = dx / (d || 1), vy = dy / (d || 1)
        state.projectiles.push({
          pos: { x: e.pos.x + vx * 0.4, y: e.pos.y + vy * 0.4 },
          vel: { x: vx * FIREBALL_SPEED, y: vy * FIREBALL_SPEED },
          ttl: 3, owner: 'imp', damage: FIREBALL_DAMAGE,
        })
        e.state = 'chase'
        e.stateT = 0
        e.attackCooldown = IMP_ATTACK_COOLDOWN + rand() * 0.8
      }
    }
  }
  // remove long-dead imps after splat frame timeout
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    if (state.enemies[i].state === 'dead' && state.enemies[i].deadT > 6) state.enemies.splice(i, 1)
  }
}

function updateProjectiles(state: GameState, dt: number) {
  const p = state.player
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const pr = state.projectiles[i]
    pr.pos.x += pr.vel.x * dt
    pr.pos.y += pr.vel.y * dt
    pr.ttl -= dt
    const dead =
      pr.ttl <= 0 ||
      isBlocking(tileAt(state.grid, Math.floor(pr.pos.x), Math.floor(pr.pos.y))) ||
      (pr.owner === 'imp' && Math.hypot(pr.pos.x - p.pos.x, pr.pos.y - p.pos.y) < 0.5)
    if (pr.owner === 'imp' && Math.hypot(pr.pos.x - p.pos.x, pr.pos.y - p.pos.y) < 0.5) {
      damagePlayer(state, pr.damage)
    }
    if (dead) state.projectiles.splice(i, 1)
  }
}

function update(state: GameState, input: DoomInput, dt: number) {
  if (state.phase !== 'play') return
  state.fireCooldown = Math.max(0, state.fireCooldown - dt)
  state.muzzleFlash = Math.max(0, state.muzzleFlash - dt)
  state.shake = Math.max(0, state.shake - dt)
  updatePlayer(state, input, dt)
  if (input.fire) firePistol(state)
  updateEnemies(state, dt)
  updateProjectiles(state, dt)
}

function distBand(dist: number): number {
  if (dist < 2) return 0
  if (dist < 5) return 1
  if (dist < 10) return 2
  return 3
}

function drawSprite(
  out: string[][], zBuffer: number[],
  cols: number, sceneRows: number,
  state: GameState,
  sx: number, sy: number,
  bitmap: string[],
) {
  const p = state.player
  const spriteX = sx - p.pos.x
  const spriteY = sy - p.pos.y
  const invDet = 1 / (p.plane.x * p.dir.y - p.dir.x * p.plane.y)
  const transformX = invDet * (p.dir.y * spriteX - p.dir.x * spriteY)
  const transformY = invDet * (-p.plane.y * spriteX + p.plane.x * spriteY)
  if (transformY <= 0.01) return
  const screenX = Math.floor((cols / 2) * (1 + transformX / transformY))
  const spriteH = Math.abs(Math.floor((sceneRows * ASPECT) / transformY))
  const spriteW = spriteH
  const halfH = spriteH / 2
  const halfW = spriteW / 2
  const drawStartY = Math.floor(sceneRows / 2 - halfH)
  const drawEndY   = Math.floor(sceneRows / 2 + halfH)
  const drawStartX = Math.floor(screenX - halfW)
  const drawEndX   = Math.floor(screenX + halfW)
  const bmpH = bitmap.length
  const bmpW = bitmap[0].length
  for (let x = drawStartX; x <= drawEndX; x++) {
    if (x < 0 || x >= cols) continue
    if (transformY >= zBuffer[x]) continue
    const texX = Math.min(bmpW - 1, Math.max(0, Math.floor(((x - drawStartX) / spriteW) * bmpW)))
    for (let y = drawStartY; y <= drawEndY; y++) {
      if (y < 0 || y >= sceneRows) continue
      const texY = Math.min(bmpH - 1, Math.max(0, Math.floor(((y - drawStartY) / spriteH) * bmpH)))
      const ch = bitmap[texY][texX]
      if (ch && ch !== ' ') out[y][x] = ch
    }
  }
}

function render(state: GameState, t: number): string {
  const { cols, rows, player: p, grid } = state
  const sceneRows = Math.max(10, rows - HUD_H)
  const halfRows = sceneRows / 2
  const shakeDy = state.shake > 0 ? -1 : 0
  const out: string[][] = Array.from({ length: rows }, () => new Array<string>(cols).fill(' '))
  const zBuffer = new Array<number>(cols).fill(Infinity)

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
    zBuffer[x] = dist

    const lineH = Math.floor((sceneRows * ASPECT) / dist)
    const drawStart = Math.max(0, Math.floor(halfRows - lineH / 2))
    const drawEnd   = Math.min(sceneRows - 1, Math.floor(halfRows + lineH / 2))

    const band = distBand(dist)
    const glyph = hit === 'D'
      ? (side === 0 ? DOOR_X[band] : DOOR_Y[band])
      : (side === 0 ? WALL_X[band] : WALL_Y[band])

    for (let y = 0; y < sceneRows; y++) {
      if (y < drawStart) {
        out[y][x] = ' '
      } else if (y > drawEnd) {
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

  // entities: sort by distance so near sprites overwrite far ones (simple painter)
  type Drawable = { d: number; sx: number; sy: number; bmp: string[] }
  const drawables: Drawable[] = []
  for (const it of state.pickups) {
    const bmp = it.kind === 'health' ? HEALTH_PACK : it.kind === 'armor' ? ARMOR : AMMO_CLIP
    const dd = Math.hypot(it.pos.x - p.pos.x, it.pos.y - p.pos.y)
    drawables.push({ d: dd, sx: it.pos.x, sy: it.pos.y, bmp })
  }
  for (const e of state.enemies) {
    const bmp = e.state === 'dead' ? IMP_DEAD : e.state === 'attack' ? IMP_ATTACK : IMP_IDLE
    const dd = Math.hypot(e.pos.x - p.pos.x, e.pos.y - p.pos.y)
    drawables.push({ d: dd, sx: e.pos.x, sy: e.pos.y, bmp })
  }
  for (const pr of state.projectiles) {
    const dd = Math.hypot(pr.pos.x - p.pos.x, pr.pos.y - p.pos.y)
    drawables.push({ d: dd, sx: pr.pos.x, sy: pr.pos.y, bmp: FIREBALL })
  }
  drawables.sort((a, b) => b.d - a.d)
  for (const dr of drawables) drawSprite(out, zBuffer, cols, sceneRows, state, dr.sx, dr.sy, dr.bmp)

  // pistol overlay at bottom of the 3d scene (just above the hud)
  const gun = state.muzzleFlash > 0 ? PISTOL_FIRE : PISTOL_IDLE
  const gunW = gun[0].length
  const gunH = gun.length
  const gx0 = Math.floor((cols - gunW) / 2)
  const gy0 = sceneRows - gunH
  for (let y = 0; y < gunH; y++) {
    for (let x = 0; x < gunW; x++) {
      const ch = gun[y][x]
      if (ch !== ' ') {
        const ox = gx0 + x
        const oy = gy0 + y
        if (oy >= 0 && oy < sceneRows && ox >= 0 && ox < cols) out[oy][ox] = ch
      }
    }
  }

  // apply screen shake inside the scene area only
  if (shakeDy !== 0) {
    for (let y = 0; y < sceneRows - 1; y++) out[y] = out[y + 1]
    out[sceneRows - 1] = new Array<string>(cols).fill(' ')
  }

  // hud in the bottom HUD_H rows
  drawHud(out, cols, rows, state)

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
