import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { fitCanvas, prefersReducedMotion } from '../lib/canvas'
import { stepClifford, DEFAULTS } from '../modules/attractors'
import { initState as spritesInit, step as spritesStep, render as spritesRender, type SpritesState } from '../modules/sprites'
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
    let visible = !document.hidden

    const tick = (t: number) => {
      if (!visible) return
      if (t - last >= FRAME_MS) { draw(t); last = t }
      raf = requestAnimationFrame(tick)
    }
    const start = () => {
      if (raf || reduce || !visible) return
      raf = requestAnimationFrame(tick)
    }
    const stop = () => {
      if (!raf) return
      cancelAnimationFrame(raf)
      raf = 0
    }

    const onVisibility = () => {
      visible = !document.hidden
      if (visible) {
        last = 0
        start()
      } else {
        stop()
      }
    }

    let io: IntersectionObserver | null = null
    const el = target?.current
    if (el && typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(
        ([entry]) => {
          visible = !document.hidden && !!entry?.isIntersecting
          if (visible) start()
          else stop()
        },
        { rootMargin: '120px' },
      )
      io.observe(el)
    } else {
      start()
    }

    document.addEventListener('visibilitychange', onVisibility)

    if (reduce) draw(0)

    return () => {
      stop()
      io?.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
    }
    /* eslint-disable-next-line */
  }, deps)
}

type CanvasSurface = {
  ctx: CanvasRenderingContext2D | null
  width: number
  height: number
  dpr: number
}

function useCanvasSurface(ref: RefObject<HTMLCanvasElement | null>) {
  const surfaceRef = useRef<CanvasSurface>({
    ctx: null,
    width: 0,
    height: 0,
    dpr: 1,
  })

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d') ?? null
    if (!canvas || !ctx) return

    const resize = () => {
      surfaceRef.current = {
        ctx,
        ...fitCanvas(canvas, ctx),
      }
    }

    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)

    return () => observer.disconnect()
  }, [ref])

  return surfaceRef
}


export function ThumbClifford() {
  const ref = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef({ x: 0.1, y: 0.1 })
  const surfaceRef = useCanvasSurface(ref)

  useEffect(() => {
    const { ctx, width, height } = surfaceRef.current
    if (!ctx || width === 0 || height === 0) return
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, width, height)
  }, [surfaceRef])

  useThrottledRaf(() => {
    const { ctx, width, height } = surfaceRef.current
    if (!ctx || width === 0 || height === 0) return
    ctx.fillStyle = 'rgba(0,0,0,0.06)'
    ctx.fillRect(0, 0, width, height)
    ctx.fillStyle = '#e8e8e8'
    for (let i = 0; i < 2500; i++) {
      stepClifford(stateRef.current, DEFAULTS.clifford)
      const px = width / 2 + stateRef.current.x * (width / 5)
      const py = height / 2 + stateRef.current.y * (height / 5)
      ctx.fillRect(px, py, 1, 1)
    }
  }, [], ref)
  return <canvas ref={ref} className="block h-full w-full" />
}

