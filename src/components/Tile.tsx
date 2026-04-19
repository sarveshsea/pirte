import { useRef, type ReactNode, type CSSProperties, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'

type TileProps = {
  label: string
  code?: string
  to?: string
  children?: ReactNode
  className?: string
  style?: CSSProperties
  footer?: ReactNode
}

export default function Tile({ label, code, to, children, className = '', style, footer }: TileProps) {
  const ref = useRef<HTMLDivElement>(null)
  const interactive = !!to

  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const nx = ((e.clientX - rect.left) / rect.width) - 0.5
    const ny = ((e.clientY - rect.top) / rect.height) - 0.5
    // cap tilt to 1.6° to stay subtle
    el.style.setProperty('--tilt-x', `${(-ny * 1.6).toFixed(2)}deg`)
    el.style.setProperty('--tilt-y', `${(nx * 1.6).toFixed(2)}deg`)
  }
  const onLeave = () => {
    const el = ref.current
    if (!el) return
    el.style.setProperty('--tilt-x', '0deg')
    el.style.setProperty('--tilt-y', '0deg')
  }

  const body = (
    <div
      ref={ref}
      onMouseMove={interactive ? onMove : undefined}
      onMouseLeave={interactive ? onLeave : undefined}
      className={`tile ${interactive ? 'tile-interactive' : ''} relative flex h-full flex-col ${className}`}
      style={style}
    >
      {interactive && (
        <>
          <span className="tile-bracket tl" aria-hidden />
          <span className="tile-bracket tr" aria-hidden />
          <span className="tile-bracket bl" aria-hidden />
          <span className="tile-bracket br" aria-hidden />
        </>
      )}
      <header className="flex items-center justify-between border-b border-[var(--color-line)] px-4 py-2.5 text-[11px] tracking-[0.06em] text-[var(--color-dim)]">
        <span>{label}</span>
        {code && <span className="text-[var(--color-dim)]">{code}</span>}
      </header>
      <div className="relative flex-1 overflow-hidden">{children}</div>
      {footer && <footer className="border-t border-[var(--color-line)] px-4 py-2.5 text-[11px] text-[var(--color-dim)]">{footer}</footer>}
    </div>
  )

  if (to) {
    return (
      <Link to={to} data-interactive className="block h-full">
        {body}
      </Link>
    )
  }
  return body
}
