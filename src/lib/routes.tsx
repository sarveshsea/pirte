import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

type RouteLoader = () => Promise<{ default: ComponentType }>

export type NavIcon =
  | 'fractal'
  | 'chaos'
  | 'sprites'
  | 'waves'
  | 'radio'
  | 'spinners'
  | 'microbes'
  | 'bloom'
  | 'faces'
  | 'edits'
  | 'pigment'
  | 'voxels'
  | 'docs'

export type AppRoute = {
  path: string
  label: string
  tag?: string
  accent?: string
  desc?: string
  navIcon?: NavIcon
  Component: LazyExoticComponent<ComponentType>
  load: RouteLoader
}

function defineRoute(route: Omit<AppRoute, 'Component'>): AppRoute {
  return {
    ...route,
    Component: lazy(route.load),
  }
}

export const indexRoute = defineRoute({
  path: '/',
  label: 'home',
  load: () => import('../routes/Index'),
})

export const docsRoute = defineRoute({
  path: '/docs',
  label: 'docs',
  navIcon: 'docs',
  load: () => import('../routes/Docs'),
})

export const moduleRoutes: AppRoute[] = [
  defineRoute({
    path: '/fractals',
    label: 'fractal zoom',
    tag: 'generative',
    accent: '#6a8cff',
    desc: 'mandelbrot + julia',
    navIcon: 'fractal',
    load: () => import('../routes/Fractals'),
  }),
  defineRoute({
    path: '/waves',
    label: 'beat maker',
    tag: 'audio',
    accent: '#50ffd8',
    desc: '12-track step sequencer',
    navIcon: 'waves',
    load: () => import('../routes/Waves'),
  }),
  defineRoute({
    path: '/bloom',
    label: 'watercolor paint',
    tag: 'paint',
    accent: '#c8d4ff',
    desc: 'drag to paint',
    navIcon: 'bloom',
    load: () => import('../routes/Bloom'),
  }),
  defineRoute({
    path: '/attractors',
    label: 'chaos curves',
    tag: 'math',
    accent: '#b48cff',
    desc: 'lorenz, clifford, dejong',
    navIcon: 'chaos',
    load: () => import('../routes/Attractors'),
  }),
  defineRoute({
    path: '/sprites',
    label: 'particle sandbox',
    tag: 'sim',
    accent: '#ff8a5a',
    desc: 'attract, repel, spin',
    navIcon: 'sprites',
    load: () => import('../routes/Sprites'),
  }),
  defineRoute({
    path: '/radio',
    label: 'world radio',
    tag: 'live',
    accent: '#ffb86a',
    desc: 'live stations worldwide',
    navIcon: 'radio',
    load: () => import('../routes/Radio'),
  }),
  defineRoute({
    path: '/microbes',
    label: 'biology sims',
    tag: 'sim',
    accent: '#b8d8a8',
    desc: 'microbes as ascii',
    navIcon: 'microbes',
    load: () => import('../routes/Microbes'),
  }),
  defineRoute({
    path: '/spinners',
    label: 'loading spinners',
    tag: 'ui',
    accent: '#d8d8d8',
    desc: '54 terminal animations',
    navIcon: 'spinners',
    load: () => import('../routes/Spinners'),
  }),
  defineRoute({
    path: '/faces',
    label: 'emoji faces',
    tag: 'text',
    accent: '#e8d0b8',
    desc: 'kaomoji and click to copy',
    navIcon: 'faces',
    load: () => import('../routes/Faces'),
  }),
  defineRoute({
    path: '/pigment',
    label: 'pigment drift',
    tag: 'paint',
    accent: '#d8563a',
    desc: 'RYB particle ribbons',
    navIcon: 'pigment',
    load: () => import('../routes/Pigment'),
  }),
  defineRoute({
    path: '/edits',
    label: 'wikipedia live',
    tag: 'live',
    accent: '#a8dcff',
    desc: 'edits as they happen',
    navIcon: 'edits',
    load: () => import('../routes/Edits'),
  }),
  defineRoute({
    path: '/voxels',
    label: 'voxel life',
    tag: '3d',
    accent: '#ff648b',
    desc: 'cellular automata in glass',
    navIcon: 'voxels',
    load: () => import('../routes/Voxels'),
  }),
]

export const appRoutes: AppRoute[] = [indexRoute, docsRoute, ...moduleRoutes]

const routesByPath = new Map(appRoutes.map((route) => [route.path, route]))
const preloadCache = new Map<string, Promise<unknown>>()

export function prefetchRoute(path: string): Promise<unknown> | undefined {
  const route = routesByPath.get(path)
  if (!route) return undefined

  const pending = preloadCache.get(path)
  if (pending) return pending

  const next = route.load().catch((error) => {
    preloadCache.delete(path)
    throw error
  })
  preloadCache.set(path, next)
  return next
}
