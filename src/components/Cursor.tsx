import { useEffect, useRef } from 'react'
import { prefersReducedMotion } from '../lib/canvas'

// canvas-based cursor: bright core + soft halo + fading velocity trail,
// with an orbiting ring + bigger bloom when hovering interactive targets.
// the canvas follows the pointer via a single css transform each frame,
// so it only has to paint ~160px of area regardless of viewport size.
const SIZE = 160

export default function Cursor() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (prefersReducedMotion()) return
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(2, window.devicePixelRatio || 1)
    c.width = SIZE * dpr
    c.height = SIZE * dpr
    c.style.width = `${SIZE}px`
    c.style.height = `${SIZE}px`
    ctx.scale(dpr, dpr)

    const target = { x: -400, y: -400 }
    const pos = { x: -400, y: -400 }
    let over = false
    let overAmt = 0    // smoothed 0..1
    let pressed = 0    // 0..1, bumps on mousedown, decays
    const trail: { x: number; y: number }[] = []
    for (let i = 0; i < 8; i++) trail.push({ x: -400, y: -400 })
    let raf = 0
    let lastT = performance.now()

    const onMove = (e: MouseEvent) => {
      target.x = e.clientX
      target.y = e.clientY
      const el = e.target as HTMLElement | null
      over = !!el?.closest('a,button,input,[data-interactive]')
    }
    const onLeave = () => { target.x = -400; target.y = -400 }
    const onDown = () => { pressed = 1 }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseleave', onLeave)
    window.addEventListener('mousedown', onDown)

    const tick = (t: number) => {
      const dt = Math.min(0.05, (t - lastT) / 1000)
      lastT = t

      // smooth chase
      pos.x += (target.x - pos.x) * 0.32
      pos.y += (target.y - pos.y) * 0.32
      // smooth interactive flag
      overAmt += ((over ? 1 : 0) - overAmt) * Math.min(1, dt * 10)
      // press decay
      pressed = Math.max(0, pressed - dt * 3.2)

      // trail shift (last-in-front)
      for (let i = trail.length - 1; i > 0; i--) {
        trail[i].x = trail[i - 1].x
        trail[i].y = trail[i - 1].y
      }
      trail[0].x = pos.x
      trail[0].y = pos.y

      // position canvas so (SIZE/2, SIZE/2) is at pointer
      c.style.transform = `translate3d(${pos.x - SIZE / 2}px, ${pos.y - SIZE / 2}px, 0)`

      const cx = SIZE / 2
      const cy = SIZE / 2

      ctx.clearRect(0, 0, SIZE, SIZE)

      // outer halo — grows and warms with interactive state + press
      const haloR = 28 + overAmt * 46 + pressed * 28
      const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, haloR)
      const warm = overAmt
      halo.addColorStop(0, `rgba(${(255 - warm * 10) | 0}, ${(240 + warm * 15) | 0}, ${(220 + warm * 30) | 0}, ${(0.22 + overAmt * 0.32 + pressed * 0.2).toFixed(3)})`)
      halo.addColorStop(0.45, `rgba(${(230 - warm * 40) | 0}, ${(210 + warm * 20) | 0}, ${(240) | 0}, ${(0.08 + overAmt * 0.14).toFixed(3)})`)
      halo.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = halo
      ctx.beginPath()
      ctx.arc(cx, cy, haloR, 0, Math.PI * 2)
      ctx.fill()

      // velocity trail — fainter ghosts at previous positions
      for (let i = 1; i < trail.length; i++) {
        const dx = trail[i].x - pos.x
        const dy = trail[i].y - pos.y
        const a = 0.42 * (1 - i / trail.length)
        const r = (2.6 - i * 0.24) * (1 + overAmt * 0.7)
        if (r <= 0) continue
        ctx.fillStyle = `rgba(255, 248, 240, ${a.toFixed(3)})`
        ctx.beginPath()
        ctx.arc(cx + dx, cy + dy, r, 0, Math.PI * 2)
        ctx.fill()
      }

      // bright core
      const coreR = 2.8 + overAmt * 2.2 + pressed * 1.5
      ctx.fillStyle = `rgba(255, 250, 235, ${(0.95 - overAmt * 0.1).toFixed(3)})`
      ctx.beginPath()
      ctx.arc(cx, cy, coreR, 0, Math.PI * 2)
      ctx.fill()

      // orbiting ring appears on interactive hover
      if (overAmt > 0.02) {
        const orbitR = 18 + overAmt * 10 + pressed * 10
        const angle = t * 0.0032
        for (let i = 0; i < 3; i++) {
          const a = angle + (i / 3) * Math.PI * 2
          const ox = cx + Math.cos(a) * orbitR
          const oy = cy + Math.sin(a) * orbitR
          ctx.fillStyle = `rgba(255, 220, 240, ${(overAmt * 0.9).toFixed(3)})`
          ctx.beginPath()
          ctx.arc(ox, oy, 2 + overAmt * 0.6, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // press pulse — a 1px ring that snaps outward for a fraction of a second
      if (pressed > 0.02) {
        const ringR = 14 + (1 - pressed) * 48
        ctx.strokeStyle = `rgba(255, 240, 220, ${(pressed * 0.85).toFixed(3)})`
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(cx, cy, ringR, 0, Math.PI * 2)
        ctx.stroke()
      }

      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseleave', onLeave)
      window.removeEventListener('mousedown', onDown)
    }
  }, [])

  if (prefersReducedMotion()) return null

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-50"
      style={{ transform: 'translate3d(-400px, -400px, 0)' }}
    />
  )
}
