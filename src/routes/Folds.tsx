import { useEffect, useMemo, useRef, useState } from 'react'
import { noise2 } from '../lib/perlin'
import { mulberry32, hashString } from '../lib/rng'
import { prefersReducedMotion } from '../lib/canvas'

/* ========================================================================== *
 *  folds — an are.na-style masonry of generative pieces.                     *
 * ========================================================================== */

type PieceMeta = {
  title: string
  medium: string
  year: string
  tag: 'symmetric' | 'dense' | 'scatter' | 'pixel' | 'typographic' | 'data'
}

/* ---------- piece 1 — symmetric rorschach (mirrored perlin blob) ---------- */

function Rorschach({ seed }: { seed: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current; if (!c) return
    const ctx = c.getContext('2d')!
    const rect = c.getBoundingClientRect()
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    c.width = rect.width * dpr; c.height = rect.height * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const W = rect.width, H = rect.height
    const img = ctx.createImageData(W, H)
    const half = W / 2
    const scale = 0.012
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const mx = x < half ? x : W - x - 1
        const nx = mx * scale
        const ny = y * scale
        const n =
          noise2(nx + seed, ny) * 0.6 +
          noise2(nx * 2.1 + seed, ny * 2.1) * 0.3 +
          noise2(nx * 4.3, ny * 4.3) * 0.1
        const d = (mx / half) * 0.6 + (y / H) * 0 + (0.5 - Math.abs(y / H - 0.5))
        const v = n * 0.5 + 0.5 - d * 0.35
        const on = v > 0.52
        const edge = Math.abs(v - 0.52) < 0.02
        const i = (y * W + x) * 4
        const c1 = on ? (edge ? 220 : 235) : 18
        img.data[i] = c1; img.data[i + 1] = c1; img.data[i + 2] = c1; img.data[i + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
  }, [seed])
  return <canvas ref={ref} className="block h-full w-full" style={{ background: '#0a0a0a' }} />
}

/* ---------- piece 2 — dense typographic crest (symmetric char density) ---- */

function DenseCrest({ seed }: { seed: number }) {
  const lines = useMemo(() => {
    const cols = 56
    const rows = 32
    const chars = ' .·-=+*#%@'
    const half = cols / 2
    const out: string[] = []
    for (let y = 0; y < rows; y++) {
      let line = ''
      for (let x = 0; x < cols; x++) {
        const mx = x < half ? x : cols - x - 1
        const n =
          noise2(mx * 0.12 + seed * 0.01, y * 0.12) * 0.6 +
          noise2(mx * 0.3 + seed, y * 0.3) * 0.3 +
          noise2(mx * 0.7, y * 0.7) * 0.1
        const centerPull = 1 - Math.abs(mx / half - 0.5) * 1.2
        const v = (n * 0.5 + 0.5) * Math.max(0, centerPull)
        const idx = Math.min(chars.length - 1, Math.max(0, Math.floor(v * chars.length * 1.1)))
        line += chars[idx]
      }
      out.push(line)
    }
    return out.join('\n')
  }, [seed])
  return (
    <div className="grid h-full w-full place-items-center p-3" style={{ background: '#0a0a0a' }}>
      <pre className="m-0 whitespace-pre text-[9px] leading-[1.0] text-[#eaeaea]">{lines}</pre>
    </div>
  )
}

/* ---------- piece 3 — scatter digits on black -------------------------- */

function ScatterDigits({ seed }: { seed: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current; if (!c) return
    const ctx = c.getContext('2d')!
    const rect = c.getBoundingClientRect()
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    c.width = rect.width * dpr; c.height = rect.height * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#0a0a0a'
    ctx.fillRect(0, 0, rect.width, rect.height)
    const rand = mulberry32(seed)
    ctx.font = '11px "JetBrains Mono Variable", monospace'
    const glyphs = '0123456789abcdef'
    const n = 380
    for (let i = 0; i < n; i++) {
      const x = rand() * rect.width
      const y = rand() * rect.height
      const g = glyphs[Math.floor(rand() * glyphs.length)]
      ctx.fillStyle = rand() < 0.1 ? '#e8e8e8' : rand() < 0.4 ? '#888' : '#444'
      ctx.fillText(g, x, y)
    }
  }, [seed])
  return <canvas ref={ref} className="block h-full w-full" />
}

