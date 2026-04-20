import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Tile from '../components/Tile'
import { prefersReducedMotion } from '../lib/canvas'
import { createDoom } from '../modules/doom/engine'

const MOUSE_SENSITIVITY = 0.0028

export default function Doom() {
  const game = useMemo(() => createDoom(), [])
  const preRef = useRef<HTMLPreElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [locked, setLocked] = useState(false)

  // main render loop + sizing
  useEffect(() => {
    if (!preRef.current || !wrapRef.current) return
    const pre = preRef.current
    const wrap = wrapRef.current

    const measure = () => {
      const probe = document.createElement('span')
      probe.textContent = 'M'
      probe.style.visibility = 'hidden'
      pre.appendChild(probe)
      const cw = probe.getBoundingClientRect().width
      const ch = probe.getBoundingClientRect().height
      pre.removeChild(probe)
      const rect = wrap.getBoundingClientRect()
      const cols = Math.max(40, Math.floor(rect.width / cw))
      const rows = Math.max(20, Math.floor(rect.height / ch))
      game.reset(cols, rows)
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(wrap)

    let raf = 0
    const reduce = prefersReducedMotion()
    const loop = (t: number) => {
      pre.innerHTML = game.frame(t)
      if (!reduce) raf = requestAnimationFrame(loop)
    }
    if (reduce) pre.innerHTML = game.frame(0)
    else raf = requestAnimationFrame(loop)

    return () => {
      ro.disconnect()
      if (raf) cancelAnimationFrame(raf)
    }
  }, [game])

  // keyboard
  useEffect(() => {
    const map = (e: KeyboardEvent): [keyof typeof game.input, boolean] | null => {
      const k = e.key
      const lk = k.toLowerCase()
      if (lk === 'w' || k === 'ArrowUp')    return ['forward', true]
      if (lk === 's' || k === 'ArrowDown')  return ['backward', true]
      if (lk === 'a')                        return ['strafeL', true]
      if (lk === 'd')                        return ['strafeR', true]
      if (k === 'ArrowLeft' || lk === 'q')   return ['turnL', true]
      if (k === 'ArrowRight' || lk === 'e')  return ['turnR', true]
      if (k === ' ')                         return ['fire', true]
      if (lk === 'f')                        return ['use', true]
      if (lk === 'p')                        return ['pause', true]
      if (lk === 'r')                        return ['restart', true]
      return null
    }
    const onDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const m = map(e)
      if (!m) return
      // arrows / wasd / space all page-scroll or fire wm; eat them
      if (m[0] === 'fire' || m[0] === 'forward' || m[0] === 'backward' || m[0] === 'turnL' || m[0] === 'turnR') e.preventDefault()
      game.input[m[0]] = true
    }
    const onUp = (e: KeyboardEvent) => {
      const m = map(e)
      if (!m) return
      game.input[m[0]] = false
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
  }, [game])

  // pointer lock mouse-look
  useEffect(() => {
    const onLockChange = () => {
      const active = document.pointerLockElement === wrapRef.current
      setLocked(active)
      if (!active) game.clearInput()
    }
    const onMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== wrapRef.current) return
      if (e.movementX) game.turnBy(e.movementX * MOUSE_SENSITIVITY)
    }
    document.addEventListener('pointerlockchange', onLockChange)
    window.addEventListener('mousemove', onMove)
    return () => {
      document.removeEventListener('pointerlockchange', onLockChange)
      window.removeEventListener('mousemove', onMove)
    }
  }, [game])

  // release stuck keys when the tab/window loses focus
  useEffect(() => {
    const release = () => game.clearInput()
    const onVis = () => { if (document.hidden) release() }
    window.addEventListener('blur', release)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('blur', release)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [game])

  const requestLock = useCallback(() => {
    const el = wrapRef.current
    if (!el) return
    if (document.pointerLockElement === el) return
    el.requestPointerLock?.()
  }, [])

  return (
    <Tile
      label="doom · e1m1"
      code="10"
      footer={<span>click to capture · wasd move · mouse / ← → / qe turn · space fire · f open · p pause · r restart · esc release</span>}
    >
      <div
        ref={wrapRef}
        onClick={requestLock}
        className="relative h-[72vh] w-full cursor-crosshair overflow-hidden"
      >
        <pre
          ref={preRef}
          className="m-0 h-full w-full whitespace-pre text-[12px] leading-[1.1] text-[var(--color-fg)]"
          style={{ tabSize: 1 }}
        />
        {!locked ? (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="rounded-[4px] border border-[var(--color-line)] bg-black/70 px-5 py-2.5 text-[13px] tracking-[0.1em] text-[var(--color-fg)]">
              click to capture mouse
            </div>
          </div>
        ) : (
          <div className="pointer-events-none absolute right-3 top-3 rounded-[4px] border border-[var(--color-fg)] bg-black/70 px-2.5 py-1 text-[12px] tracking-[0.1em] text-[var(--color-fg)]">
            mouse captured · esc to release
          </div>
        )}
      </div>
    </Tile>
  )
}
