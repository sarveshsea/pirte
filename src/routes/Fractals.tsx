import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { mulberry32, hashString } from '../lib/rng'

type Kind = 'mandelbrot' | 'julia' | 'burningship' | 'tricorn'

type Piece = {
  id: string
  kind: Kind
  cx: number
  cy: number
  scale: number
  jc?: [number, number]
  hue: number
  maxIter: number
}

// juicy mandelbrot regions — each (cx, cy, scale)
const MANDEL_SPOTS: [number, number, number][] = [
  [-0.75,      0,           2.8],    // classic
  [-0.745,     0.113,       0.04],   // seahorse valley
  [-0.7463,    0.1102,      0.006],  // deep seahorse
  [-1.25,      0,           0.25],   // elephant valley
  [0.2815,     0.0085,      0.01],   // mini-mandelbrot
  [-1.4,       0,           0.18],   // antenna
  [-0.1011,    0.9563,      0.05],   // spirals north
  [-1.7749,    0,           0.08],   // minibrot on real axis
  [0.3602,     0.1001,      0.004],  // double spiral
]

// lovely julia constants near the boundary
const JULIA_CS: [number, number][] = [
  [-0.8,     0.156],
  [0.285,    0.01],
  [-0.4,     0.6],
  [0.355,    0.355],
  [-0.7269,  0.1889],
  [-0.75,    0],
  [-0.70176, -0.3842],
  [0.285,    0.013],
  [-0.835,   -0.2321],
  [-0.1,     0.651],
  [-0.123,   0.745],
  [0.37,    -0.1],
]

function randomPiece(rand: () => number, id: string): Piece {
  // weight julia more heavily — they're the juiciest visually
  const roll = rand()
  let kind: Kind
  if (roll < 0.48) kind = 'julia'
  else if (roll < 0.78) kind = 'mandelbrot'
  else if (roll < 0.9) kind = 'burningship'
  else kind = 'tricorn'

  let cx = 0, cy = 0, scale = 3
  let jc: [number, number] | undefined

  if (kind === 'mandelbrot') {
    const [sx, sy, ss] = MANDEL_SPOTS[Math.floor(rand() * MANDEL_SPOTS.length)]
    cx = sx + (rand() - 0.5) * ss * 0.2
    cy = sy + (rand() - 0.5) * ss * 0.2
    scale = ss * (0.7 + rand() * 0.6)
  } else if (kind === 'julia') {
    const [jx, jy] = JULIA_CS[Math.floor(rand() * JULIA_CS.length)]
    jc = [jx + (rand() - 0.5) * 0.02, jy + (rand() - 0.5) * 0.02]
    cx = 0; cy = 0
    scale = 2.6 + rand() * 0.4
  } else if (kind === 'burningship') {
    cx = -0.5 + (rand() - 0.5) * 0.4
    cy = -0.55 + (rand() - 0.5) * 0.4
    scale = 2.8 + rand() * 0.6
  } else {
    cx = -0.1 + (rand() - 0.5) * 0.4
    cy = 0
    scale = 2.8 + rand() * 0.6
  }

  return {
    id,
    kind,
    cx, cy, scale, jc,
    hue: rand(),
    maxIter: 110 + Math.floor(rand() * 90),
  }
}

function hsv2rgb(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6)
  const f = h * 6 - i
  const p = v * (1 - s)
  const q = v * (1 - f * s)
  const t = v * (1 - (1 - f) * s)
  let r = 0, g = 0, b = 0
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break
    case 1: r = q; g = v; b = p; break
    case 2: r = p; g = v; b = t; break
    case 3: r = p; g = q; b = v; break
    case 4: r = t; g = p; b = v; break
    case 5: r = v; g = p; b = q; break
  }
  return [r * 255, g * 255, b * 255]
}