/* ---------- piece 4 — pixel mosaic from a seeded bitmap ---------------- */

function PixelMosaic({ seed }: { seed: number }) {
  const cells = useMemo(() => {
    const rand = mulberry32(seed)
    const cols = 22
    const rows = 14
    // build a blobby mask via a few radial centers
    const centers = Array.from({ length: 3 }, () => ({
      x: rand() * cols,
      y: rand() * rows,
      r: 3 + rand() * 5,
    }))
    const data: { on: boolean; shade: number }[] = []
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        let inside = 0
        for (const c of centers) {
          const d = Math.hypot(x - c.x, y - c.y)
          if (d < c.r) inside = Math.max(inside, 1 - d / c.r)
        }
        data.push({ on: inside > 0.25, shade: inside })
      }
    }
    return { cols, rows, data }
  }, [seed])
  return (
    <div
      className="grid h-full w-full"
      style={{
        gridTemplateColumns: `repeat(${cells.cols}, 1fr)`,
        gridTemplateRows: `repeat(${cells.rows}, 1fr)`,
        background: '#0a0a0a',
        gap: '1px',
        padding: '1px',
      }}
    >
      {cells.data.map((c, i) => {
        const shade = c.on ? Math.floor(120 + c.shade * 135) : 20
        return <div key={i} style={{ background: `rgb(${shade},${shade},${shade})` }} />
      })}
    </div>
  )
}

/* ---------- piece 5 — rotating ascii globe ----------------------------- */

