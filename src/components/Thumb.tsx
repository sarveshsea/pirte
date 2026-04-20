import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { fitCanvas, prefersReducedMotion } from '../lib/canvas'
import { stepClifford, DEFAULTS } from '../modules/attractors'
import { renderKaleidoscope } from '../modules/kaleidoscope'
import { renderSevenSegment } from '../modules/sevenSegment'
import { initState as spritesInit, step as spritesStep, render as spritesRender, type SpritesState } from '../modules/sprites'
import { makeStars, stepStars, renderStars, type Star } from '../modules/starfield'
import { DotsSpinner, ArcSpinner, PulseSpinner, WaveSpinner, BounceSpinner, EarthSpinner } from './spinners'

const TARGET_FPS = 24
const FRAME_MS = 1000 / TARGET_FPS

// local hsv→rgb (0..1) → 0..255 triple. used by the dynamic thumbs below.
function hsv(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6)
  const f = h * 6 - i
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s)
  let r = 0, g = 0, b = 0
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break
    case 1: r = q; g = v; b = p; break
    case 2: r = p; g = v; b = t; break
    case 3: r = p; g = q; b = v; break
    case 4: r = t; g = p; b = v; break
    case 5: r = v; g = p; b = q; break
  }
  return [r * 255 | 0, g * 255 | 0, b * 255 | 0]
}

function useThrottledRaf(
  draw: (t: number) => void,
  deps: unknown[] = [],
  target?: RefObject<Element | null>,
) {
  useEffect(() => {
    const reduce = prefersReducedMotion()
    let raf = 0
    let last = 0

    const tick = (t: number) => {
      if (t - last >= FRAME_MS) { draw(t); last = t }
      raf = requestAnimationFrame(tick)
    }
    const start = () => {
      if (raf || reduce) return
      raf = requestAnimationFrame(tick)
    }
    const stop = () => {
      if (!raf) return
      cancelAnimationFrame(raf)
      raf = 0
    }

    let io: IntersectionObserver | null = null
    const el = target?.current
    if (el && typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(
        ([entry]) => { entry.isIntersecting ? start() : stop() },
        { rootMargin: '120px' },
      )
      io.observe(el)
    } else {
      start()
    }

    if (reduce) draw(0)

    return () => {
      stop()
      io?.disconnect()
    }
    /* eslint-disable-next-line */
  }, deps)
}


export function ThumbClifford() {
  const ref = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef({ x: 0.1, y: 0.1 })
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ctx = c.getContext('2d')!
    fitCanvas(c, ctx)
    ctx.fillStyle = '#000'
    const r = c.getBoundingClientRect()
    ctx.fillRect(0, 0, r.width, r.height)
  }, [])
  useThrottledRaf(() => {
    const c = ref.current; if (!c) return
    const ctx = c.getContext('2d')!
    const r = c.getBoundingClientRect()
    ctx.fillStyle = 'rgba(0,0,0,0.06)'
    ctx.fillRect(0, 0, r.width, r.height)
    ctx.fillStyle = '#e8e8e8'
    for (let i = 0; i < 2500; i++) {
      stepClifford(stateRef.current, DEFAULTS.clifford)
      const px = r.width / 2 + stateRef.current.x * (r.width / 5)
      const py = r.height / 2 + stateRef.current.y * (r.height / 5)
      ctx.fillRect(px, py, 1, 1)
    }
  }, [], ref)
  return <canvas ref={ref} className="block h-full w-full" />
}

