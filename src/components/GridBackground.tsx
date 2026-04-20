import { useEffect, useRef } from 'react'
import { prefersReducedMotion } from '../lib/canvas'
import { rafLoop } from '../lib/rafLoop'
import type { BgProgram, BgRipple } from '../bg/program'
import { BG_FACTORIES, type BgName } from '../bg/registry'

const CELL = 24 // aligns with the existing css dot grid

type Props = { program: BgName }

export default function GridBackground({ program }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (program === 'off') {
      const c = canvasRef.current
      if (c) {
        const ctx = c.getContext('2d')!
        ctx.clearRect(0, 0, c.width, c.height)
      }
      return
    }
    if (prefersReducedMotion()) return  // stay out of the way

    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d', { alpha: true })
    if (!ctx) return

    const prog: BgProgram = BG_FACTORIES[program]()
    const cursor = { x: -1e4, y: -1e4, active: false }
    const ripples: BgRipple[] = []
    let lastT = performance.now()

    const size = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      c.width = Math.floor(window.innerWidth * dpr)
      c.height = Math.floor(window.innerHeight * dpr)
      c.style.width = '100vw'
      c.style.height = '100vh'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const cols = Math.ceil(window.innerWidth / CELL)
      const rows = Math.ceil(window.innerHeight / CELL)
      prog.reset(cols, rows, CELL)
    }
    // rAF-debounce resize so devtools-toggle spam doesn't thrash the canvas
    // (each size() does a full nebula reallocation).
    let resizePending = false
    const onResize = () => {
      if (resizePending) return
      resizePending = true
      requestAnimationFrame(() => { resizePending = false; size() })
    }
    size()
    window.addEventListener('resize', onResize)

    const onMove = (e: PointerEvent) => {
      cursor.x = e.clientX
      cursor.y = e.clientY
      cursor.active = true
    }
    const onLeave = () => { cursor.active = false }
    const onClick = (e: PointerEvent) => {
      ripples.push({ x: e.clientX, y: e.clientY, age: 0 })
      if (ripples.length > 8) ripples.shift()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerleave', onLeave)
    window.addEventListener('pointerdown', onClick)

    const stop = rafLoop((t) => {
      const dt = Math.min(0.05, (t - lastT) / 1000)
      lastT = t
      // trail fade — low alpha leaves ghosts, full clear looks harsh
      ctx.globalCompositeOperation = 'destination-out'
      ctx.fillStyle = `rgba(0, 0, 0, 0.12)`
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight)
      ctx.globalCompositeOperation = 'source-over'
      // age ripples + prune
      for (const r of ripples) r.age += dt
      while (ripples.length && ripples[0].age > 0.7) ripples.shift()
      prog.frame(ctx, t, dt, cursor, ripples)
    })

    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('pointerdown', onClick)
      stop()
    }
  }, [program])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0"
      style={{ zIndex: 0, mixBlendMode: 'screen' }}
    />
  )
}