// live colorful julia morph — c traces a slow lissajous curve, hue drifts
export function ThumbMandelbrot() {
  const ref = useRef<HTMLCanvasElement>(null)
  const surfaceRef = useCanvasSurface(ref)
  const bufferRef = useRef<{
    canvas: HTMLCanvasElement
    ctx: CanvasRenderingContext2D
    image: ImageData
  } | null>(null)

  useEffect(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 140
    canvas.height = 88
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    bufferRef.current = {
      canvas,
      ctx,
      image: ctx.createImageData(canvas.width, canvas.height),
    }
  }, [])

  useThrottledRaf((t) => {
    const { ctx, width, height } = surfaceRef.current
    const buffer = bufferRef.current
    if (!ctx || !buffer || width === 0 || height === 0) return

    const W = buffer.canvas.width
    const H = buffer.canvas.height
    const data = buffer.image.data
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
    buffer.ctx.putImageData(buffer.image, 0, 0)
    ctx.imageSmoothingEnabled = true
    ctx.clearRect(0, 0, width, height)
    ctx.drawImage(buffer.canvas, 0, 0, width, height)
  }, [], ref)
  return <canvas ref={ref} className="block h-full w-full" />
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
  const surfaceRef = useCanvasSurface(ref)
  useThrottledRaf((t) => {
    const { ctx, width: W, height: H } = surfaceRef.current
    if (!ctx || W === 0 || H === 0) return
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

export function ThumbVoxels() {
  const blocks = [
    { x: 48, y: 74, fill: '#ff648b' },
    { x: 88, y: 50, fill: '#ff9a47' },
    { x: 128, y: 74, fill: '#63b7ff' },
    { x: 88, y: 98, fill: '#8d7bff' },
  ]

  return (
    <div className="grid h-full w-full place-items-center bg-[#05060a]">
      <svg width="220" height="160" viewBox="0 0 220 160" aria-hidden>
        {blocks.map((block, index) => (
          <g key={index} transform={`translate(${block.x} ${block.y})`}>
            <path d="M0 -24 L22 -12 L0 0 L-22 -12 Z" fill={block.fill} fillOpacity="0.92" />
            <path d="M-22 -12 L0 0 L0 24 L-22 12 Z" fill={block.fill} fillOpacity="0.52" />
            <path d="M22 -12 L0 0 L0 24 L22 12 Z" fill={block.fill} fillOpacity="0.28" />
          </g>
        ))}
        <path
          d="M34 120 L110 82 L186 120"
          fill="none"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </div>
  )
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

/* faces thumb — static 2×3 preview of representative kaomoji. */
export function ThumbFaces() {
  const faces = ['(◕‿◕)', 'ʕ•ᴥ•ʔ', '¯\\_(ツ)_/¯', '(ಠ_ಠ)', '(⌐■_■)', '(♡°▽°♡)']
  return (
    <div
      className="grid h-full w-full grid-cols-3 grid-rows-2 place-items-center gap-1 p-2"
      style={{ fontFamily: 'system-ui, -apple-system, "Segoe UI", "Hiragino Sans", "Yu Gothic", sans-serif' }}
    >
      {faces.map((f, i) => (
        <span key={i} className="truncate text-[13px] leading-none text-[var(--color-fg)]">{f}</span>
      ))}
    </div>
  )
}

// static stylized preview of the live wikipedia edits feed — not a real sse
// subscription (180 thumbs × connections would be wasteful). the route itself
// shows the actual firehose.
export function ThumbEdits() {
  const rows = [
    { t: '21:43:12', lang: 'en', user: 'jessica',    title: 'quantum mechanics',      kind: '→', delta:  '+128', bot: false },
    { t: '21:43:12', lang: 'de', user: 'anon·ip',    title: 'berliner platz',         kind: '→', delta:  '+12',  bot: false },
    { t: '21:43:12', lang: 'fr', user: 'wikibot',    title: 'paris',                  kind: '→', delta:   '0',   bot: true  },
    { t: '21:43:13', lang: 'es', user: 'carlos',     title: 'madrid',                 kind: '+', delta: '+2.1k', bot: false },
    { t: '21:43:13', lang: 'en', user: 'sarah_k',    title: 'general relativity',     kind: '→', delta:  '+44',  bot: false },
    { t: '21:43:14', lang: 'ja', user: 'kobayashi',  title: '量子力学',                kind: '→', delta:  '+8',   bot: false },
    { t: '21:43:14', lang: 'ru', user: 'petrov',     title: 'теория струн',           kind: '→', delta:  '-6',   bot: false },
    { t: '21:43:15', lang: 'it', user: 'bot-ser',    title: 'milano',                 kind: '·', delta:   '0',   bot: true  },
    { t: '21:43:15', lang: 'zh', user: 'liwei',      title: '北京',                    kind: '→', delta:  '+14',  bot: false },
  ]
  return (
    <div className="flex h-full w-full flex-col gap-[1px] overflow-hidden bg-[#0a0a0c] px-2 py-2">
      {rows.map((r, i) => {
        const opacity = Math.max(0.22, 1 - (i / rows.length) * 0.78)
        const userColor = r.bot ? 'text-[var(--color-dim)]' : 'text-[var(--color-fg)]'
        const deltaColor = r.delta.startsWith('+') ? 'text-[#9ee3a0]'
                         : r.delta.startsWith('-') ? 'text-[#ff9a8a]'
                         : 'text-[var(--color-dim)]'
        return (
          <div
            key={i}
            style={{ opacity }}
            className="flex items-baseline gap-1.5 whitespace-nowrap font-mono text-[9px] leading-[1.2]"
          >
            <span className="tabular-nums text-[var(--color-line)]">{r.t}</span>
            <span className="w-[12px] tabular-nums text-[var(--color-dim)]">{r.lang}</span>
            <span className={`truncate max-w-[50px] ${userColor}`}>{r.user}</span>
            <span className="text-[var(--color-line)]">{r.kind}</span>
            <span className="truncate flex-1 text-[var(--color-fg)]">{r.title}</span>
            <span className={`tabular-nums ${deltaColor}`}>{r.delta}</span>
          </div>
        )
      })}
    </div>
  )
}

// pigment drift — a tiny static render using the real RYB generator.
// we render once on mount with low particle count so the thumb reflects
// actual pipeline output rather than a faked painting.
export function ThumbPigment() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current; if (!c) return
    const ctx = c.getContext('2d')!
    fitCanvas(c, ctx)
    const rect = c.getBoundingClientRect()
    const W = Math.max(1, Math.floor(rect.width))
    const H = Math.max(1, Math.floor(rect.height))
    // defer the heavy generate() call off the mount tick
    const id = setTimeout(() => {
      // dynamic import to keep the thumb chunk out of the critical Thumb bundle
      Promise.all([
        import('../modules/pigment/generate'),
      ]).then(([mod]) => {
        const img = ctx.createImageData(W, H)
        mod.generate(img, {
          ...mod.DEFAULTS,
          density: 22000,
          ribbons: 4,
          harmonics: 4,
          warp: 90,
          grain: 2.0,
          seed: 0x51a7,
        })
        ctx.putImageData(img, 0, 0)
      }).catch(() => { /* ignore */ })
    }, 40)
    return () => clearTimeout(id)
  }, [])
  return (
    <canvas
      ref={ref}
      className="block h-full w-full"
      style={{ background: 'rgb(7,8,13)' }}
    />
  )
}