function renderPiece(canvas: HTMLCanvasElement, p: Piece) {
  const ctx = canvas.getContext('2d')!
  const w = canvas.width, h = canvas.height
  const img = ctx.createImageData(w, h)
  const data = img.data
  const maxIter = p.maxIter
  const aspect = w / h

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = p.cx + ((x / w) - 0.5) * p.scale * aspect
      const py = p.cy + ((y / h) - 0.5) * p.scale

      let zx: number, zy: number, cx: number, cy: number
      if (p.kind === 'julia') {
        zx = px; zy = py; cx = p.jc![0]; cy = p.jc![1]
      } else {
        zx = 0; zy = 0; cx = px; cy = py
      }

      let i = 0
      let m = 0
      for (; i < maxIter; i++) {
        const zx2 = zx * zx, zy2 = zy * zy
        m = zx2 + zy2
        if (m > 256) break
        let nx: number, ny: number
        if (p.kind === 'burningship') {
          nx = zx2 - zy2 + cx
          ny = 2 * Math.abs(zx * zy) + cy
        } else if (p.kind === 'tricorn') {
          nx = zx2 - zy2 + cx
          ny = -2 * zx * zy + cy
        } else {
          nx = zx2 - zy2 + cx
          ny = 2 * zx * zy + cy
        }
        zx = nx; zy = ny
      }

      const idx = (y * w + x) * 4
      if (i >= maxIter) {
        data[idx] = 6; data[idx + 1] = 6; data[idx + 2] = 10; data[idx + 3] = 255
      } else {
        const smooth = i + 1 - Math.log2(Math.max(1e-6, Math.log2(Math.max(m, 2)) / 2))
        const tnorm = Math.pow(Math.max(0, smooth / maxIter), 0.55)
        const hue = (p.hue + tnorm * 0.35) % 1
        const [r, g, b] = hsv2rgb(hue, 0.45 + tnorm * 0.3, 0.12 + tnorm * 0.88)
        data[idx] = r | 0; data[idx + 1] = g | 0; data[idx + 2] = b | 0; data[idx + 3] = 255
      }
    }
  }
  ctx.putImageData(img, 0, 0)
}

function pieceLabel(p: Piece): string {
  if (p.kind === 'julia') {
    const [jx, jy] = p.jc!
    return `c = ${jx.toFixed(3)} ${jy >= 0 ? '+' : '-'} ${Math.abs(jy).toFixed(3)}i · iter ${p.maxIter}`
  }
  if (p.kind === 'mandelbrot') {
    return `@ (${p.cx.toFixed(3)}, ${p.cy.toFixed(3)}) · z×${(2.8 / p.scale).toFixed(2)}`
  }
  return `@ (${p.cx.toFixed(2)}, ${p.cy.toFixed(2)}) · z×${(2.8 / p.scale).toFixed(2)}`
}

/* ------------------ tile: lazy-renders on scroll into view ------------------ */

function FractalTile({ piece, onRegenerate }: { piece: Piece; onRegenerate: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [rendered, setRendered] = useState(false)
  const [hover, setHover] = useState(false)

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    let cancelled = false
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !rendered && !cancelled) {
            // defer 1 rAF so the placeholder shows first
            requestAnimationFrame(() => {
              if (cancelled) return
              renderPiece(el, piece)
              setRendered(true)
            })
            obs.disconnect()
            return
          }
        }
      },
      { rootMargin: '300px 0px' },
    )
    obs.observe(el)
    return () => { cancelled = true; obs.disconnect() }
  }, [piece.id, rendered])

  return (
    <figure
      className="flex flex-col gap-2"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        data-interactive
        onClick={onRegenerate}
        className="group relative block aspect-square w-full overflow-hidden !rounded-[6px] !border !border-[var(--color-line)] !p-0 hover:!border-[var(--color-fg)]"
        style={{ background: '#070710' }}
        title="click to regenerate"
      >
        <canvas ref={canvasRef} width={256} height={256} className="block h-full w-full" />
        {!rendered && (
          <div className="absolute inset-0 grid place-items-center text-[10px] tracking-[0.18em] text-[var(--color-dim)]">
            rendering…
          </div>
        )}
        {hover && rendered && (
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1.5 text-[10px] tracking-[0.08em] text-[var(--color-fg)]">
            ↻ regenerate
          </div>
        )}
      </button>
      <figcaption className="flex items-start justify-between gap-2 text-[11px] leading-[1.35]">
        <div>
          <div className="text-[var(--color-fg)]">{piece.kind}</div>
          <div className="break-all text-[var(--color-dim)]">{pieceLabel(piece)}</div>
        </div>
        <span className="shrink-0 text-[10px] tracking-[0.1em] text-[var(--color-dim)]">#{piece.id.slice(0, 4)}</span>
      </figcaption>
    </figure>
  )
}