function ASCIIGlobe() {
  const preRef = useRef<HTMLPreElement>(null)
  useEffect(() => {
    let raf = 0
    const cols = 44, rows = 22
    const reduce = prefersReducedMotion()
    const tick = (t: number) => {
      const grid: string[][] = Array.from({ length: rows }, () => Array(cols).fill(' '))
      const cx = cols / 2, cy = rows / 2
      const R = Math.min(cx - 1, cy - 1) - 0.5
      const phase = reduce ? 0 : t * 0.00035
      for (let lat = -90; lat <= 90; lat += 6) {
        const latR = (lat * Math.PI) / 180
        for (let lon = -180; lon <= 180; lon += 6) {
          const lonR = (lon * Math.PI) / 180 + phase
          const x3 = Math.cos(latR) * Math.cos(lonR)
          const y3 = Math.sin(latR)
          const z3 = Math.cos(latR) * Math.sin(lonR)
          if (z3 < 0) continue
          const sx = Math.round(cx + x3 * R * 1.9)
          const sy = Math.round(cy - y3 * R)
          if (sx < 0 || sx >= cols || sy < 0 || sy >= rows) continue
          const depth = z3
          const ramp = '.·:-=+*#%@'
          const ch = ramp[Math.min(ramp.length - 1, Math.floor(depth * ramp.length))]
          if (ramp.indexOf(grid[sy][sx]) < ramp.indexOf(ch)) grid[sy][sx] = ch
        }
      }
      if (preRef.current) preRef.current.textContent = grid.map((r) => r.join('')).join('\n')
      if (!reduce) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => { if (raf) cancelAnimationFrame(raf) }
  }, [])
  return (
    <div className="grid h-full w-full place-items-center" style={{ background: '#0a1436' }}>
      <pre ref={preRef} className="m-0 whitespace-pre text-[12px] leading-[1.0]" style={{ color: '#a6d7ff' }} />
    </div>
  )
}

/* ---------- piece 6 — spectrum bars (blue gradient) -------------------- */

function SpectrumBars({ seed }: { seed: number }) {
  const bars = useMemo(() => {
    const rand = mulberry32(seed)
    return Array.from({ length: 48 }, () => 0.15 + rand() * 0.85)
  }, [seed])
  return (
    <div className="flex h-full w-full items-end gap-[2px] px-3 pb-3 pt-8" style={{ background: '#e8eaf2' }}>
      {bars.map((h, i) => {
        const hue = 205 + (i / bars.length) * 30
        const lum = 30 + h * 40
        return (
          <div
            key={i}
            className="flex-1"
            style={{ height: `${h * 100}%`, background: `hsl(${hue} 85% ${lum}%)` }}
          />
        )
      })}
    </div>
  )
}

/* ---------- piece 7 — zine cover card (typography) --------------------- */

function ZineCover({ seed }: { seed: number }) {
  const rand = mulberry32(seed)
  const num = String(Math.floor(rand() * 90 + 10))
  return (
    <div className="relative flex h-full w-full flex-col justify-between p-5" style={{ background: '#1b2aa3', color: '#e0e6ff' }}>
      <div>
        <div className="text-[12px] tracking-[0.2em] opacity-70">practica artistica</div>
        <div className="mt-1 text-[12px] tracking-[0.1em] opacity-50">vol. {num} · folds</div>
      </div>
      <div>
        <div className="text-[22px] leading-[1.05] tracking-[-0.01em]">it all folds<br/>to where<br/>it came from.</div>
        <div className="mt-3 text-[12px] tracking-[0.15em] opacity-70">sarvesh · 2026</div>
      </div>
      <div className="absolute right-4 top-4 flex h-6 w-6 items-center justify-center border border-[#e0e6ff]/40 text-[12px]">?</div>
    </div>
  )
}

/* ---------- piece 8 — face detection overlay --------------------------- */

function FaceDetect({ seed }: { seed: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current; if (!c) return
    const ctx = c.getContext('2d')!
    const rect = c.getBoundingClientRect()
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    c.width = rect.width * dpr; c.height = rect.height * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    // background noise like a blurry crowd
    const img = ctx.createImageData(rect.width, rect.height)
    for (let y = 0; y < rect.height; y++) {
      for (let x = 0; x < rect.width; x++) {
        const n = noise2(x * 0.02 + seed, y * 0.02) * 0.5 + 0.5
        const v = Math.floor(30 + n * 60)
        const i = (y * rect.width + x) * 4
        img.data[i] = v; img.data[i + 1] = v + 8; img.data[i + 2] = v + 24; img.data[i + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
    // detection boxes
    const rand = mulberry32(seed)
    ctx.strokeStyle = '#6cc8ff'
    ctx.fillStyle = '#6cc8ff'
    ctx.font = '10px "JetBrains Mono Variable", monospace'
    ctx.lineWidth = 1
    for (let i = 0; i < 14; i++) {
      const w = 28 + rand() * 40
      const h = 28 + rand() * 40
      const x = rand() * (rect.width - w)
      const y = rand() * (rect.height - h)
      ctx.strokeRect(x, y, w, h)
      const conf = (20 + rand() * 80).toFixed(2)
      ctx.fillText(conf, x + 2, y - 4)
    }
  }, [seed])
  return <canvas ref={ref} className="block h-full w-full" />
}

/* ---------- piece 9 — particle walk trace ------------------------------ */

function ParticleWalk({ seed }: { seed: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current; if (!c) return
    const ctx = c.getContext('2d')!
    const rect = c.getBoundingClientRect()
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    c.width = rect.width * dpr; c.height = rect.height * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#0a0a0a'
    ctx.fillRect(0, 0, rect.width, rect.height)
    const rand = mulberry32(seed)
    const agents = Array.from({ length: 140 }, () => ({
      x: rand() * rect.width,
      y: rand() * rect.height,
    }))
    ctx.fillStyle = '#e8e8e8'
    for (let step = 0; step < 200; step++) {
      for (const a of agents) {
        const nx = noise2(a.x * 0.008 + seed, a.y * 0.008)
        const ny = noise2(a.x * 0.008 + seed + 31.7, a.y * 0.008 + 17.1)
        const ang = Math.atan2(ny, nx) * 2
        a.x += Math.cos(ang) * 1.4
        a.y += Math.sin(ang) * 1.4
        if (a.x < 0 || a.x > rect.width || a.y < 0 || a.y > rect.height) continue
        ctx.globalAlpha = 0.08
        ctx.fillRect(a.x, a.y, 1, 1)
      }
    }
    ctx.globalAlpha = 1
  }, [seed])
  return <canvas ref={ref} className="block h-full w-full" />
}

/* ---------- piece 10 — silhouette crest ------------------------------- */

function SilhouetteCrest({ seed }: { seed: number }) {
  const lines = useMemo(() => {
    const cols = 28, rows = 22
    const half = cols / 2
    const out: string[] = []
    for (let y = 0; y < rows; y++) {
      let line = ''
      for (let x = 0; x < cols; x++) {
        const mx = x < half ? x : cols - x - 1
        const n1 = noise2(mx * 0.22 + seed * 0.1, y * 0.22) * 0.5 + 0.5
        const n2 = noise2(mx * 0.45 + seed, y * 0.45) * 0.3 + 0.5
        const centerY = 1 - Math.abs(y / rows - 0.5) * 1.6
        const pull = 1 - Math.abs(mx / half - 0.55) * 1.2
        const v = (n1 * 0.6 + n2 * 0.4) * Math.max(0, centerY) * Math.max(0, pull)
        line += v > 0.42 ? '█' : ' '
      }
      out.push(line)
    }
    return out.join('\n')
  }, [seed])
  return (
    <div className="grid h-full w-full place-items-center" style={{ background: '#f4f3ed' }}>
      <pre className="m-0 whitespace-pre text-[13px] leading-[0.95] text-[#111]">{lines}</pre>
    </div>
  )
}

/* ---------- piece card wrapper with caption ---------------------------- */

function PieceCard({
  meta,
  height,
  children,
}: {
  meta: PieceMeta
  height: number
  children: React.ReactNode
}) {
  return (
    <figure className="mb-5 inline-block w-full break-inside-avoid">
      <div
        className="tile tile-interactive relative overflow-hidden border border-[var(--color-line)]"
        style={{ aspectRatio: undefined, height: `${height}px`, borderRadius: '8px' }}
      >
        <span className="tile-bracket tl" aria-hidden />
        <span className="tile-bracket tr" aria-hidden />
        <span className="tile-bracket bl" aria-hidden />
        <span className="tile-bracket br" aria-hidden />
        <div className="absolute inset-0">{children}</div>
      </div>
      <figcaption className="mt-2 flex items-start justify-between gap-2 text-[13px]">
        <div>
          <div className="text-[var(--color-fg)]">{meta.title}</div>
          <div className="text-[var(--color-dim)]">{meta.medium} · {meta.year}</div>
        </div>
        <span className="tracking-[0.1em] text-[var(--color-dim)]">#{meta.tag}</span>
      </figcaption>
    </figure>
  )
}

/* ---------- main route ------------------------------------------------ */

type Tab = 'all' | 'symmetric' | 'dense' | 'scatter' | 'pixel' | 'typographic' | 'data'
const TABS: Tab[] = ['all', 'symmetric', 'dense', 'scatter', 'pixel', 'typographic', 'data']

export default function Folds() {
  const [tab, setTab] = useState<Tab>('all')
  const [query, setQuery] = useState('')
  const [seedSalt, setSeedSalt] = useState(0)

  const pieces = useMemo(() => {
    const base = seedSalt * 97
    return [
      { meta: { title: 'it all folds to where it came from.',  medium: 'ink on card',           year: '2026', tag: 'typographic' as const }, h: 320, render: (s: number) => <ZineCover seed={s} /> },
      { meta: { title: 'rorschach · study i',                   medium: 'mirrored perlin',       year: '2026', tag: 'symmetric' as const },   h: 260, render: (s: number) => <Rorschach seed={s} /> },
      { meta: { title: 'crest · in two voices',                 medium: 'ascii density field',   year: '2026', tag: 'dense' as const },       h: 340, render: (s: number) => <DenseCrest seed={s} /> },
      { meta: { title: 'scatter · 380 hex glyphs',              medium: 'seeded random · mono',  year: '2026', tag: 'scatter' as const },     h: 220, render: (s: number) => <ScatterDigits seed={s} /> },
      { meta: { title: 'mosaic · blob ii',                      medium: 'quantized bitmap',      year: '2026', tag: 'pixel' as const },       h: 200, render: (s: number) => <PixelMosaic seed={s} /> },
      { meta: { title: 'the moon goes the long way round',      medium: 'ascii globe',           year: '2026', tag: 'data' as const },        h: 260, render: (_: number) => <ASCIIGlobe /> },
      { meta: { title: 'frequency analysis · band 01',          medium: 'hsl spectrum',          year: '2026', tag: 'data' as const },        h: 220, render: (s: number) => <SpectrumBars seed={s} /> },
      { meta: { title: 'surveillance · crowd n=14',             medium: 'detection overlay',     year: '2026', tag: 'data' as const },        h: 260, render: (s: number) => <FaceDetect seed={s} /> },
      { meta: { title: 'walk i · 140 agents, 200 steps',        medium: 'perlin flow trace',     year: '2026', tag: 'scatter' as const },     h: 300, render: (s: number) => <ParticleWalk seed={s} /> },
      { meta: { title: 'silhouette · emblem',                   medium: 'ascii mirror on paper', year: '2026', tag: 'symmetric' as const },   h: 280, render: (s: number) => <SilhouetteCrest seed={s} /> },
      { meta: { title: 'rorschach · study ii',                  medium: 'mirrored perlin',       year: '2026', tag: 'symmetric' as const },   h: 220, render: (s: number) => <Rorschach seed={s + 7} /> },
      { meta: { title: 'scatter · 380 hex glyphs · ii',         medium: 'seeded random · mono',  year: '2026', tag: 'scatter' as const },     h: 280, render: (s: number) => <ScatterDigits seed={s + 11} /> },
    ].map((p) => ({ ...p, seed: hashString(p.meta.title) + base }))
  }, [seedSalt])

  const filtered = pieces.filter((p) => {
    if (tab !== 'all' && p.meta.tag !== tab) return false
    if (query && !p.meta.title.toLowerCase().includes(query.toLowerCase()) && !p.meta.medium.toLowerCase().includes(query.toLowerCase())) return false
    return true
  })

  return (
    <div className="flex w-full flex-col gap-8">
      {/* top chrome mimicking the are.na-style header */}
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--color-line)] pb-3">
          <div className="flex items-center gap-2">
            <span className="inline-block h-[22px] w-[12px] rounded-[3px] bg-[var(--color-fg)]" aria-hidden />
            <span className="text-[13px] text-[var(--color-fg)]">pirte/folds</span>
          </div>
          <nav className="ml-4 flex items-center gap-1 text-[12px]">
            {TABS.map((t) => (
              <button
                key={t}
                data-interactive
                onClick={() => setTab(t)}
                className={`!px-3 !py-1 ${t === tab ? '!border-[var(--color-fg)] text-[var(--color-fg)]' : '!border-transparent text-[var(--color-dim)]'}`}
              >
                {t}
                {t !== 'all' && tab === t && <span className="ml-2 text-[12px] text-[var(--color-dim)]">{filtered.length}</span>}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-[6px] border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-1.5">
              <span className="text-[13px] text-[var(--color-dim)]">⌕</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="search in it all folds to where…"
                className="w-[260px] bg-transparent text-[12px] text-[var(--color-fg)] outline-none placeholder:text-[var(--color-dim)]"
              />
            </div>
            <button data-interactive onClick={() => setSeedSalt((s) => s + 1)} className="!px-3 !py-1.5 text-[12px]">+ new fold</button>
          </div>
        </div>

        <div className="flex items-end justify-between gap-6">
          <div>
            <h1 className="text-[40px] leading-none tracking-[-0.02em] text-[var(--color-fg)]">it all folds to where it came from.</h1>
            <div className="mt-2 text-[13px] tracking-[0.12em] text-[var(--color-dim)]">{filtered.length} pieces · curated · last updated just now</div>
          </div>
          <div className="hidden flex-col items-end text-[13px] text-[var(--color-dim)] md:flex">
            <span>a small room of generative symmetry,</span>
            <span>dense typography, and quiet noise.</span>
          </div>
        </div>
      </header>

      {/* masonry grid */}
      <section
        style={{ columnCount: undefined }}
        className="[column-gap:20px] [column-count:1] sm:[column-count:2] lg:[column-count:3] xl:[column-count:4]"
      >
        {filtered.map((p) => (
          <PieceCard key={p.meta.title} meta={p.meta} height={p.h}>
            {p.render(p.seed)}
          </PieceCard>
        ))}
      </section>

      {filtered.length === 0 && (
        <div className="grid place-items-center py-16 text-[var(--color-dim)]">
          <span>no folds match that query.</span>
        </div>
      )}
    </div>
  )
}