// live rotating ascii donut — dynamic + recognizable + fits the aesthetic
export function ThumbAscii() {
  const preRef = useRef<HTMLPreElement>(null)
  useThrottledRaf((t) => {
    if (!preRef.current) return
    const A = t * 0.0009, B = t * 0.0005
    const cA = Math.cos(A), sA = Math.sin(A)
    const cB = Math.cos(B), sB = Math.sin(B)
    const cols = 40, rows = 16
    const K1 = cols * 0.42, K2 = 5
    const out = new Array<string>(rows * cols).fill(' ')
    const zbuf = new Float32Array(rows * cols)
    const LUM = '.,-~:;=!*#$@'
    for (let theta = 0; theta < 6.283; theta += 0.14) {
      const cT = Math.cos(theta), sT = Math.sin(theta)
      for (let phi = 0; phi < 6.283; phi += 0.05) {
        const cP = Math.cos(phi), sP = Math.sin(phi)
        const circleX = 2 + cT, circleY = sT
        const x = circleX * (cB * cP + sA * sB * sP) - circleY * cA * sB
        const y = circleX * (sB * cP - sA * cB * sP) + circleY * cA * cB
        const z = K2 + cA * circleX * sP + circleY * sA
        const ooz = 1 / z
        const xp = Math.floor(cols / 2 + K1 * ooz * x)
        const yp = Math.floor(rows / 2 - K1 * 0.5 * ooz * y)
        const L = cP * cT * sB - cA * cT * sP - sA * sT + cB * (cA * sT - cT * sA * sP)
        if (L > 0 && xp >= 0 && xp < cols && yp >= 0 && yp < rows) {
          const idx = xp + cols * yp
          if (ooz > zbuf[idx]) {
            zbuf[idx] = ooz
            out[idx] = LUM[Math.floor(L * 8)] ?? '@'
          }
        }
      }
    }
    const lines: string[] = []
    for (let y = 0; y < rows; y++) lines.push(out.slice(y * cols, (y + 1) * cols).join(''))
    preRef.current.textContent = lines.join('\n')
  }, [], preRef)
  return (
    <div className="grid h-full w-full place-items-center" style={{ background: '#060408' }}>
      <pre ref={preRef} className="m-0 whitespace-pre text-[10px] leading-[1.0] text-[#e8e0ff]" />
    </div>
  )
}

// live colorful julia morph — c traces a slow lissajous curve, hue drifts
export function ThumbMandelbrot() {
  const ref = useRef<HTMLCanvasElement>(null)
  useThrottledRaf((t) => {
    const c = ref.current; if (!c) return
    const ctx = c.getContext('2d')!
    fitCanvas(c, ctx)
    const rect = c.getBoundingClientRect()
    // small backing-store — blitted up by css. cheap + soft.
    const W = 140, H = 88
    c.width = W * Math.min(2, window.devicePixelRatio || 1)
    c.height = H * Math.min(2, window.devicePixelRatio || 1)
    const img = ctx.createImageData(W, H)
    const data = img.data
    const phase = t * 0.00018
    const cxj = Math.cos(phase) * 0.38 - 0.42
    const cyj = Math.sin(phase * 1.3) * 0.38 + 0.12
    const scale = 2.6
    const aspect = W / H
    const maxIter = 64
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let zx = ((x / W) - 0.5) * scale * aspect
        let zy = (0.5 - (y / H)) * scale
        let i = 0
        let m = 0
        for (; i < maxIter; i++) {
          const zx2 = zx * zx, zy2 = zy * zy
          m = zx2 + zy2
          if (m > 64) break
          const nx = zx2 - zy2 + cxj
          const ny = 2 * zx * zy + cyj
          zx = nx; zy = ny
        }
        const k = (y * W + x) * 4
        if (i >= maxIter - 1) {
          data[k] = 8; data[k + 1] = 6; data[k + 2] = 14; data[k + 3] = 255
        } else {
          const sm = i + 1 - Math.log2(Math.max(1e-6, Math.log2(Math.max(m, 2)) / 2))
          const tnorm = Math.pow(Math.max(0, sm / maxIter), 0.55)
          const [r, g, b] = hsv((phase * 0.35 + tnorm * 0.35 + 0.62) % 1, 0.55, 0.14 + tnorm * 0.86)
          data[k] = r; data[k + 1] = g; data[k + 2] = b; data[k + 3] = 255
        }
      }
    }
    // draw to offscreen at native, then scale up onto the real canvas
    const off = document.createElement('canvas')
    off.width = W; off.height = H
    off.getContext('2d')!.putImageData(img, 0, 0)
    ctx.imageSmoothingEnabled = true
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.drawImage(off, 0, 0, c.width, c.height)
    // keep css size accurate
    c.style.width = `${rect.width}px`
    c.style.height = `${rect.height}px`
  }, [], ref)
  return <canvas ref={ref} className="block h-full w-full" />
}

