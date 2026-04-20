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
  starred?: boolean
  onToggleStar?: () => void
}

export default function Tile({ label, code, to, children, className = '', style, footer, starred, onToggleStar }: TileProps) {
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

  const starBtn = onToggleStar ? (
    <button
      type="button"
      data-interactive
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleStar() }}
      aria-label={starred ? 'unpin module' : 'pin module'}
      title={starred ? 'unpin · remove from favorites' : 'pin · sort first on index'}
      className={`absolute right-2 top-2 z-10 !border-0 !px-0 !py-0 text-[14px] transition-opacity ${
        starred ? 'opacity-90 text-[var(--color-fg)]' : 'opacity-0 group-hover:opacity-60 text-[var(--color-dim)] hover:!text-[var(--color-fg)]'
      }`}
    >
      {starred ? '★' : '☆'}
    </button>
  ) : null

  const body = (
    <div
      ref={ref}
      onMouseMove={interactive ? onMove : undefined}
      onMouseLeave={interactive ? onLeave : undefined}
      className={`tile group ${interactive ? 'tile-interactive' : ''} relative flex h-full flex-col ${className}`}
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
      {starBtn}
      <header className="flex items-center justify-between border-b border-[var(--color-line)] px-4 py-2.5 text-[11px] tracking-[0.06em] text-[var(--color-dim)]">
        <span>{label}</span>
        {code && <span className={onToggleStar ? 'mr-5 text-[var(--color-dim)]' : 'text-[var(--color-dim)]'}>{code}</span>}
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
