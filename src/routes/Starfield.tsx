import { useEffect, useRef, useState } from 'react'
import Tile from '../components/Tile'
import Slider from '../components/Slider'
import { prefersReducedMotion } from '../lib/canvas'
import { makeStars, stepStars, renderStars, type Star } from '../modules/starfield'

const FAR = 100

export default function Starfield() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const preRef = useRef<HTMLPreElement>(null)
  const starsRef = useRef<Star[]>([])
  const steerRef = useRef({ x: 0, y: 0 })
  const warpRef = useRef(false)
  const [speed, setSpeed] = useState(0.6)
  const [fov, setFov] = useState(1.0)
  const [count, setCount] = useState(320)
  const [warp, setWarp] = useState(false)

  useEffect(() => { starsRef.current = makeStars(count, FAR) }, [count])
  useEffect(() => { warpRef.current = warp }, [warp])

  useEffect(() => {
    const wrap = wrapRef.current
    const pre = preRef.current
    if (!wrap || !pre) return

    let cols = 80, rows = 30
    const measure = () => {
      const probe = document.createElement('span')
      probe.textContent = 'M'
      probe.style.visibility = 'hidden'
      pre.appendChild(probe)
      const cw = probe.getBoundingClientRect().width
      const ch = probe.getBoundingClientRect().height
      pre.removeChild(probe)
      const rect = wrap.getBoundingClientRect()
      cols = Math.max(30, Math.floor(rect.width / cw))
      rows = Math.max(12, Math.floor(rect.height / ch))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(wrap)

    const onMove = (e: PointerEvent) => {
      const rect = wrap.getBoundingClientRect()
      steerRef.current.x = (e.clientX - rect.left) / rect.width - 0.5
      steerRef.current.y = (e.clientY - rect.top) / rect.height - 0.5
    }
    wrap.addEventListener('pointermove', onMove)

    const reduce = prefersReducedMotion()
    let raf = 0
    let last = performance.now()
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000)
      last = t
      const spd = speed * (warpRef.current ? 3.5 : 1)
      stepStars(starsRef.current, spd, dt, 0.5, FAR)
      pre.textContent = renderStars(starsRef.current, cols, rows, steerRef.current.x, steerRef.current.y, fov, FAR)
      if (!reduce) raf = requestAnimationFrame(loop)
    }
    if (reduce) pre.textContent = renderStars(starsRef.current, cols, rows, 0, 0, fov, FAR)
    else raf = requestAnimationFrame(loop)

    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.key === ' ')      { e.preventDefault(); setWarp((v) => !v) }
      if (e.key === 'ArrowUp')   setSpeed((v) => Math.min(3, v + 0.1))
      if (e.key === 'ArrowDown') setSpeed((v) => Math.max(0.05, v - 0.1))
      if (e.key.toLowerCase() === 'r') starsRef.current = makeStars(count, FAR)
    }
    window.addEventListener('keydown', onKey)

    return () => {
      ro.disconnect()
      wrap.removeEventListener('pointermove', onMove)
      window.removeEventListener('keydown', onKey)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [speed, fov, count])

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_260px]">
      <Tile
        label={`starfield${warp ? ' · warp' : ''}`}
        code="12"
        footer={<span>mouse steer · ↑↓ speed · space {warp ? 'drop warp' : 'warp'} · r reset</span>}
      >
        <div ref={wrapRef} className="h-[76vh] w-full cursor-none">
          <pre
            ref={preRef}
            className="m-0 h-full w-full whitespace-pre text-[12px] leading-[1.1] text-[var(--color-fg)]"
          />
        </div>
      </Tile>
      <Tile label="params">
        <div className="flex flex-col gap-3 p-3">
          <Slider label="speed" min={0.05} max={3}    step={0.05} value={speed} onChange={setSpeed} format={(v) => v.toFixed(2)} />
          <Slider label="fov"   min={0.4}  max={1.8}  step={0.01} value={fov}   onChange={setFov}   format={(v) => v.toFixed(2)} />
          <Slider label="count" min={60}   max={900}  step={20}   value={count} onChange={(v) => setCount(Math.floor(v))} />
          <button data-interactive onClick={() => setWarp((v) => !v)}>{warp ? 'drop warp' : 'warp'}</button>
          <button data-interactive onClick={() => { starsRef.current = makeStars(count, FAR) }}>reset</button>
        </div>
      </Tile>
    </div>
  )
}