// colorful voronoi blobs from seeded palette — reads as 'quantized image', not a gray checker
export function ThumbPixels() {
  const n = 16
  const cells = useMemo(() => {
    const palette: [number, number, number][] = [
      [255, 106, 136], [255, 160, 96],  [235, 205, 110],
      [160, 212, 130], [100, 212, 198], [108, 150, 255],
      [180, 138, 255], [235, 130, 200], [120, 120, 150],
    ]
    const nSeeds = 5 + Math.floor(Math.random() * 3)
    const seeds = Array.from({ length: nSeeds }, () => ({
      x: Math.random() * n,
      y: Math.random() * n,
      color: palette[Math.floor(Math.random() * palette.length)],
    }))
    const out: string[] = []
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        let best = 0, bestD = Infinity
        for (let i = 0; i < seeds.length; i++) {
          const d = (x - seeds[i].x) ** 2 + (y - seeds[i].y) ** 2
          if (d < bestD) { bestD = d; best = i }
        }
        const [r, g, b] = seeds[best].color
        // subtle edge darkening toward the border
        const edge = 1 - 0.35 * Math.max(0, (bestD / (n * n)))
        out.push(`rgb(${Math.floor(r * edge)},${Math.floor(g * edge)},${Math.floor(b * edge)})`)
      }
    }
    return out
  }, [])
  return (
    <div
      className="grid h-full w-full"
      style={{
        gridTemplateColumns: `repeat(${n}, 1fr)`,
        gridTemplateRows: `repeat(${n}, 1fr)`,
        gap: '1px',
        background: '#0a0a0a',
        padding: '1px',
      }}
    >
      {cells.map((bg, i) => <div key={i} style={{ background: bg }} />)}
    </div>
  )
}

export function ThumbTime() {
  const preRef = useRef<HTMLPreElement>(null)
  useThrottledRaf(() => {
    if (!preRef.current) return
    const d = new Date()
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    const ss = String(d.getSeconds()).padStart(2, '0')
    preRef.current.textContent = renderSevenSegment(`${hh}:${mm}:${ss}`)
  }, [], preRef)
  return (
    <div className="grid h-full place-items-center overflow-hidden">
      <pre ref={preRef} className="m-0 whitespace-pre text-[var(--color-fg)] text-[12px] leading-[1.1]" />
    </div>
  )
}

export function ThumbSprites() {
  const preRef = useRef<HTMLPreElement>(null)
  const stateRef = useRef<SpritesState | null>(null)
  useEffect(() => { stateRef.current = spritesInit(34, 14, 22); stateRef.current.mode = 'attract'; stateRef.current.cursor.active = false }, [])
  useThrottledRaf(() => {
    const s = stateRef.current
    if (!s || !preRef.current) return
    // gentle idle wander
    s.cursor.x = s.cols / 2 + Math.cos(s.t * 0.3) * s.cols * 0.3
    s.cursor.y = s.rows / 2 + Math.sin(s.t * 0.4) * s.rows * 0.3
    s.cursor.active = true
    spritesStep(s, 1 / 24)
    preRef.current.textContent = spritesRender(s)
  }, [], preRef)
  return <pre ref={preRef} className="m-0 whitespace-pre text-[9px] leading-[1.0] text-[var(--color-fg)]" />
}

