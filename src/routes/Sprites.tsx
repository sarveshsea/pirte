import { useEffect, useRef, useState } from 'react'
import Tile from '../components/Tile'
import { prefersReducedMotion } from '../lib/canvas'
import { rafLoop } from '../lib/rafLoop'
import {
  initState, step, render, spawnPulse, resize as resizeState,
  type SpritesState, type CursorMode,
} from '../modules/sprites'

export default function Sprites() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const preRef = useRef<HTMLPreElement>(null)
  const stateRef = useRef<SpritesState | null>(null)
  const modeRef = useRef<CursorMode>('attract')
  const [mode, setMode] = useState<CursorMode>('attract')
  const [paused, setPaused] = useState(false)
  const pausedRef = useRef(paused)
  pausedRef.current = paused

  useEffect(() => { modeRef.current = mode }, [mode])

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
      if (!stateRef.current) stateRef.current = initState(cols, rows, 64)
      else resizeState(stateRef.current, cols, rows)
      return { cw, ch, cols, rows }
    }
    let metrics = measure()

    const ro = new ResizeObserver(() => { metrics = measure() })
    ro.observe(wrap)

    const onMove = (e: PointerEvent) => {
      const rect = wrap.getBoundingClientRect()
      const s = stateRef.current
      if (!s) return
      s.cursor.x = ((e.clientX - rect.left) / rect.width) * metrics.cols
      s.cursor.y = ((e.clientY - rect.top) / rect.height) * metrics.rows
      s.cursor.active = true
      s.mode = modeRef.current
    }
    const onLeave = () => {
      const s = stateRef.current
      if (s) s.cursor.active = false
    }
    const onClick = (e: PointerEvent) => {
      const rect = wrap.getBoundingClientRect()
      const s = stateRef.current
      if (!s) return
      const x = ((e.clientX - rect.left) / rect.width) * metrics.cols
      const y = ((e.clientY - rect.top) / rect.height) * metrics.rows
      spawnPulse(s, x, y)
    }
    wrap.addEventListener('pointermove', onMove)
    wrap.addEventListener('pointerleave', onLeave)
    wrap.addEventListener('click', onClick)

    const reduce = prefersReducedMotion()
    const stop = reduce
      ? (() => { const s = stateRef.current; if (s) pre.textContent = render(s); return () => {} })()
      : rafLoop((_t, dt) => {
          const s = stateRef.current
          if (s && !pausedRef.current) step(s, dt)
          if (s) pre.textContent = render(s)
        })

    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.key === ' ') { e.preventDefault(); setPaused((v) => !v) }
      else if (e.key === 'a') setMode('attract')
      else if (e.key === 'f') setMode('repel')
      else if (e.key === 'v') setMode('vortex')
      else if (e.key === 'i') setMode('idle')
      else if (e.key === 'r') {
        const s = stateRef.current
        if (s) {
          s.intensity.fill(0)
          s.pulses = []
          for (const a of s.agents) { a.x = Math.random() * s.cols; a.y = Math.random() * s.rows; a.vx = 0; a.vy = 0 }
        }
      }
    }
    window.addEventListener('keydown', onKey)

    return () => {
      ro.disconnect()
      stop()
      wrap.removeEventListener('pointermove', onMove)
      wrap.removeEventListener('pointerleave', onLeave)
      wrap.removeEventListener('click', onClick)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  return (
    <Tile
      label={`sprites · ${mode}`}
      code="08"
      footer={
        <div className="flex items-center justify-between">
          <span>{(['attract', 'repel', 'vortex', 'idle'] as CursorMode[]).map((m) => m === mode ? `[${m}]` : m).join('  ·  ')}</span>
          <span>a attract · f flee · v vortex · i idle · click pulse · r reset · space {paused ? 'resume' : 'pause'}</span>
        </div>
      }
    >
      <div ref={wrapRef} className="h-[min(76vh,calc(100dvh-14rem))] w-full cursor-none">
        <pre
          ref={preRef}
          className="m-0 h-full w-full whitespace-pre text-[12px] leading-[1.1] text-[var(--color-fg)]"
        />
      </div>
    </Tile>
  )
}
