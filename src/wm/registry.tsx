import { lazy, type LazyExoticComponent, type ComponentType } from 'react'

export type RouteEntry = {
  path: string
  label: string
  Component: LazyExoticComponent<ComponentType>
}

// lazy so panes only load their code when a route is actually placed in them.
export const REGISTRY: RouteEntry[] = [
  { path: '/fractals',     label: 'fractals',     Component: lazy(() => import('../routes/Fractals')) },
  { path: '/attractors',   label: 'attractors',   Component: lazy(() => import('../routes/Attractors')) },
  { path: '/ascii',        label: 'ascii',        Component: lazy(() => import('../routes/Ascii')) },
  { path: '/terminal',     label: 'terminal',     Component: lazy(() => import('../routes/Terminal')) },
  { path: '/pixels',       label: 'pixels',       Component: lazy(() => import('../routes/Pixels')) },
  { path: '/time',         label: 'time',         Component: lazy(() => import('../routes/Time')) },
  { path: '/kaleidoscope', label: 'kaleidoscope', Component: lazy(() => import('../routes/Kaleidoscope')) },
  { path: '/sprites',      label: 'sprites',      Component: lazy(() => import('../routes/Sprites')) },
  { path: '/waves',        label: 'waves',        Component: lazy(() => import('../routes/Waves')) },
  { path: '/doom',         label: 'doom',         Component: lazy(() => import('../routes/Doom')) },
  { path: '/breathe',      label: 'breathe',      Component: lazy(() => import('../routes/Breathe')) },
  { path: '/starfield',    label: 'starfield',    Component: lazy(() => import('../routes/Starfield')) },
  { path: '/folds',        label: 'folds',        Component: lazy(() => import('../routes/Folds')) },
  { path: '/orbit',        label: 'orbit',        Component: lazy(() => import('../routes/Orbit')) },
]

export function byPath(p: string): RouteEntry | undefined {
  return REGISTRY.find((r) => r.path === p)
}
