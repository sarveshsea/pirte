export type Vec2 = { x: number; y: number }

export type DoomInput = {
  forward: boolean
  backward: boolean
  strafeL: boolean
  strafeR: boolean
  turnL: boolean
  turnR: boolean
  fire: boolean
  use: boolean
  pause: boolean
  restart: boolean
}

export type Player = {
  pos: Vec2
  dir: Vec2
  plane: Vec2
  health: number
  armor: number
  ammo: number
  alive: boolean
}

export type Phase = 'play' | 'paused' | 'dead' | 'won'

export type EnemyState = 'idle' | 'chase' | 'attack' | 'dead'
export type Enemy = {
  kind: 'imp'
  pos: Vec2
  hp: number
  state: EnemyState
  stateT: number
  attackCooldown: number
  deadT: number
}

export type Projectile = {
  pos: Vec2
  vel: Vec2
  ttl: number
  owner: 'player' | 'imp'
  damage: number
}

export type PickupKind = 'health' | 'armor' | 'ammo'
export type Pickup = { kind: PickupKind; pos: Vec2 }

export type GameState = {
  cols: number
  rows: number
  player: Player
  phase: Phase
  grid: string[]
  mapW: number
  mapH: number
  startedAt: number
  kills: number
  totalKills: number
  items: number
  totalItems: number
  enemies: Enemy[]
  projectiles: Projectile[]
  pickups: Pickup[]
  fireCooldown: number
  muzzleFlash: number
  shake: number
}

export function newInput(): DoomInput {
  return {
    forward: false,
    backward: false,
    strafeL: false,
    strafeR: false,
    turnL: false,
    turnR: false,
    fire: false,
    use: false,
    pause: false,
    restart: false,
  }
}
