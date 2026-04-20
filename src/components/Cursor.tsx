import { useEffect, useRef } from 'react'
import { prefersReducedMotion } from '../lib/canvas'

export default function Cursor() {
  const ref = useRef<HTMLDivElement>(null)
  const target = useRef({ x: -50, y: -50 })
  const pos = useRef({ x: -50, y: -50 })
  const raf = useRef<number | null>(null)
  const overInteractive = useRef(false)

  useEffect(() => {
    // honor reduce-motion — hide the custom cursor and restore the native one via body css
    if (prefersReducedMotion()) return

    const onMove = (e: MouseEvent) => {
      target.current.x = e.clientX
      target.current.y = e.clientY
      const el = e.target as HTMLElement | null
      overInteractive.current = !!el?.closest('a,button,input,[data-interactive]')
    }
    const onLeave = () => { target.current.x = -50; target.current.y = -50 }
    const tick = () => {
      const k = 0.28
      pos.current.x += (target.current.x - pos.current.x) * k
      pos.current.y += (target.current.y - pos.current.y) * k
      if (ref.current) {
        ref.current.style.transform = `translate(${pos.current.x}px, ${pos.current.y}px)`
        ref.current.style.background = overInteractive.current ? 'var(--color-fg)' : 'transparent'
        ref.current.style.borderColor = 'var(--color-fg)'
      }
      raf.current = requestAnimationFrame(tick)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseleave', onLeave)
    raf.current = requestAnimationFrame(tick)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseleave', onLeave)
      if (raf.current) cancelAnimationFrame(raf.current)
    }
  }, [])

  if (prefersReducedMotion()) return null

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-50 h-[15px] w-[9px] border border-[var(--color-fg)] mix-blend-difference"
      style={{
        transform: 'translate(-50px, -50px)',
        borderRadius: '3px',
        boxShadow: '0 0 10px 2px rgba(237,237,237,0.08)',
      }}
    />
  )
}
