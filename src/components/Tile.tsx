import type { ReactNode, CSSProperties } from 'react'
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
  const body = (
    <div className={`relative flex h-full flex-col border border-[var(--color-line)] bg-[var(--color-bg)] ${className}`} style={style}>
      <header className="flex items-center justify-between border-b border-[var(--color-line)] px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-[var(--color-dim)]">
        <span>{label}</span>
        {code && <span className="text-[var(--color-dim)]">{code}</span>}
      </header>
      <div className="relative flex-1 overflow-hidden">{children}</div>
      {footer && <footer className="border-t border-[var(--color-line)] px-3 py-2 text-[11px] text-[var(--color-dim)]">{footer}</footer>}
    </div>
  )
  if (to) {
    return (
      <Link to={to} data-interactive className="block h-full transition-colors hover:[&>div]:border-[var(--color-fg)]">
        {body}
      </Link>
    )
  }
  return body
}
