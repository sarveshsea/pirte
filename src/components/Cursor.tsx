import { useEffect, useRef } from 'react'

export default function Cursor() {
  const ref = useRef<HTMLDivElement>(null)
  const target = useRef({ x: -50, y: -50 })
  const pos = useRef({ x: -50, y: -50 })
  const raf = useRef<number | null>(null)
  const overInteractive = useRef(false)

  useEffect(() => {
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

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-50 h-[14px] w-[8px] border border-[var(--color-fg)] mix-blend-difference"
      style={{ transform: 'translate(-50px, -50px)' }}
    />
  )
}
