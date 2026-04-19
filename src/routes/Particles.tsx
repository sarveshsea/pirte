import { useEffect, useRef, useState } from 'react'
import Tile from '../components/Tile'
import Slider from '../components/Slider'
import { prefersReducedMotion } from '../lib/canvas'
import {
  createWorld, addPoint, connect, step, render, findNearest,
  presetRope, presetCloth, type World,
} from '../modules/particles'

export default function Particles() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const preRef = useRef<HTMLPreElement>(null)
  const worldRef = useRef<World | null>(null)
  const metricsRef = useRef({ cw: 8, ch: 16, cols: 80, rows: 30 })
  const selectedRef = useRef<number | null>(null)
  const draggingRef = useRef<number | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [paused, setPaused] = useState(false)
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const [gravity, setGravity] = useState(30)
  const [hint, setHint] = useState('click empty space to drop points · click a point then another to connect')

  useEffect(() => {
    if (worldRef.current) worldRef.current.gravity = gravity
  }, [gravity])

  useEffect(() => {
    const wrap = wrapRef.current
    const pre = preRef.current
    if (!wrap || !pre) return

    const measure = () => {
      const probe = document.createElement('span')
      probe.textContent = 'M'
      probe.style.visibility = 'hidden'
      pre.appendChild(probe)
      const cw = probe.getBoundingClientRect().width
      const ch = probe.getBoundingClientRect().height
      pre.removeChild(probe)
      const rect = wrap.getBoundingClientRect()
      const cols = Math.max(30, Math.floor(rect.width / cw))
      const rows = Math.max(12, Math.floor(rect.height / ch))
      metricsRef.current = { cw, ch, cols, rows }
      if (!worldRef.current) {
        worldRef.current = createWorld(cols, rows)
        worldRef.current.gravity = gravity
        presetRope(worldRef.current, cols, rows)
      } else {
        worldRef.current.cols = cols
        worldRef.current.rows = rows
      }
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(wrap)

    const toGrid = (e: PointerEvent) => {
      const rect = wrap.getBoundingClientRect()
      const { cols, rows } = metricsRef.current
      return {
        x: ((e.clientX - rect.left) / rect.width) * cols,
        y: ((e.clientY - rect.top) / rect.height) * rows,
      }
    }

    const onDown = (e: PointerEvent) => {
      const w = worldRef.current; if (!w) return
      const g = toGrid(e)
      const hit = findNearest(w, g.x, g.y, 1.5)
      if (hit !== null) {
        if (e.shiftKey) {
          w.points[hit].pinned = !w.points[hit].pinned
          setHint(w.points[hit].pinned ? 'pinned · drag pins to move' : 'unpinned')
          return
        }
        if (selectedRef.current === null) {
          selectedRef.current = hit
          setSelected(hit)
          setHint('click another point to connect · click empty space to cancel')
        } else if (selectedRef.current === hit) {
          // same point — start dragging
          draggingRef.current = hit
          w.points[hit].pinned = true
          setHint('drag to move · release to drop')
        } else {
          connect(w, selectedRef.current, hit)
          selectedRef.current = null
          setSelected(null)
          setHint('connected · click empty to drop points')
        }
      } else {
        if (selectedRef.current !== null) {
          selectedRef.current = null
          setSelected(null)
          setHint('cancelled selection')
          return
        }
        addPoint(w, g.x, g.y, e.shiftKey)
        setHint(e.shiftKey ? 'dropped pinned point' : 'dropped point · click existing points to connect them')
      }
      ;(e.target as Element).setPointerCapture?.(e.pointerId)
    }
    const onMove = (e: PointerEvent) => {
      const w = worldRef.current; if (!w) return
      const drag = draggingRef.current
      if (drag !== null) {
        const g = toGrid(e)
        w.points[drag].x = g.x
        w.points[drag].y = g.y
        w.points[drag].px = g.x
        w.points[drag].py = g.y
      }
    }
    const onUp = (_e: PointerEvent) => {
      const w = worldRef.current; if (!w) return
      const drag = draggingRef.current
      if (drag !== null) {
        // release unless shift (then stay pinned)
        w.points[drag].pinned = false
        draggingRef.current = null
        selectedRef.current = null
        setSelected(null)
      }
    }

    wrap.addEventListener('pointerdown', onDown)
    wrap.addEventListener('pointermove', onMove)
    wrap.addEventListener('pointerup', onUp)

    const reduce = prefersReducedMotion()
    let raf = 0
    let last = performance.now()
    const loop = (t: number) => {
      const dt = Math.min(0.033, (t - last) / 1000)
      last = t
      const w = worldRef.current
      if (w) {
        if (!pausedRef.current) step(w, dt)
        pre.textContent = render(w, selectedRef.current)
      }
      if (!reduce) raf = requestAnimationFrame(loop)
    }
    if (!reduce) raf = requestAnimationFrame(loop)
    else if (worldRef.current) pre.textContent = render(worldRef.current, null)

    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      const w = worldRef.current
      if (!w) return
      const { cols, rows } = metricsRef.current
      if (e.key === ' ') { e.preventDefault(); setPaused((v) => !v) }
      else if (e.key.toLowerCase() === 'c') { w.points.length = 0; w.constraints.length = 0; setHint('cleared') }
      else if (e.key.toLowerCase() === 'g') { w.gravity = w.gravity > 0 ? 0 : 30; setGravity(w.gravity); setHint(`gravity ${w.gravity > 0 ? 'on' : 'off'}`) }
      else if (e.key.toLowerCase() === 'r') { presetRope(w, cols, rows); setHint('rope preset') }
      else if (e.key.toLowerCase() === 't') { presetCloth(w, cols, rows); setHint('cloth preset') }
    }
    window.addEventListener('keydown', onKey)

    return () => {
      ro.disconnect()
      wrap.removeEventListener('pointerdown', onDown)
      wrap.removeEventListener('pointermove', onMove)
      wrap.removeEventListener('pointerup', onUp)
      window.removeEventListener('keydown', onKey)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_260px]">
      <Tile
        label="particles"
        code="14"
        footer={
          <div className="flex items-center justify-between">
            <span>{hint}</span>
            <span>space {paused ? 'resume' : 'pause'} · g gravity · c clear · r rope · t cloth · shift-click pin</span>
          </div>
        }
      >
        <div ref={wrapRef} className="h-[76vh] w-full cursor-none">
          <pre
            ref={preRef}
            className="m-0 h-full w-full whitespace-pre text-[13px] leading-[1.1] text-[var(--color-fg)]"
          />
        </div>
      </Tile>
      <Tile label="params">
        <div className="flex flex-col gap-3 p-3">
          <Slider label="gravity" min={0} max={80} step={1} value={gravity} onChange={(v) => { setGravity(v); if (worldRef.current) worldRef.current.gravity = v }} />
          <button data-interactive onClick={() => { const w = worldRef.current; if (!w) return; presetRope(w, w.cols, w.rows); setHint('rope preset') }}>rope</button>
          <button data-interactive onClick={() => { const w = worldRef.current; if (!w) return; presetCloth(w, w.cols, w.rows); setHint('cloth preset') }}>cloth</button>
          <button data-interactive onClick={() => { const w = worldRef.current; if (!w) return; w.points.length = 0; w.constraints.length = 0; setHint('cleared') }}>clear</button>
          <div className="mt-2 text-[11px] leading-[1.5] text-[var(--color-dim)]">
            click empty to drop · click a point then another to connect · drag a selected point to fling · shift-click to pin
          </div>
          <div className="text-[11px] text-[var(--color-dim)]">selected: <span className="text-[var(--color-fg)]">{selected ?? '—'}</span></div>
        </div>
      </Tile>
    </div>
  )
}
