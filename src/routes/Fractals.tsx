import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Renderer, Program, Mesh, Triangle } from 'ogl'
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

const MANDEL_SPOTS: [number, number, number][] = [
  [-0.75,      0,           2.8],
  [-0.745,     0.113,       0.04],
  [-0.7463,    0.1102,      0.006],
  [-1.25,      0,           0.25],
  [0.2815,     0.0085,      0.01],
  [-1.4,       0,           0.18],
  [-0.1011,    0.9563,      0.05],
  [-1.7749,    0,           0.08],
  [0.3602,     0.1001,      0.004],
]

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

const KIND_INT: Record<Kind, number> = { mandelbrot: 0, julia: 1, burningship: 2, tricorn: 3 }

function randomPiece(rand: () => number, id: string): Piece {
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

  return { id, kind, cx, cy, scale, jc, hue: rand(), maxIter: 110 + Math.floor(rand() * 90) }
}

/* ---------------------- cpu preview renderer (tile) ---------------------- */

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
      if (p.kind === 'julia') { zx = px; zy = py; cx = p.jc![0]; cy = p.jc![1] }
      else { zx = 0; zy = 0; cx = px; cy = py }

      let i = 0
      let m = 0
      for (; i < maxIter; i++) {
        const zx2 = zx * zx, zy2 = zy * zy
        m = zx2 + zy2
        if (m > 256) break
        let nx: number, ny: number
        if (p.kind === 'burningship') { nx = zx2 - zy2 + cx; ny = 2 * Math.abs(zx * zy) + cy }
        else if (p.kind === 'tricorn') { nx = zx2 - zy2 + cx; ny = -2 * zx * zy + cy }
        else                           { nx = zx2 - zy2 + cx; ny = 2 * zx * zy + cy }
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
    return `c = ${jx.toFixed(3)} ${jy >= 0 ? '+' : '-'} ${Math.abs(jy).toFixed(3)}i`
  }
  return `@ (${p.cx.toFixed(3)}, ${p.cy.toFixed(3)}) · z×${(2.8 / p.scale).toFixed(2)}`
}

/* ---------------------- webgl dive (infinite zoom) ---------------------- */

const DIVE_FRAG = /* glsl */ `
precision highp float;
uniform vec2 uRes;
uniform vec2 uCenter;
uniform float uScale;
uniform int uKind;        // 0 mandelbrot, 1 julia, 2 burningship, 3 tricorn
uniform vec2 uJuliaC;
uniform float uMaxIter;
uniform float uHue;

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);
  vec2 p = uCenter + uv * uScale;
  vec2 z, c;
  if (uKind == 1) { z = p; c = uJuliaC; }
  else            { z = vec2(0.0); c = p; }
  float i = 0.0;
  float m = 0.0;
  for (float k = 0.0; k < 2000.0; k++) {
    if (k >= uMaxIter) break;
    float zx2 = z.x * z.x;
    float zy2 = z.y * z.y;
    m = zx2 + zy2;
    if (m > 256.0) { i = k; break; }
    vec2 nz;
    if (uKind == 2)      nz = vec2(zx2 - zy2 + c.x, 2.0 * abs(z.x * z.y) + c.y);   // burningship
    else if (uKind == 3) nz = vec2(zx2 - zy2 + c.x, -2.0 * z.x * z.y + c.y);       // tricorn
    else                 nz = vec2(zx2 - zy2 + c.x, 2.0 * z.x * z.y + c.y);        // mandelbrot/julia
    z = nz;
    i = k;
  }
  if (i >= uMaxIter - 1.0) { gl_FragColor = vec4(0.024, 0.024, 0.04, 1.0); return; }
  float smooth_i = i + 1.0 - log2(max(1e-6, log2(max(m, 2.0)) / 2.0));
  float t = pow(max(0.0, smooth_i / uMaxIter), 0.55);
  float hue = fract(uHue + t * 0.35);
  vec3 col = hsv2rgb(vec3(hue, 0.45 + t * 0.3, 0.12 + t * 0.88));
  gl_FragColor = vec4(col, 1.0);
}
`

const DIVE_VERT = /* glsl */ `
attribute vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`

