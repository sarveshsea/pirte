import { type ReactNode, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { prefetchRoute } from '../lib/routes'

type TileProps = {
  label: string
  to?: string
  children?: ReactNode
  className?: string
  style?: CSSProperties
  footer?: ReactNode
  /** optional hex/css color — renders as a small dot next to the label */
  accent?: string
  /** optional short tag (e.g. "live", "audio") — renders as a monospace chip */
  tag?: string
  /** optional short route or telemetry code shown in the header */
  code?: string
}

export default function Tile({
  label,
  to,
  children,
  className = '',
  style,
  footer,
  accent,
  tag,
  code,
}: TileProps) {
  const interactive = !!to
  const prefetch = () => {
    if (!to) return
    prefetchRoute(to)
  }

  const body = (
    <div
      className={`tile ${interactive ? 'tile-interactive' : ''} relative flex h-full min-h-0 min-w-0 flex-col ${className}`}
      style={style}
    >
      <header className="flex min-w-0 items-center justify-between gap-2 border-b border-[var(--color-line)] px-4 py-2.5 text-[13px]">
        <span className="flex min-w-0 items-center gap-2">
          {accent && (
            <span
              className="h-[7px] w-[7px] shrink-0 rounded-full"
              style={{
                backgroundColor: accent,
                boxShadow: `0 0 0 2px color-mix(in srgb, ${accent} 18%, transparent)`,
              }}
              aria-hidden
            />
          )}
          <span className="truncate whitespace-nowrap text-[var(--color-fg)]">{label}</span>
        </span>
        {(code || tag) && (
          <span className="flex shrink-0 items-center gap-1.5">
            {code && (
              <span
                data-mono
                className="tile-code rounded-[999px] px-2 py-[2px] text-[10px] uppercase tracking-[0.18em]"
              >
                {code}
              </span>
            )}
            {tag && (
              <span
                data-mono
                className="shrink-0 rounded-[999px] border border-[var(--color-line)] bg-[var(--color-surface-strong)] px-2 py-[2px] text-[10px] uppercase tracking-[0.14em] text-[var(--color-dim)]"
              >
                {tag}
              </span>
            )}
          </span>
        )}
      </header>
      <div className="relative flex-1 min-h-0 min-w-0 overflow-hidden">
        {children}
      </div>
      {footer && (
        <footer className="relative min-w-0 border-t border-[var(--color-line)] px-4 py-2.5 text-[13px] text-[var(--color-dim)]">
          {footer}
        </footer>
      )}
    </div>
  )

  if (to) {
    return (
      <Link
        to={to}
        data-interactive
        className="block h-full min-w-0"
        onMouseEnter={prefetch}
        onFocus={prefetch}
        onTouchStart={prefetch}
      >
        {body}
      </Link>
    )
  }
  return body
}
