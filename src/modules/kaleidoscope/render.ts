import type { Shard, World } from './shards'
import type { Palette } from './palettes'
import { fadeOpacity } from './shards'
import { renderKaleidoscope } from '../kaleidoscope'

// reusable offscreen canvases to avoid allocation per frame
let wedgeCanvas: HTMLCanvasElement | null = null
let noiseCanvas: HTMLCanvasElement | null = null

function getOffscreen(w: number, h: number, prev: HTMLCanvasElement | null): HTMLCanvasElement {
  const c = prev ?? document.createElement('canvas')
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h }
  return c
}

function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: Shard['shape'],
  size: number,
) {
  const r = size / 2
  ctx.beginPath()
  if (shape === 'triangle') {
    ctx.moveTo(0, -r)
    ctx.lineTo(r * 0.866, r * 0.5)
    ctx.lineTo(-r * 0.866, r * 0.5)
    ctx.closePath()
  } else if (shape === 'hex') {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      const x = Math.cos(a) * r
      const y = Math.sin(a) * r
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
  } else if (shape === 'diamond') {
    ctx.moveTo(0, -r)
    ctx.lineTo(r * 0.75, 0)
    ctx.lineTo(0, r)
    ctx.lineTo(-r * 0.75, 0)
    ctx.closePath()
  } else {
    // 4-point star
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      const rad = i % 2 === 0 ? r : r * 0.42
      const x = Math.cos(a) * rad
      const y = Math.sin(a) * rad
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
  }
}

// render a single wedge: dim perlin backdrop clipped to wedge, then shards on top.
// wedge origin at (0,0), angles [0, wedgeAngle], outer radius R.
// output size is wedgeSize × wedgeSize, centered at (0,0); only the wedge sector is painted.
export function renderWedge(
  world: World,
  palette: Palette,
  wedgeSize: number,
  t: number,
  scale: number,
  backdropAlpha: number,
): HTMLCanvasElement {
  const W = wedgeSize, H = wedgeSize
  wedgeCanvas = getOffscreen(W, H, wedgeCanvas)
  const wctx = wedgeCanvas.getContext('2d')!
  wctx.clearRect(0, 0, W, H)

  // backdrop: reuse existing perlin kaleidoscope at low-res, then draw dim + clipped.
  const nw = Math.max(80, Math.floor(W / 3))
  const nh = nw
  const noiseImg = wctx.createImageData(nw, nh)
  renderKaleidoscope(noiseImg, t, 6, scale)  // fixed n=6 for backdrop symmetry — it's just atmosphere
  noiseCanvas = getOffscreen(nw, nh, noiseCanvas)
  noiseCanvas.getContext('2d')!.putImageData(noiseImg, 0, 0)

  // wedge origin is top-left (0,0) in this canvas; we're drawing the first quadrant.
  wctx.save()
  wctx.beginPath()
  wctx.moveTo(0, 0)
  wctx.lineTo(W, 0)
  wctx.arc(0, 0, world.R, 0, world.wedgeAngle)
  wctx.closePath()
  wctx.clip()

  wctx.globalAlpha = backdropAlpha
  wctx.imageSmoothingEnabled = true
  wctx.drawImage(noiseCanvas, 0, 0, W, H)
  wctx.globalAlpha = 1

  // shards
  for (const s of world.shards) {
    const alpha = fadeOpacity(s)
    if (alpha <= 0.01) continue
    wctx.save()
    wctx.globalAlpha = alpha
    wctx.translate(s.x, s.y)
    wctx.rotate(s.rot)
    wctx.fillStyle = palette[s.colorIdx % palette.length]
    // subtle edge so shards read against the noise backdrop
    wctx.strokeStyle = 'rgba(255,255,255,0.35)'
    wctx.lineWidth = 1
    drawShape(wctx, s.shape, s.size)
    wctx.fill()
    wctx.stroke()
    wctx.restore()
  }

  wctx.restore()
  return wedgeCanvas
}

// composite the wedge around (cx, cy) to tile the full 2π circle. an n-fold
// kaleidoscope shows 2n sub-wedges — n direct copies + n reflected — so each
// mirror wall is continuous across its neighbors.
//
// sector i in [0, 2n):
//   i even: rotate(i * wedgeAngle)
//   i odd:  rotate((i + 1) * wedgeAngle), scale(1, -1)
export function mirrorWedge(
  dst: CanvasRenderingContext2D,
  wedge: HTMLCanvasElement,
  n: number,
  cx: number, cy: number,
  wedgeAngle: number,
) {
  dst.save()
  dst.translate(cx, cy)
  for (let i = 0; i < n * 2; i++) {
    dst.save()
    if (i % 2 === 0) {
      dst.rotate(i * wedgeAngle)
    } else {
      dst.rotate((i + 1) * wedgeAngle)
      dst.scale(1, -1)
    }
    dst.drawImage(wedge, 0, 0)
    dst.restore()
  }
  dst.restore()
}