export function ThumbWaves() {
  const ref = useRef<HTMLCanvasElement>(null)
  useThrottledRaf((t) => {
    const c = ref.current; if (!c) return
    const ctx = c.getContext('2d')!
    fitCanvas(c, ctx)
    const rect = c.getBoundingClientRect()
    const W = rect.width, H = rect.height
    ctx.fillStyle = '#0a0a0a'
    ctx.fillRect(0, 0, W, H)

    // 12-lane mini pattern grid in the top 60%
    const gridH = H * 0.6
    const lanes = 12
    const steps = 32
    const cellW = W / steps
    const laneH = gridH / lanes
    const phase = Math.floor(t / 200) % steps
    for (let lane = 0; lane < lanes; lane++) {
      for (let s = 0; s < steps; s++) {
        const on = Math.sin(lane * 1.7 + s * 0.9) + Math.cos(lane * 0.3 + s * 1.3) > 0.4
        const isPlay = s === phase
        if (on) {
          ctx.fillStyle = isPlay ? '#50ffd8' : `rgba(80,255,216,${(0.3 + (lane % 3) * 0.2).toFixed(2)})`
          ctx.fillRect(s * cellW + 0.5, lane * laneH + 0.5, cellW - 1, laneH - 1)
        } else if (isPlay) {
          ctx.fillStyle = 'rgba(80,255,216,0.10)'
          ctx.fillRect(s * cellW, lane * laneH, cellW, laneH)
        }
      }
    }

    // mini scope in the bottom 40%
    const scopeY = gridH + 2
    const scopeH = H - scopeY - 1
    ctx.strokeStyle = '#50ffd8'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let x = 0; x < W; x++) {
      const p = x / W
      const ph = t * 0.004
      const v =
        Math.sin(p * 28 + ph) * 0.35 +
        Math.sin(p * 11 + ph * 1.3) * 0.25 +
        Math.sin(p * 54 + ph * 2.1) * 0.12
      const y = scopeY + scopeH / 2 + v * scopeH * 0.45
      if (x === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }, [], ref)
  return <canvas ref={ref} className="block h-full w-full" />
}

export function ThumbBreathe() {
  const preRef = useRef<HTMLPreElement>(null)
  useThrottledRaf((t) => {
    if (!preRef.current) return
    const cycle = 16
    const p = ((t / 1000) % cycle) / cycle
    let scale
    if (p < 0.25) scale = 0.3 + 0.7 * (p / 0.25)
    else if (p < 0.5) scale = 1
    else if (p < 0.75) scale = 1 - 0.7 * ((p - 0.5) / 0.25)
    else scale = 0.3
    const cols = 32, rows = 12
    const cx = cols / 2, cy = rows / 2
    const maxR = Math.min(cols, rows * 2) * 0.45
    const r = maxR * scale
    const lines: string[] = []
    for (let y = 0; y < rows; y++) {
      let line = ''
      for (let x = 0; x < cols; x++) {
        const dx = x - cx
        const dy = (y - cy) * 2
        const d = Math.sqrt(dx * dx + dy * dy)
        const edge = Math.abs(d - r)
        if (d < r - 0.6) {
          const k = 1 - d / Math.max(0.001, r)
          const ramp = ' ░▒▓█'
          line += ramp[Math.min(ramp.length - 1, Math.floor(k * ramp.length))]
        } else if (edge < 0.6) line += '●'
        else line += ' '
      }
      lines.push(line)
    }
    preRef.current.textContent = lines.join('\n')
  }, [], preRef)
  return <pre ref={preRef} className="m-0 whitespace-pre text-[9px] leading-[1.0] text-[var(--color-fg)]" />
}

export function ThumbStarfield() {
  const preRef = useRef<HTMLPreElement>(null)
  const starsRef = useRef<Star[]>([])
  useEffect(() => { starsRef.current = makeStars(180, 100) }, [])
  useThrottledRaf(() => {
    if (!preRef.current) return
    stepStars(starsRef.current, 0.5, 1 / 24, 0.5, 100)
    preRef.current.textContent = renderStars(starsRef.current, 38, 14, 0, 0, 1.0, 100)
  }, [], preRef)
  return <pre ref={preRef} className="m-0 whitespace-pre text-[9px] leading-[1.0] text-[var(--color-fg)]" />
}

export function ThumbOrbit() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current; if (!c) return
    const ctx = c.getContext('2d')!
    fitCanvas(c, ctx)
    const rect = c.getBoundingClientRect()
    // dark space bg with stars
    ctx.fillStyle = '#020014'
    ctx.fillRect(0, 0, rect.width, rect.height)
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.2 + Math.random() * 0.7})`
      ctx.fillRect(Math.random() * rect.width, Math.random() * rect.height, 1, 1)
    }
    // earth limb arc
    const cx = rect.width / 2, cy = rect.height * 1.6
    const r = rect.height * 1.2
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    const grad = ctx.createRadialGradient(cx, cy - r * 0.3, 0, cx, cy, r)
    grad.addColorStop(0, '#2a5eff')
    grad.addColorStop(0.6, '#0a2254')
    grad.addColorStop(1, '#04102a')
    ctx.fillStyle = grad
    ctx.fill()
    // atmosphere glow
    ctx.beginPath()
    ctx.arc(cx, cy, r + 3, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(110, 180, 255, 0.6)'
    ctx.lineWidth = 1
    ctx.stroke()
    // iss marker
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(rect.width * 0.65 - 1, rect.height * 0.35 - 1, 3, 3)
    ctx.strokeStyle = '#ff4b5e'
    ctx.lineWidth = 0.5
    ctx.strokeRect(rect.width * 0.65 - 5, rect.height * 0.35 - 5, 10, 10)
  }, [])
  return <canvas ref={ref} className="block h-full w-full" />
}


export function ThumbRadio() {
  // ascii mini-globe with a few pins and a "live" dot
  const lines = useMemo(() => {
    const cols = 38, rows = 14
    const cx = cols / 2, cy = rows / 2
    const rx = cols * 0.42, ry = rows * 0.46
    const out: string[] = []
    // pin positions (col, row) — hand-picked to feel scattered
    const pins = new Set(['6,4', '10,6', '14,3', '18,7', '22,5', '26,8', '30,4', '12,10', '22,10'])
    const live = '22,5'
    for (let y = 0; y < rows; y++) {
      let line = ''
      for (let x = 0; x < cols; x++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry
        const d = dx * dx + dy * dy
        const key = `${x},${y}`
        if (key === live) { line += '◉'; continue }
        if (pins.has(key) && d < 1) { line += '•'; continue }
        if (d > 1) { line += ' '; continue }
        // latitude/longitude gridlines
        const lat = Math.round(dy * 4)
        const lon = Math.round(dx * 6)
        if (Math.abs(lat * ry / 4 - (y - cy)) < 0.25) { line += '-'; continue }
        if (Math.abs(lon * rx / 6 - (x - cx)) < 0.25) { line += '|'; continue }
        // speckle land
        line += (x * 13 + y * 7) % 5 === 0 ? '·' : ' '
      }
      out.push(line)
    }
    return out.join('\n')
  }, [])
  return (
    <pre className="m-0 grid h-full w-full place-items-center whitespace-pre text-[9px] leading-[1.0] text-[var(--color-fg)]">
      {lines}
    </pre>
  )
}

export function ThumbSpinners() {
  return (
    <div className="grid h-full w-full grid-cols-3 grid-rows-2 place-items-center text-[var(--color-fg)]">
      <DotsSpinner size={20} color="var(--color-fg)" />
      <ArcSpinner size={20} color="var(--color-fg)" />
      <PulseSpinner size={20} color="var(--color-fg)" />
      <WaveSpinner size={20} color="var(--color-fg)" />
      <BounceSpinner size={20} color="var(--color-fg)" />
      <EarthSpinner size={20} color="var(--color-fg)" />
    </div>
  )
}

export function ThumbKaleidoscope() {
  const ref = useRef<HTMLCanvasElement>(null)
  useThrottledRaf((t) => {
    const c = ref.current; if (!c) return
    const ctx = c.getContext('2d')!
    fitCanvas(c, ctx)
    const rect = c.getBoundingClientRect()
    const rw = 80, rh = 80
    const buf = ctx.createImageData(rw, rh)
    renderKaleidoscope(buf, t * 0.001, 6, 14)
    const off = document.createElement('canvas')
    off.width = rw; off.height = rh
    off.getContext('2d')!.putImageData(buf, 0, 0)
    ctx.imageSmoothingEnabled = true
    ctx.clearRect(0, 0, rect.width, rect.height)
    ctx.drawImage(off, 0, 0, rect.width, rect.height)
  }, [], ref)
  return <canvas ref={ref} className="block h-full w-full" />
}

/* microbes thumb — static physarum-style pseudo-trail pattern. no sim runs;
   this is a layout of coherent branching paths sampled from a few seeds that
   diffuse through a grid, evoking slime-mold foraging networks. */
export function ThumbMicrobes() {
  const lines = useMemo(() => {
    const cols = 38, rows = 14
    const ramp = ' .·:+=*xX#'
    // seed a handful of high-intensity points and diffuse a few times
    let g = new Float32Array(cols * rows)
    const pts = [
      [8, 4], [20, 3], [30, 6], [12, 10], [24, 11], [33, 10], [4, 8], [17, 6], [28, 9],
    ]
    for (const [x, y] of pts) g[y * cols + x] = 1
    // add anisotropic streaks between pairs to suggest trails
    const streak = (x0: number, y0: number, x1: number, y1: number) => {
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))
      for (let k = 0; k <= n; k++) {
        const t = k / n
        const x = Math.round(x0 + (x1 - x0) * t)
        const y = Math.round(y0 + (y1 - y0) * t)
        if (x >= 0 && x < cols && y >= 0 && y < rows) g[y * cols + x] = Math.max(g[y * cols + x], 0.7)
      }
    }
    streak(8, 4, 17, 6); streak(17, 6, 20, 3); streak(20, 3, 30, 6); streak(30, 6, 33, 10)
    streak(17, 6, 24, 11); streak(24, 11, 28, 9); streak(8, 4, 12, 10); streak(12, 10, 24, 11)
    // diffuse 3x
    for (let pass = 0; pass < 3; pass++) {
      const next = new Float32Array(cols * rows)
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          let s = 0, n = 0
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const xx = x + dx, yy = y + dy
              if (xx < 0 || xx >= cols || yy < 0 || yy >= rows) continue
              s += g[yy * cols + xx]; n++
            }
          }
          next[y * cols + x] = (s / n) * 0.94
        }
      }
      g = next
    }
    const out: string[] = []
    for (let y = 0; y < rows; y++) {
      let line = ''
      for (let x = 0; x < cols; x++) {
        const v = Math.min(1, g[y * cols + x] * 2.2)
        const i = Math.max(0, Math.min(ramp.length - 1, Math.floor(v * ramp.length)))
        line += ramp[i]
      }
      out.push(line)
    }
    return out.join('\n')
  }, [])
  return <pre className="m-0 whitespace-pre text-[9px] leading-[1.0] text-[var(--color-fg)]">{lines}</pre>
}

export function ThumbChroma() {
  const ref = useRef<HTMLCanvasElement>(null)
  useThrottledRaf((t) => {
    const c = ref.current; if (!c) return
    const ctx = c.getContext('2d')!
    fitCanvas(c, ctx)
    const rect = c.getBoundingClientRect()
    const W = rect.width, H = rect.height
    ctx.fillStyle = '#08080b'
    ctx.fillRect(0, 0, W, H)
    const colors = ['#6a8cff', '#ff6a88', '#50ffd8', '#ffb86a']
    ctx.globalCompositeOperation = 'lighter'
    for (let i = 0; i < colors.length; i++) {
      const a = t * 0.0005 + (i * Math.PI * 2) / colors.length
      const rad = Math.min(W, H) * 0.3
      const cx = W / 2 + Math.cos(a) * rad * 0.6
      const cy = H / 2 + Math.sin(a * 0.7) * rad * 0.6
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(W, H) * 0.55)
      g.addColorStop(0,   colors[i] + 'aa')
      g.addColorStop(0.5, colors[i] + '22')
      g.addColorStop(1,   '#00000000')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, W, H)
    }
    ctx.globalCompositeOperation = 'source-over'
    // faint glass pane in the middle
    const pw = W * 0.55, ph = H * 0.42
    const px = (W - pw) / 2, py = (H - ph) / 2
    ctx.fillStyle = 'rgba(255,255,255,0.07)'
    ctx.fillRect(px, py, pw, ph)
    ctx.strokeStyle = 'rgba(255,255,255,0.14)'
    ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1)
    ctx.fillStyle = '#e8e8e8'
    ctx.font = '10px ui-monospace, monospace'
    ctx.textBaseline = 'middle'
    ctx.fillText('Aa  #6a8cff', px + 10, py + ph / 2)
  })
  return <canvas ref={ref} className="block h-full w-full" />
}

/* bloom thumb — static watercolor "blossom" rendered once via multiple
   overlapping radial gradients on a warm paper background. evokes wet-on-wet
   bleed without running a sim. */
export function ThumbBloom() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current; if (!c) return
    const ctx = c.getContext('2d')!
    fitCanvas(c, ctx)
    const rect = c.getBoundingClientRect()
    const W = rect.width, H = rect.height

    // warm paper
    ctx.fillStyle = 'rgb(248,244,230)'
    ctx.fillRect(0, 0, W, H)
    // faint fiber grain
    for (let i = 0; i < 180; i++) {
      ctx.fillStyle = `rgba(140,120,90,${0.03 + Math.random() * 0.04})`
      ctx.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 2, 1)
    }

    // watercolor blossoms — subtractive overlays, multiply composite
    ctx.globalCompositeOperation = 'multiply'
    const drops: Array<[number, number, number, string]> = [
      // [cx, cy, r, rgba]
      [W * 0.32, H * 0.40, Math.min(W, H) * 0.44, '83,110,190'],   // ultramarine
      [W * 0.60, H * 0.52, Math.min(W, H) * 0.38, '155, 60, 70'],  // alizarin
      [W * 0.48, H * 0.70, Math.min(W, H) * 0.32, '160,130, 60'],  // ochre
    ]
    for (const [cx, cy, r, rgb] of drops) {
      // main body
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
      g.addColorStop(0,    `rgba(${rgb},0.75)`)
      g.addColorStop(0.55, `rgba(${rgb},0.45)`)
      g.addColorStop(0.85, `rgba(${rgb},0.22)`)
      g.addColorStop(1,    `rgba(${rgb},0.00)`)
      ctx.fillStyle = g
      ctx.fillRect(0, 0, W, H)
      // darker edge ring (capillary)
      const ring = ctx.createRadialGradient(cx, cy, r * 0.70, cx, cy, r * 0.92)
      ring.addColorStop(0, `rgba(${rgb},0.00)`)
      ring.addColorStop(0.7, `rgba(${rgb},0.35)`)
      ring.addColorStop(1, `rgba(${rgb},0.00)`)
      ctx.fillStyle = ring
      ctx.fillRect(0, 0, W, H)
    }
    ctx.globalCompositeOperation = 'source-over'
  }, [])
  return <canvas ref={ref} className="block h-full w-full" />
}