function Dive({ piece, onClose }: { piece: Piece; onClose: () => void }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [hud, setHud] = useState({ cx: piece.cx, cy: piece.cy, zoom: 1, maxIter: piece.maxIter })

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return

    const renderer = new Renderer({ dpr: Math.min(window.devicePixelRatio, 2), alpha: false })
    const gl = renderer.gl
    gl.canvas.style.width = '100%'
    gl.canvas.style.height = '100%'
    gl.canvas.style.display = 'block'
    wrap.appendChild(gl.canvas)

    const geom = new Triangle(gl)
    const program = new Program(gl, {
      vertex: DIVE_VERT,
      fragment: DIVE_FRAG,
      uniforms: {
        uRes: { value: [1, 1] },
        uCenter: { value: [piece.cx, piece.cy] as [number, number] },
        uScale: { value: piece.scale },
        uKind: { value: KIND_INT[piece.kind] },
        uJuliaC: { value: piece.jc ? [...piece.jc] : [0, 0] as [number, number] },
        uMaxIter: { value: piece.maxIter },
        uHue: { value: piece.hue },
      },
    })
    const mesh = new Mesh(gl, { geometry: geom, program })

    const state = {
      center: [piece.cx, piece.cy] as [number, number],
      scale: piece.scale,
      baseScale: piece.scale,
      baseIter: piece.maxIter,
    }

    const resize = () => {
      const rect = wrap.getBoundingClientRect()
      renderer.setSize(rect.width, rect.height)
      program.uniforms.uRes.value = [gl.canvas.width, gl.canvas.height]
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    const updateIter = () => {
      // bump iter as we zoom in — keeps detail visible past float32 precision
      const zoom = state.baseScale / state.scale
      const bump = Math.max(0, Math.log2(Math.max(1, zoom))) * 55
      const iter = Math.min(1800, state.baseIter + bump)
      program.uniforms.uMaxIter.value = iter
      return iter
    }

    const render = () => {
      program.uniforms.uCenter.value = state.center
      program.uniforms.uScale.value = state.scale
      const iter = updateIter()
      renderer.render({ scene: mesh })
      setHud({ cx: state.center[0], cy: state.center[1], zoom: state.baseScale / state.scale, maxIter: iter })
    }
    render()

    // drag to pan
    let dragging = false
    let lastX = 0, lastY = 0
    const screenToWorld = (px: number, py: number): [number, number] => {
      const rect = wrap.getBoundingClientRect()
      const nx = (px - rect.left - rect.width / 2) / Math.min(rect.width, rect.height)
      const ny = (rect.height / 2 - (py - rect.top)) / Math.min(rect.width, rect.height)
      return [state.center[0] + nx * state.scale, state.center[1] + ny * state.scale]
    }
    const onDown = (e: PointerEvent) => {
      dragging = true
      lastX = e.clientX; lastY = e.clientY
      ;(e.target as Element).setPointerCapture?.(e.pointerId)
    }
    const onMove = (e: PointerEvent) => {
      if (!dragging) return
      const rect = wrap.getBoundingClientRect()
      const dx = (e.clientX - lastX) / Math.min(rect.width, rect.height)
      const dy = (e.clientY - lastY) / Math.min(rect.width, rect.height)
      state.center[0] -= dx * state.scale
      state.center[1] += dy * state.scale
      lastX = e.clientX; lastY = e.clientY
      render()
    }
    const onUp = (e: PointerEvent) => {
      dragging = false
      ;(e.target as Element).releasePointerCapture?.(e.pointerId)
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const factor = Math.pow(1.0025, e.deltaY)
      const [wx, wy] = screenToWorld(e.clientX, e.clientY)
      state.center[0] = wx + (state.center[0] - wx) * factor
      state.center[1] = wy + (state.center[1] - wy) * factor
      state.scale *= factor
      render()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'r') {
        state.center = [piece.cx, piece.cy]
        state.scale = piece.scale
        render()
      }
      // arrow keys / +- for keyboard zoom
      if (e.key === '+' || e.key === '=') { state.scale *= 0.85; render() }
      if (e.key === '-' || e.key === '_') { state.scale *= 1.17; render() }
    }
    // auto-zoom loop: hold 'z' to continuously zoom toward center
    let animRaf = 0
    const keys = new Set<string>()
    const onKD = (e: KeyboardEvent) => { keys.add(e.key.toLowerCase()); onKey(e) }
    const onKU = (e: KeyboardEvent) => { keys.delete(e.key.toLowerCase()) }
    const loop = () => {
      if (keys.has('z')) { state.scale *= 0.985; render() }
      if (keys.has('x')) { state.scale *= 1.015; render() }
      animRaf = requestAnimationFrame(loop)
    }
    animRaf = requestAnimationFrame(loop)

    wrap.addEventListener('pointerdown', onDown)
    wrap.addEventListener('pointermove', onMove)
    wrap.addEventListener('pointerup', onUp)
    wrap.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('keydown', onKD)
    window.addEventListener('keyup', onKU)

    return () => {
      ro.disconnect()
      if (animRaf) cancelAnimationFrame(animRaf)
      wrap.removeEventListener('pointerdown', onDown)
      wrap.removeEventListener('pointermove', onMove)
      wrap.removeEventListener('pointerup', onUp)
      wrap.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKD)
      window.removeEventListener('keyup', onKU)
      gl.canvas.remove()
    }
  }, [piece, onClose])

  return (
    <div className="fixed inset-0 z-50 bg-black" role="dialog" aria-modal="true">
      <div ref={wrapRef} className="h-full w-full" />

      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4 text-[11px]">
        <div className="flex items-start justify-between">
          <div className="pointer-events-auto rounded-[6px] border border-white/15 bg-black/55 px-3 py-2 backdrop-blur-md">
            <div className="tracking-[0.1em] text-white">{piece.kind}</div>
            <div className="text-white/60">{pieceLabel(piece)}</div>
          </div>
          <button
            data-interactive
            onClick={onClose}
            className="pointer-events-auto !rounded-[6px] !border-white/15 !bg-black/55 !px-3 !py-1.5 text-white hover:!border-white/60"
          >× close</button>
        </div>

        <div className="flex items-end justify-between gap-3">
          <div className="pointer-events-auto rounded-[6px] border border-white/15 bg-black/55 px-3 py-2 backdrop-blur-md">
            <div className="tabular-nums text-white/90">
              cx {hud.cx.toFixed(12)}
            </div>
            <div className="tabular-nums text-white/90">
              cy {hud.cy.toFixed(12)}
            </div>
            <div className="tabular-nums text-white/60">
              zoom ×{hud.zoom.toFixed(2)} · iter {hud.maxIter.toFixed(0)}
            </div>
          </div>
          <div className="pointer-events-auto rounded-[6px] border border-white/15 bg-black/55 px-3 py-2 tracking-[0.08em] text-white/70 backdrop-blur-md">
            drag pan · wheel / +- zoom · z zoom-in · x zoom-out · r reset · esc close
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------------------- tile ---------------------- */

function FractalTile({ piece, onOpen, onRegenerate }: { piece: Piece; onOpen: () => void; onRegenerate: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [rendered, setRendered] = useState(false)

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    let cancelled = false
    setRendered(false)
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !cancelled) {
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
  }, [piece.id])

  return (
    <figure className="flex flex-col gap-2">
      <div
        className="group relative aspect-square w-full overflow-hidden rounded-[6px] border border-[var(--color-line)] transition-colors hover:border-[var(--color-fg)]"
        style={{ background: '#070710' }}
      >
        <button
          data-interactive
          onClick={onOpen}
          className="absolute inset-0 !border-0 !p-0"
          title="click to dive in — infinite zoom"
          aria-label="dive into this fractal"
        >
          <canvas ref={canvasRef} width={256} height={256} className="block h-full w-full" />
          {!rendered && (
            <div className="absolute inset-0 grid place-items-center text-[10px] tracking-[0.18em] text-[var(--color-dim)]">
              rendering…
            </div>
          )}
          {rendered && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-full bg-gradient-to-t from-black/85 to-transparent px-2 py-2 text-[10px] tracking-[0.15em] text-white/90 opacity-0 transition-[opacity,transform] duration-150 group-hover:translate-y-0 group-hover:opacity-100">
              ⊙ dive in · infinite zoom
            </div>
          )}
        </button>
        <button
          data-interactive
          onClick={(e) => { e.stopPropagation(); onRegenerate() }}
          className="absolute right-1.5 top-1.5 z-10 !rounded-[4px] !border-white/15 !bg-black/55 !px-1.5 !py-0.5 text-[10px] text-white/80 opacity-0 backdrop-blur-md transition-opacity hover:!border-white/60 group-hover:opacity-100"
          title="regenerate this tile"
          aria-label="regenerate"
        >↻</button>
      </div>
      <figcaption className="flex items-start justify-between gap-2 text-[11px] leading-[1.35]">
        <div>
          <div className="text-[var(--color-fg)]">{piece.kind}</div>
          <div className="break-all text-[var(--color-dim)]">{pieceLabel(piece)}</div>
        </div>
        <span className="shrink-0 text-[10px] tracking-[0.1em] text-[var(--color-dim)]">#{piece.id.slice(-4)}</span>
      </figcaption>
    </figure>
  )
}

