import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Tile from '../components/Tile'
import Slider from '../components/Slider'
import { fitCanvas, prefersReducedMotion } from '../lib/canvas'
import {
  DEFAULTS,
  stepClifford,
  stepDeJong,
  stepLorenz,
  randomClifford,
  randomDeJong,
  type AttractorKind,
} from '../modules/attractors'

function parseNumTuple(s: string | null, n: number): number[] | null {
  if (!s) return null
  const parts = s.split(',').map((v) => parseFloat(v))
  if (parts.length !== n || parts.some((v) => !Number.isFinite(v))) return null
  return parts
}

export default function Attractors() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [params, setParams] = useSearchParams()

  const initialKind = (() => {
    const k = params.get('k')
    return k === 'lorenz' || k === 'clifford' || k === 'dejong' ? k : 'clifford'
  })() as AttractorKind
  const cliffTuple = parseNumTuple(params.get('abcd'), 4)
  const dejongTuple = parseNumTuple(params.get('dj'), 4)
  const lorTuple = parseNumTuple(params.get('srb'), 3)

  const [kind, setKind] = useState<AttractorKind>(initialKind)
  const [lorenz, setLorenz] = useState(
    lorTuple ? { sigma: lorTuple[0], rho: lorTuple[1], beta: lorTuple[2] } : DEFAULTS.lorenz,
  )
  const [clifford, setClifford] = useState(
    cliffTuple ? { a: cliffTuple[0], b: cliffTuple[1], c: cliffTuple[2], d: cliffTuple[3] } : DEFAULTS.clifford,
  )
  const [dejong, setDejong] = useState(
    dejongTuple ? { a: dejongTuple[0], b: dejongTuple[1], c: dejongTuple[2], d: dejongTuple[3] } : DEFAULTS.dejong,
  )
  const [trail, setTrail] = useState(() => {
    const t = parseFloat(params.get('t') ?? '')
    return Number.isFinite(t) && t >= 0.01 && t <= 0.3 ? t : 0.06
  })

  useEffect(() => {
    const t = setTimeout(() => {
      setParams((p) => {
        p.set('k', kind)
        p.set('abcd', [clifford.a, clifford.b, clifford.c, clifford.d].map((v) => v.toFixed(3)).join(','))
        p.set('dj',   [dejong.a, dejong.b, dejong.c, dejong.d].map((v) => v.toFixed(3)).join(','))
        p.set('srb',  [lorenz.sigma, lorenz.rho, lorenz.beta].map((v) => v.toFixed(3)).join(','))
        p.set('t', trail.toFixed(3))
        return p
      }, { replace: true })
    }, 300)
    return () => clearTimeout(t)
  }, [kind, clifford, dejong, lorenz, trail, setParams])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let raf = 0
    let lorenzState = { x: 0.1, y: 0, z: 0 }
    let flatState = { x: 0.1, y: 0.1 }

    const resize = () => fitCanvas(canvas, ctx)
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const reduce = prefersReducedMotion()

    const loop = () => {
      const { width, height } = canvas.getBoundingClientRect()
      ctx.fillStyle = `rgba(0,0,0,${trail})`
      ctx.fillRect(0, 0, width, height)
      ctx.fillStyle = '#e8e8e8'

      const iters = kind === 'lorenz' ? 1500 : 8000
      if (kind === 'lorenz') {
        for (let i = 0; i < iters; i++) {
          stepLorenz(lorenzState, lorenz, 0.005)
          const px = width / 2 + lorenzState.x * (width / 60)
          const py = height / 2 + lorenzState.z * (height / 60) - height * 0.2
          ctx.fillRect(px, py, 1, 1)
        }
      } else {
        for (let i = 0; i < iters; i++) {
          if (kind === 'clifford') stepClifford(flatState, clifford)
          else stepDeJong(flatState, dejong)
          const px = width / 2 + flatState.x * (width / 5)
          const py = height / 2 + flatState.y * (height / 5)
          ctx.fillRect(px, py, 1, 1)
        }
      }
      if (!reduce) raf = requestAnimationFrame(loop)
    }
    ctx.fillStyle = '#000'
    const r = canvas.getBoundingClientRect()
    ctx.fillRect(0, 0, r.width, r.height)
    raf = requestAnimationFrame(loop)

    return () => {
      ro.disconnect()
      if (raf) cancelAnimationFrame(raf)
    }
  }, [kind, lorenz, clifford, dejong, trail])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.key === ' ') {
        e.preventDefault()
        if (kind === 'clifford') setClifford(randomClifford())
        else if (kind === 'dejong') setDejong(randomDeJong())
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [kind])

  const fmt = (n: number) => n.toFixed(3)

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
      <Tile
        label={`attractors · ${kind}`}
        code="02"
        footer={<span>space · randomize (clifford/dejong) · trail {(trail * 100).toFixed(0)}%</span>}
      >
        <canvas ref={canvasRef} className="block h-[72vh] w-full" />
      </Tile>

      <Tile label="params">
        <div className="flex h-full flex-col gap-3 p-3">
          <div className="flex gap-1 text-[11px] tracking-[0.06em]">
            {(['clifford', 'dejong', 'lorenz'] as AttractorKind[]).map((k) => (
              <button
                key={k}
                data-interactive
                onClick={() => setKind(k)}
                className={`flex-1 !px-2 !py-1 ${k === kind ? 'border-[var(--color-fg)] text-[var(--color-fg)]' : 'text-[var(--color-dim)]'}`}
              >
                {k}
              </button>
            ))}
          </div>

          {kind === 'lorenz' && (
            <>
              <Slider label="σ sigma" min={0} max={30} step={0.1} value={lorenz.sigma} onChange={(v) => setLorenz({ ...lorenz, sigma: v })} format={fmt} />
              <Slider label="ρ rho"   min={0} max={60} step={0.1} value={lorenz.rho}   onChange={(v) => setLorenz({ ...lorenz, rho: v })}   format={fmt} />
              <Slider label="β beta"  min={0} max={10} step={0.01} value={lorenz.beta} onChange={(v) => setLorenz({ ...lorenz, beta: v })}  format={fmt} />
            </>
          )}
          {kind === 'clifford' && (
            <>
              <Slider label="a" min={-2} max={2} step={0.001} value={clifford.a} onChange={(v) => setClifford({ ...clifford, a: v })} format={fmt} />
              <Slider label="b" min={-2} max={2} step={0.001} value={clifford.b} onChange={(v) => setClifford({ ...clifford, b: v })} format={fmt} />
              <Slider label="c" min={-2} max={2} step={0.001} value={clifford.c} onChange={(v) => setClifford({ ...clifford, c: v })} format={fmt} />
              <Slider label="d" min={-2} max={2} step={0.001} value={clifford.d} onChange={(v) => setClifford({ ...clifford, d: v })} format={fmt} />
            </>
          )}
          {kind === 'dejong' && (
            <>
              <Slider label="a" min={-2.5} max={2.5} step={0.001} value={dejong.a} onChange={(v) => setDejong({ ...dejong, a: v })} format={fmt} />
              <Slider label="b" min={-2.5} max={2.5} step={0.001} value={dejong.b} onChange={(v) => setDejong({ ...dejong, b: v })} format={fmt} />
              <Slider label="c" min={-2.5} max={2.5} step={0.001} value={dejong.c} onChange={(v) => setDejong({ ...dejong, c: v })} format={fmt} />
              <Slider label="d" min={-2.5} max={2.5} step={0.001} value={dejong.d} onChange={(v) => setDejong({ ...dejong, d: v })} format={fmt} />
            </>
          )}

          <Slider label="trail fade" min={0.01} max={0.3} step={0.005} value={trail} onChange={setTrail} format={(v) => `${(v * 100).toFixed(1)}%`} />

          {kind !== 'lorenz' && (
            <button data-interactive onClick={() => kind === 'clifford' ? setClifford(randomClifford()) : setDejong(randomDeJong())}>
              randomize
            </button>
          )}
        </div>
      </Tile>
    </div>
  )
}
