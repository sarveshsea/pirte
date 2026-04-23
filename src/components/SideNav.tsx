import { type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { docsRoute, moduleRoutes, prefetchRoute, type AppRoute, type NavIcon } from '../lib/routes'
import Logo from './Logo'

const s = {
  width: 15,
  height: 15,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

const ICONS: Record<NavIcon, ReactNode> = {
  fractal: (
    <svg {...s}>
      <path d="M12 3 L21 20 L3 20 Z" />
      <path d="M12 10 L17 19 L7 19 Z" />
    </svg>
  ),
  chaos: (
    <svg {...s}>
      <path d="M4 12 C4 7 9 7 12 12 C15 17 20 17 20 12 C20 7 15 7 12 12 C9 17 4 17 4 12 Z" />
    </svg>
  ),
  sprites: (
    <svg {...s}>
      <circle cx="6"  cy="7"  r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="10" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="18" cy="6"  r="1.4" fill="currentColor" stroke="none" />
      <circle cx="8"  cy="15" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="16" cy="16" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="11" cy="19" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  ),
  waves: (
    <svg {...s}>
      <rect x="5"  y="10" width="2.4" height="9"  rx="0.5" fill="currentColor" stroke="none" />
      <rect x="10" y="5"  width="2.4" height="14" rx="0.5" fill="currentColor" stroke="none" />
      <rect x="15" y="12" width="2.4" height="7"  rx="0.5" fill="currentColor" stroke="none" />
    </svg>
  ),
  radio: (
    <svg {...s}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12 h18" />
      <path d="M12 3 C15 7 15 17 12 21" />
      <path d="M12 3 C9 7 9 17 12 21" />
    </svg>
  ),
  spinners: (
    <svg {...s}>
      <path d="M21 12 a9 9 0 1 1 -9 -9" />
    </svg>
  ),
  microbes: (
    <svg {...s}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="9" cy="10" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="14" cy="13" r="1" fill="currentColor" stroke="none" />
      <circle cx="10" cy="15" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  ),
  bloom: (
    <svg {...s}>
      <path d="M12 3 C8 9 6 12 6 15 a6 6 0 0 0 12 0 C18 12 16 9 12 3 Z" />
    </svg>
  ),
  faces: (
    <svg {...s}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="9" cy="10" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="10" r="1" fill="currentColor" stroke="none" />
      <path d="M8 14 C9.5 16 11 17 12 17 C13 17 14.5 16 16 14" />
    </svg>
  ),
  edits: (
    <svg {...s}>
      <path d="M4 5 l3 14 l3 -10 l3 10 l3 -14" />
    </svg>
  ),
  pigment: (
    <svg {...s}>
      <circle cx="9" cy="10" r="4.5" />
      <circle cx="15" cy="10" r="4.5" />
      <circle cx="12" cy="15" r="4.5" />
    </svg>
  ),
  voxels: (
    <svg {...s}>
      <path d="M12 3 L21 8 L21 16 L12 21 L3 16 L3 8 Z" />
      <path d="M3 8 L12 13 L21 8" />
      <path d="M12 13 L12 21" />
    </svg>
  ),
  docs: (
    <svg {...s}>
      <path d="M6 3h9l3 3v15H6z" />
      <path d="M15 3v3h3" />
      <line x1="9" y1="12" x2="15" y2="12" />
      <line x1="9" y1="16" x2="15" y2="16" />
    </svg>
  ),
}

function prefetchProps(path: string) {
  const prefetch = () => {
    prefetchRoute(path)
  }

  return {
    onMouseEnter: prefetch,
    onFocus: prefetch,
    onTouchStart: prefetch,
  }
}

function rowClasses(active: boolean, mode: 'rail' | 'pill') {
  if (mode === 'pill') {
    return `inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] tracking-[0.05em] transition-colors ${
      active
        ? 'border-[var(--color-fg)] bg-[var(--color-fg)] text-[var(--color-bg)]'
        : 'border-[var(--color-line)] bg-[var(--color-surface-strong)] text-[var(--color-dim)] hover:border-[var(--color-fg)] hover:text-[var(--color-fg)]'
    }`
  }

  return `inline-flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-[13px] transition-colors ${
    active
      ? 'bg-[var(--color-line)]/90 text-[var(--color-fg)]'
      : 'text-[var(--color-dim)] hover:bg-[var(--color-line)]/45 hover:text-[var(--color-fg)]'
  }`
}

function NavLinkRow({
  route,
  active,
  mode,
}: {
  route: AppRoute
  active: boolean
  mode: 'rail' | 'pill'
}) {
  const icon = route.navIcon ? ICONS[route.navIcon] : null

  return (
    <Link
      to={route.path}
      data-interactive
      className={rowClasses(active, mode)}
      {...prefetchProps(route.path)}
    >
      <span className="inline-flex w-[15px] shrink-0 items-center justify-center">{icon}</span>
      <span className="truncate whitespace-nowrap">{route.label}</span>
    </Link>
  )
}

export default function SideNav() {
  const loc = useLocation()
  const isActive = (path: string) => loc.pathname === path

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 border-b border-[var(--color-line)]/80 bg-[color-mix(in_srgb,var(--color-bg)_72%,transparent)] backdrop-blur-xl lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Link
            to="/"
            data-interactive
            data-logo-target
            className="flex items-center gap-2.5 text-[var(--color-fg)]"
            title="pirt,e · home"
            {...prefetchProps('/')}
          >
            <Logo size={22} />
            <span className="text-[17px] tracking-[-0.01em]">pirt,e</span>
          </Link>

          <NavLinkRow route={docsRoute} active={isActive(docsRoute.path)} mode="pill" />
        </div>

        <nav
          className="flex gap-2 overflow-x-auto px-4 pb-3"
          aria-label="primary navigation"
          style={{ scrollbarWidth: 'none' }}
        >
          {moduleRoutes.map((route) => (
            <NavLinkRow
              key={route.path}
              route={route}
              active={isActive(route.path)}
              mode="pill"
            />
          ))}
        </nav>
      </header>

      <aside
        className="fixed left-0 top-0 z-40 hidden h-full w-[var(--layout-nav-width)] flex-col border-r border-[var(--color-line)] bg-[color-mix(in_srgb,var(--color-surface)_88%,transparent)] p-5 backdrop-blur-xl lg:flex"
        aria-label="primary navigation"
      >
        <Link
          to="/"
          data-interactive
          data-logo-target
          className="mb-5 flex items-center gap-2.5 text-[var(--color-fg)]"
          title="pirt,e · home"
          {...prefetchProps('/')}
        >
          <Logo size={22} />
          <span className="text-[17px] tracking-[-0.01em]">pirt,e</span>
        </Link>

        <nav className="flex flex-col gap-1">
          {moduleRoutes.map((route) => (
            <NavLinkRow
              key={route.path}
              route={route}
              active={isActive(route.path)}
              mode="rail"
            />
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-3">
          <p className="text-[11px] leading-[1.5] tracking-[0.08em] text-[var(--color-dim)]">
            generative scenes, simulations, live telemetry, audio instruments.
          </p>
          <NavLinkRow route={docsRoute} active={isActive(docsRoute.path)} mode="rail" />
        </div>
      </aside>
    </>
  )
}
