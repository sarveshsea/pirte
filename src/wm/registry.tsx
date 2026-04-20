import type { ComponentType } from 'react'
import Fractals from '../routes/Fractals'
import Attractors from '../routes/Attractors'
import Ascii from '../routes/Ascii'
import Terminal from '../routes/Terminal'
import Pixels from '../routes/Pixels'
import Time from '../routes/Time'
import Kaleidoscope from '../routes/Kaleidoscope'
import Sprites from '../routes/Sprites'
import Waves from '../routes/Waves'
import Doom from '../routes/Doom'
import Breathe from '../routes/Breathe'
import Starfield from '../routes/Starfield'
import Tarot from '../routes/Tarot'
import Particles from '../routes/Particles'
import Cyber from '../routes/Cyber'
import Folds from '../routes/Folds'
import Orbit from '../routes/Orbit'

export type RouteEntry = {
  path: string
  label: string
  Component: ComponentType
}

export const REGISTRY: RouteEntry[] = [
  { path: '/fractals',     label: 'fractals',     Component: Fractals },
  { path: '/attractors',   label: 'attractors',   Component: Attractors },
  { path: '/ascii',        label: 'ascii',        Component: Ascii },
  { path: '/terminal',     label: 'terminal',     Component: Terminal },
  { path: '/pixels',       label: 'pixels',       Component: Pixels },
  { path: '/time',         label: 'time',         Component: Time },
  { path: '/kaleidoscope', label: 'kaleidoscope', Component: Kaleidoscope },
  { path: '/sprites',      label: 'sprites',      Component: Sprites },
  { path: '/waves',        label: 'waves',        Component: Waves },
  { path: '/doom',         label: 'doom',         Component: Doom },
  { path: '/breathe',      label: 'breathe',      Component: Breathe },
  { path: '/starfield',    label: 'starfield',    Component: Starfield },
  { path: '/tarot',        label: 'tarot',        Component: Tarot },
  { path: '/particles',    label: 'particles',    Component: Particles },
  { path: '/cyber',        label: 'cyber',        Component: Cyber },
  { path: '/folds',        label: 'folds',        Component: Folds },
  { path: '/orbit',        label: 'orbit',        Component: Orbit },
]

export function byPath(p: string): RouteEntry | undefined {
  return REGISTRY.find((r) => r.path === p)
}
