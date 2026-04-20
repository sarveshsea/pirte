import { mulberry32 } from '../../lib/rng'
import { createWorld, seedShards, spawnShardAt, stepWorld, foldPoint, totalKineticEnergy, type World } from './shards'
import { PALETTES, PALETTE_NAMES, type Palette } from './palettes'
import { renderWedge, mirrorWedge } from './render'
import { setSound, setDroneSymmetry, setDroneEnergy, tinkle, tick } from './audio'

export type Kaleidoscope = {
  setSize(w: number, h: number): void
  setN(n: number): void
  setScale(s: number): void
  setSpeed(s: number): void
  setPaused(p: boolean): void
  setCursor(x: number, y: number): void
  setCursorActive(active: boolean): void
  click(x: number, y: number): void
  setPalette(idx: number): void
  cyclePalette(): number
  paletteIdx(): number
  paletteName(): string
  setSoundOn(on: boolean): void
  frame(ctx: CanvasRenderingContext2D, now: number): void
}

type Config = { n: number; scale: number; speed: number }

export function createKaleidoscope(cfg: Config): Kaleidoscope {
  const rand = mulberry32(Math.floor(Math.random() * 0xffffffff))
  let W = 800, H = 800
  let n = cfg.n
  let scale = cfg.scale
  let speed = cfg.speed
  let paused = false
  let backdropT = 0
  let lastT = 0
  let palIdx = 0
  const world: World = createWorld(Math.PI / n, Math.min(W, H) * 0.48)
  seedShards(world, 20, rand)
  let cursorX = 0.35, cursorY = 0.35  // world-space, pre-fold (just a default)
  let cursorActive = false

  const setSize = (w: number, h: number) => {
    W = w; H = h
    world.R = Math.min(W, H) * 0.48
  }

  const setN = (v: number) => {
    if (v === n) return
    n = v
    world.wedgeAngle = Math.PI / n
    // fold all existing shards into the new wedge in case it shrank
    for (const s of world.shards) {
      const f = foldPoint(s.x, s.y, world.wedgeAngle)
      s.x = f.x; s.y = f.y
    }
    setDroneSymmetry(n)
  }

  const setScale = (v: number) => { scale = v }
  const setSpeed = (v: number) => { speed = v }
  const setPaused = (p: boolean) => { paused = p }

  const setCursor = (x: number, y: number) => { cursorX = x; cursorY = y }
  const setCursorActive = (a: boolean) => { cursorActive = a }

  const click = (x: number, y: number) => {
    const f = foldPoint(x, y, world.wedgeAngle)
    const r = Math.min(world.R * 0.9, Math.hypot(f.x, f.y))
    const a = Math.max(0.01, Math.min(world.wedgeAngle - 0.01, Math.atan2(f.y, f.x)))
    spawnShardAt(world, r, a, rand)
  }

  const setPalette = (idx: number) => { palIdx = ((idx % PALETTES.length) + PALETTES.length) % PALETTES.length }
  const cyclePalette = () => { palIdx = (palIdx + 1) % PALETTES.length; return palIdx }
  const paletteIdx = () => palIdx
  const paletteName = () => PALETTE_NAMES[palIdx]
  const setSoundOn = (on: boolean) => {
    setSound(on)
    if (on) setDroneSymmetry(n)
  }

  const collide = (e: { kind: 'mirror' | 'outer' | 'shard'; size: number }) => {
    if (e.kind === 'shard') tick(e.size)
    else tinkle(e.size)
  }

  const frame = (ctx: CanvasRenderingContext2D, now: number) => {
    const dt = lastT === 0 ? 0 : Math.min(0.05, (now - lastT) / 1000)
    lastT = now
    if (!paused) backdropT += dt * speed

    // cursor is in normalized center-relative coords [-1, 1]; convert to world
    // pixels and fold into the canonical wedge. gravity is then a constant vector
    // toward that folded point (a simpler-than-per-shard attractor that still
    // feels responsive).
    let gx = 0, gy = 0
    if (cursorActive) {
      const cxs = cursorX * world.R
      const cys = cursorY * world.R
      const f = foldPoint(cxs, cys, world.wedgeAngle)
      gx = f.x * 0.9
      gy = f.y * 0.9
    }

    if (!paused) stepWorld(world, dt, gx, gy, collide)

    // drone follows the total kinetic energy + symmetry
    setDroneEnergy(totalKineticEnergy(world))

    // render
    ctx.clearRect(0, 0, W, H)
    const palette: Palette = PALETTES[palIdx]
    const wedgeSize = Math.ceil(world.R + 2)
    const wedge = renderWedge(world, palette, wedgeSize, backdropT, scale, 0.22)
    mirrorWedge(ctx, wedge, n, W / 2, H / 2, world.wedgeAngle)
  }

  return {
    setSize, setN, setScale, setSpeed, setPaused,
    setCursor, setCursorActive, click,
    setPalette, cyclePalette, paletteIdx, paletteName,
    setSoundOn,
    frame,
  }
}