/* ------------------ route ------------------ */

const PAGE = 12

export default function Fractals() {
  const [params, setParams] = useSearchParams()
  const [seedRoot] = useState(() => {
    const fromUrl = params.get('seed')
    return fromUrl || Math.random().toString(36).slice(2, 10)
  })
  const [pieces, setPieces] = useState<Piece[]>(() => {
    const base = hashString(seedRoot)
    return Array.from({ length: PAGE }, (_, i) =>
      randomPiece(mulberry32(base + i * 101), `${seedRoot}.${i}`),
    )
  })
  const sentinelRef = useRef<HTMLDivElement>(null)
  const loadingRef = useRef(false)

  // keep the seed in the URL so refresh → same first page
  useEffect(() => {
    if (params.get('seed') === seedRoot) return
    setParams((p) => { p.set('seed', seedRoot); return p }, { replace: true })
  }, [seedRoot, params, setParams])

  // infinite scroll: append more when sentinel nears viewport
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !loadingRef.current) {
          loadingRef.current = true
          setPieces((ps) => {
            const base = hashString(seedRoot) + ps.length * 101
            const more = Array.from({ length: PAGE }, (_, i) =>
              randomPiece(mulberry32(base + i), `${seedRoot}.${ps.length + i}`),
            )
            return [...ps, ...more]
          })
          setTimeout(() => { loadingRef.current = false }, 120)
        }
      },
      { rootMargin: '600px 0px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [seedRoot])

  const regenerate = (id: string) => {
    setPieces((ps) => ps.map((p) => (p.id === id ? randomPiece(Math.random, `${seedRoot}.re.${Math.random().toString(36).slice(2, 6)}`) : p)))
  }

  const newSeed = () => {
    const s = Math.random().toString(36).slice(2, 10)
    setParams((p) => { p.set('seed', s); return p }, { replace: true })
    const base = hashString(s)
    setPieces(Array.from({ length: PAGE }, (_, i) =>
      randomPiece(mulberry32(base + i * 101), `${s}.${i}`),
    ))
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--color-line)] pb-4">
        <div>
          <h1 className="text-[32px] leading-none tracking-[-0.02em] text-[var(--color-fg)]">fractals</h1>
          <div className="mt-2 text-[11px] tracking-[0.12em] text-[var(--color-dim)]">
            generative · mandelbrot · julia · burning ship · tricorn · scroll for more
          </div>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-[var(--color-dim)]">
          <span className="tabular-nums">{pieces.length} rendered</span>
          <span className="text-[var(--color-line)]">·</span>
          <span>seed <span className="text-[var(--color-fg)]">{seedRoot}</span></span>
          <button data-interactive onClick={newSeed} className="!px-3 !py-1 text-[11px]">+ new seed</button>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {pieces.map((p) => (
          <FractalTile key={p.id} piece={p} onRegenerate={() => regenerate(p.id)} />
        ))}
      </section>

      <div ref={sentinelRef} className="grid h-24 place-items-center text-[11px] tracking-[0.2em] text-[var(--color-dim)]">
        generating more…
      </div>
    </div>
  )
}