/* ---------------------- route ---------------------- */

const PAGE = 12

export default function Fractals() {
  const [params, setParams] = useSearchParams()
  const [seedRoot] = useState(() => params.get('seed') || Math.random().toString(36).slice(2, 10))
  const [pieces, setPieces] = useState<Piece[]>(() => {
    const base = hashString(seedRoot)
    return Array.from({ length: PAGE }, (_, i) =>
      randomPiece(mulberry32(base + i * 101), `${seedRoot}.${i}`),
    )
  })
  const [diving, setDiving] = useState<Piece | null>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const loadingRef = useRef(false)

  useEffect(() => {
    if (params.get('seed') === seedRoot) return
    setParams((p) => { p.set('seed', seedRoot); return p }, { replace: true })
  }, [seedRoot, params, setParams])

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
    setPieces((ps) => ps.map((p) => (
      p.id === id
        ? randomPiece(mulberry32(hashString(id) + Math.floor(Math.random() * 1e9)), `${id}.${Math.random().toString(36).slice(2, 5)}`)
        : p
    )))
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
            generative · click a tile to dive in · scroll for more
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
          <FractalTile
            key={p.id}
            piece={p}
            onOpen={() => setDiving(p)}
            onRegenerate={() => regenerate(p.id)}
          />
        ))}
      </section>

      <div ref={sentinelRef} className="grid h-24 place-items-center text-[11px] tracking-[0.2em] text-[var(--color-dim)]">
        generating more…
      </div>

      {diving && <Dive piece={diving} onClose={() => setDiving(null)} />}
    </div>
  )
}
