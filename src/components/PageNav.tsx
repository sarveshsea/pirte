import { useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

export const ROUTE_ORDER = [
  { path: '/fractals',     label: 'fractals',     code: '01' },
  { path: '/attractors',   label: 'attractors',   code: '02' },
  { path: '/ascii',        label: 'ascii',        code: '03' },
  { path: '/terminal',     label: 'terminal',     code: '04' },
  { path: '/pixels',       label: 'pixels',       code: '05' },
  { path: '/time',         label: 'time',         code: '06' },
  { path: '/kaleidoscope', label: 'kaleidoscope', code: '07' },
  { path: '/sprites',      label: 'sprites',      code: '08' },
  { path: '/waves',        label: 'waves',        code: '09' },
  { path: '/doom',         label: 'doom',         code: '10' },
  { path: '/breathe',      label: 'breathe',      code: '11' },
  { path: '/starfield',    label: 'starfield',    code: '12' },
  { path: '/tarot',        label: 'tarot',        code: '13' },
  { path: '/particles',    label: 'particles',    code: '14' },
]

export default function PageNav() {
  const loc = useLocation()
  const nav = useNavigate()
  const idx = ROUTE_ORDER.findIndex((r) => r.path === loc.pathname)
  const prev = ROUTE_ORDER[(idx - 1 + ROUTE_ORDER.length) % ROUTE_ORDER.length]
  const next = ROUTE_ORDER[(idx + 1) % ROUTE_ORDER.length]
  const current = idx >= 0 ? ROUTE_ORDER[idx] : null

  useEffect(() => {
    if (idx < 0) return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === '[') { e.preventDefault(); nav(prev.path) }
      else if (e.key === ']') { e.preventDefault(); nav(next.path) }
      else if (e.key.toLowerCase() === 'h' && !e.shiftKey) {
        // only act when not focused on an element that might use h
        const t = e.target as HTMLElement | null
        if (t && (t.tagName === 'BUTTON' || t.isContentEditable)) return
        nav('/')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [idx, nav, prev.path, next.path])

  if (idx < 0) return null

  return (
    <nav className="mb-6 flex items-center justify-between border-b border-[var(--color-line)] pb-4 text-[12px]">
      <Link
        to="/"
        data-interactive
        className="group inline-flex items-center gap-2 text-[var(--color-dim)] hover:text-[var(--color-fg)]"
        title="home · h"
      >
        <span className="inline-block h-[12px] w-[8px] border border-[var(--color-dim)] group-hover:border-[var(--color-fg)] group-hover:bg-[var(--color-fg)]" />
        <span>pirte</span>
        <span className="text-[var(--color-line)]">·</span>
        <span className="text-[var(--color-dim)]">home</span>
      </Link>

      <div className="flex items-center gap-2 tracking-[0.06em] text-[var(--color-dim)]">
        <span className="text-[var(--color-line)]">{current!.code}</span>
        <span className="text-[var(--color-fg)]">{current!.label}</span>
      </div>

      <div className="flex items-center gap-3">
        <Link to={prev.path} data-interactive title="prev · [" className="text-[var(--color-dim)] hover:text-[var(--color-fg)]">
          ← {prev.label}
        </Link>
        <span className="text-[var(--color-line)]">·</span>
        <Link to={next.path} data-interactive title="next · ]" className="text-[var(--color-dim)] hover:text-[var(--color-fg)]">
          {next.label} →
        </Link>
      </div>
    </nav>
  )
}
