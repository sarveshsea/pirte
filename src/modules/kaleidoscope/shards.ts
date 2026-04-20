// physical shard simulation inside a single kaleidoscope wedge.
// wedge domain: center at origin, angular range [0, wedgeAngle], radial [0, R].
// mirror walls are the two rays at angle 0 and angle=wedgeAngle.
// outer wall is the circle r=R.

export type Shape = 'triangle' | 'hex' | 'diamond' | 'star'
export const SHAPES: Shape[] = ['triangle', 'hex', 'diamond', 'star']

export type Shard = {
  x: number
  y: number
  vx: number
  vy: number
  rot: number
  omega: number  // angular velocity
  size: number
  shape: Shape
  colorIdx: number
  age: number    // seconds since spawn
  fading: boolean
}

export type World = {
  shards: Shard[]
  wedgeAngle: number  // π/n
  R: number
  maxShards: number
}

export type Bounds = { wedgeAngle: number; R: number }

export function createWorld(wedgeAngle: number, R: number): World {
  return { shards: [], wedgeAngle, R, maxShards: 80 }
}

export function seedShards(world: World, count: number, rand: () => number) {
  for (let i = 0; i < count; i++) {
    spawnShardAt(world, (0.2 + rand() * 0.7) * world.R, rand() * world.wedgeAngle, rand)
  }
}

// spawn a new shard at polar coords (r, angle) inside the wedge, with a gentle
// outward kick. returns the shard or null if capped (then oldest is faded).
export function spawnShardAt(world: World, r: number, angle: number, rand: () => number): Shard {
  if (world.shards.length >= world.maxShards) {
    // mark the oldest non-fading as fading — it'll drop out in a few seconds
    const candidate = world.shards.find((s) => !s.fading)
    if (candidate) candidate.fading = true
  }
  const x = Math.cos(angle) * r
  const y = Math.sin(angle) * r
  const kick = 20 + rand() * 40
  const kickAngle = angle + (rand() - 0.5) * 0.8
  const s: Shard = {
    x, y,
    vx: Math.cos(kickAngle) * kick,
    vy: Math.sin(kickAngle) * kick,
    rot: rand() * Math.PI * 2,
    omega: (rand() - 0.5) * 3,
    size: 8 + rand() * 14,
    shape: SHAPES[Math.floor(rand() * SHAPES.length)],
    colorIdx: Math.floor(rand() * 6),
    age: 0,
    fading: false,
  }
  world.shards.push(s)
  return s
}

type CollideEvent =
  | { kind: 'mirror'; size: number }
  | { kind: 'outer'; size: number }
  | { kind: 'shard'; size: number }

export type CollideCallback = (e: CollideEvent) => void

const DAMP_LINEAR  = 0.992
const DAMP_ANGULAR = 0.985
const REST_MIRROR  = 0.7
const REST_OUTER   = 0.82
const REST_SHARD   = 0.82
const FADE_TIME    = 3.5

// step the world by dt (seconds) with a gravity vector.
// collide() is called on each mirror/outer/shard hit for audio.
export function stepWorld(
  world: World, dt: number,
  gx: number, gy: number,
  collide: CollideCallback,
) {
  const { shards, wedgeAngle, R } = world
  // integrate
  for (const s of shards) {
    s.age += dt
    if (s.fading && s.age > FADE_TIME) continue
    s.vx += gx * dt
    s.vy += gy * dt
    s.vx *= DAMP_LINEAR
    s.vy *= DAMP_LINEAR
    s.omega *= DAMP_ANGULAR
    s.x += s.vx * dt
    s.y += s.vy * dt
    s.rot += s.omega * dt
  }
  // mirror wall 1: y = 0 (angle 0). reflect vy if y < size/2.
  for (const s of shards) {
    const r = s.size / 2
    if (s.y < r) {
      s.y = r
      if (s.vy < 0) { s.vy = -s.vy * REST_MIRROR; collide({ kind: 'mirror', size: s.size }) }
    }
    // mirror wall 2: line at angle wedgeAngle, normal points into wedge.
    // signed distance from shard to wall: d = s.x * (-sin(a)) + s.y * cos(a)
    const sa = Math.sin(wedgeAngle), ca = Math.cos(wedgeAngle)
    const d = s.x * -sa + s.y * ca
    if (d < r) {
      // push inward along normal (-sa, ca)
      const push = r - d
      s.x += -sa * push
      s.y += ca * push
      // reflect velocity around the wall tangent (cos(a), sin(a))
      const vn = s.vx * -sa + s.vy * ca
      if (vn < 0) {
        s.vx -= 2 * vn * -sa * REST_MIRROR
        s.vy -= 2 * vn * ca * REST_MIRROR
        collide({ kind: 'mirror', size: s.size })
      }
    }
    // outer circle r=R
    const rp = Math.hypot(s.x, s.y)
    const limit = R - r
    if (rp > limit) {
      const nx = s.x / rp, ny = s.y / rp
      s.x = nx * limit
      s.y = ny * limit
      const vn = s.vx * nx + s.vy * ny
      if (vn > 0) {
        s.vx -= 2 * vn * nx * REST_OUTER
        s.vy -= 2 * vn * ny * REST_OUTER
        collide({ kind: 'outer', size: s.size })
      }
    }
  }
  // shard-shard (O(n²), fine for ≤80)
  for (let i = 0; i < shards.length; i++) {
    const a = shards[i]
    for (let j = i + 1; j < shards.length; j++) {
      const b = shards[j]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const min = (a.size + b.size) * 0.5
      const d2 = dx * dx + dy * dy
      if (d2 > min * min || d2 < 0.0001) continue
      const d = Math.sqrt(d2)
      const nx = dx / d, ny = dy / d
      const overlap = min - d
      a.x -= nx * overlap * 0.5
      a.y -= ny * overlap * 0.5
      b.x += nx * overlap * 0.5
      b.y += ny * overlap * 0.5
      const rvx = b.vx - a.vx
      const rvy = b.vy - a.vy
      const vn = rvx * nx + rvy * ny
      if (vn < 0) {
        const jimp = -(1 + REST_SHARD) * vn * 0.5
        a.vx -= jimp * nx
        a.vy -= jimp * ny
        b.vx += jimp * nx
        b.vy += jimp * ny
        collide({ kind: 'shard', size: (a.size + b.size) * 0.5 })
      }
    }
  }
  // remove fully-faded shards
  for (let i = shards.length - 1; i >= 0; i--) {
    if (shards[i].fading && shards[i].age > FADE_TIME) shards.splice(i, 1)
  }
}

export function totalKineticEnergy(world: World): number {
  let e = 0
  for (const s of world.shards) {
    e += 0.5 * (s.vx * s.vx + s.vy * s.vy)
  }
  return e
}

export function fadeOpacity(s: Shard): number {
  if (!s.fading) return 1
  return Math.max(0, 1 - (s.age / FADE_TIME))
}

// fold a point into the canonical wedge via reflection about the mirror walls.
// used for cursor-tilt: cursor at (x, y) maps to wedge-equivalent coords.
export function foldPoint(x: number, y: number, wedgeAngle: number): { x: number; y: number } {
  let a = Math.atan2(y, x)
  const r = Math.hypot(x, y)
  if (a < 0) a += 2 * Math.PI
  const two = wedgeAngle * 2
  let fa = a % two
  if (fa > wedgeAngle) fa = two - fa
  return { x: Math.cos(fa) * r, y: Math.sin(fa) * r }
}
