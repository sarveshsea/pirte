import { useEffect, useMemo, useRef } from 'react'
import Tile from '../components/Tile'
import { prefersReducedMotion } from '../lib/canvas'
import { createDoom } from '../modules/doom/engine'

export default function Doom() {
  const game = useMemo(() => createDoom(), [])
  const preRef = useRef<HTMLPreElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

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
      pre.textContent = game.frame(t)
      if (!reduce) raf = requestAnimationFrame(loop)
    }
    if (reduce) pre.textContent = game.frame(0)
    else raf = requestAnimationFrame(loop)

    return () => {
      ro.disconnect()
      if (raf) cancelAnimationFrame(raf)
    }
  }, [game])

  useEffect(() => {
    const map = (e: KeyboardEvent): [keyof typeof game.input, boolean] | null => {
      const k = e.key
      const lk = k.toLowerCase()
      if (lk === 'w' || k === 'ArrowUp')    return ['forward', true]
      if (lk === 's' || k === 'ArrowDown')  return ['backward', true]
      if (lk === 'a')                        return ['strafeL', true]
      if (lk === 'd')                        return ['strafeR', true]
      if (k === 'ArrowLeft')                 return ['turnL', true]
      if (k === 'ArrowRight')                return ['turnR', true]
      if (k === ' ')                         return ['fire', true]
      if (lk === 'e')                        return ['use', true]
      if (lk === 'p')                        return ['pause', true]
      if (lk === 'r')                        return ['restart', true]
      return null
    }
    const onDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const m = map(e)
      if (!m) return
      if (m[0] === 'fire' || m[0] === 'forward' || m[0] === 'backward') e.preventDefault()
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

  return (
    <Tile
      label="doom · e1m1"
      code="10"
      footer={<span>wasd move · ← → turn · space fire · e open · p pause · r restart</span>}
    >
      <div ref={wrapRef} className="h-[72vh] w-full overflow-hidden">
        <pre
          ref={preRef}
          className="m-0 h-full w-full whitespace-pre text-[12px] leading-[1.1] text-[var(--color-fg)]"
          style={{ tabSize: 1 }}
        />
      </div>
    </Tile>
  )
}
