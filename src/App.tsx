import { lazy, Suspense, useEffect, useState } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import Cursor from './components/Cursor'
import Spotlight from './components/Spotlight'
import StatusBar from './components/StatusBar'
import CommandPalette, { type Command } from './components/CommandPalette'
import Shortcuts from './components/Shortcuts'
import PageNav from './components/PageNav'
import RouteError from './components/RouteError'
import GridBackground from './components/GridBackground'
import WM from './wm/WM'
import { DotsSpinner } from './components/spinners'
import { prefersReducedMotion } from './lib/canvas'
import { usePersistedBg } from './bg/usePersistedBg'
import { nextBg, type BgName } from './bg/registry'

// route chunks — each becomes its own js file via vite code-splitting
const Index        = lazy(() => import('./routes/Index'))
const Fractals     = lazy(() => import('./routes/Fractals'))
const Attractors   = lazy(() => import('./routes/Attractors'))
const Ascii        = lazy(() => import('./routes/Ascii'))
const Pixels       = lazy(() => import('./routes/Pixels'))
const Time         = lazy(() => import('./routes/Time'))
const Kaleidoscope = lazy(() => import('./routes/Kaleidoscope'))
const Sprites      = lazy(() => import('./routes/Sprites'))
const Waves        = lazy(() => import('./routes/Waves'))
const Breathe      = lazy(() => import('./routes/Breathe'))
const Starfield    = lazy(() => import('./routes/Starfield'))
const Orbit        = lazy(() => import('./routes/Orbit'))
const Radio        = lazy(() => import('./routes/Radio'))
const SpinnersPage = lazy(() => import('./routes/Spinners'))
const Microbes     = lazy(() => import('./routes/Microbes'))
const Chroma       = lazy(() => import('./routes/Chroma'))
const Bloom        = lazy(() => import('./routes/Bloom'))
const Docs         = lazy(() => import('./routes/Docs'))
const NotFound     = lazy(() => import('./routes/NotFound'))

const commands: Command[] = [
  { id: 'home',        label: 'index',       to: '/',            hint: '/' },
  { id: 'docs',        label: 'docs',        to: '/docs',        hint: 'modules + keybinds' },
  { id: 'fractals',    label: 'fractals',    to: '/fractals',    hint: 'mandelbrot + julia' },
  { id: 'attractors',  label: 'attractors',  to: '/attractors',  hint: 'lorenz / clifford / dejong' },
  { id: 'ascii',       label: 'ascii',       to: '/ascii',       hint: 'image → text' },
  { id: 'pixels',      label: 'pixels',      to: '/pixels',      hint: 'image → paint-by-number' },
  { id: 'time',        label: 'time',        to: '/time',        hint: 'global clocks' },
  { id: 'kaleidoscope', label: 'kaleidoscope', to: '/kaleidoscope', hint: 'n-fold mirror' },
  { id: 'sprites',     label: 'sprites',     to: '/sprites',     hint: 'ascii playground' },
  { id: 'waves',       label: 'waves',       to: '/waves',       hint: 'studio · 12 tracks · drum synths · fm/wavetable/pluck/pad · master fx · midi' },
  { id: 'breathe',     label: 'breathe',     to: '/breathe',     hint: 'box-breathing guide' },
  { id: 'starfield',   label: 'starfield',   to: '/starfield',   hint: '3d flythrough' },
  { id: 'orbit',       label: 'orbit',       to: '/orbit',       hint: 'iss live · telemetry' },
  { id: 'radio',       label: 'radio',       to: '/radio',       hint: 'global stations · pin the globe' },
  { id: 'spinners',    label: 'spinners',    to: '/spinners',    hint: '54 terminal-style agent spinners' },
  { id: 'microbes',    label: 'microbes',    to: '/microbes',    hint: 'real biology · physarum · turing · chemotaxis · fitzhugh' },
  { id: 'chroma',      label: 'chroma',      to: '/chroma',      hint: 'liquid color exploration · harmony · contrast' },
  { id: 'bloom',       label: 'bloom',       to: '/bloom',       hint: 'wet-on-wet watercolor · drag to paint' },
]

const TRANSITION = { duration: 0.14, ease: [0.2, 0.7, 0.2, 1] as [number, number, number, number] }

function RouteLoader() {
  return (
    <div className="grid place-items-center gap-3 py-24 text-[13px] tracking-[0.18em] text-[var(--color-dim)]">
      <DotsSpinner size={20} color="var(--color-fg)" />
      <span>loading…</span>
    </div>
  )
}

function AnimatedRoutes() {
  const location = useLocation()
  // blur + translate on route transitions is disorienting for altered/motion-sensitive users
  const reduce = prefersReducedMotion()
  const initial = reduce ? { opacity: 0 } : { opacity: 0, y: 6, filter: 'blur(2px)' }
  const animate = reduce ? { opacity: 1 } : { opacity: 1, y: 0, filter: 'blur(0px)' }
  const exit    = reduce ? { opacity: 0 } : { opacity: 0, y: -4, filter: 'blur(2px)' }
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={initial}
        animate={animate}
        exit={exit}
        transition={TRANSITION}
      >
        <RouteError resetKey={location.pathname}>
          <Suspense fallback={<RouteLoader />}>
            <Routes location={location}>
              <Route path="/" element={<Index />} />
              <Route path="/docs" element={<Docs />} />
              <Route path="/fractals" element={<Fractals />} />
              <Route path="/attractors" element={<Attractors />} />
              <Route path="/ascii" element={<Ascii />} />
              <Route path="/pixels" element={<Pixels />} />
              <Route path="/time" element={<Time />} />
              <Route path="/kaleidoscope" element={<Kaleidoscope />} />
              <Route path="/sprites" element={<Sprites />} />
              <Route path="/waves" element={<Waves />} />
              <Route path="/breathe" element={<Breathe />} />
              <Route path="/starfield" element={<Starfield />} />
              <Route path="/orbit" element={<Orbit />} />
              <Route path="/radio" element={<Radio />} />
              <Route path="/spinners" element={<SpinnersPage />} />
              <Route path="/microbes" element={<Microbes />} />
              <Route path="/chroma" element={<Chroma />} />
              <Route path="/bloom" element={<Bloom />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </RouteError>
      </motion.div>
    </AnimatePresence>
  )
}

export default function App() {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [wmOpen, setWmOpen] = useState(false)
  const [bg, setBg] = usePersistedBg()
  const cycleBg = () => setBg(nextBg(bg))
  const bgCommands: Command[] = (['cosmos', 'flow', 'life', 'off'] as BgName[]).map((n) => ({
    id: `bg-${n}`,
    label: `bg: ${n}`,
    hint: n === 'off'    ? 'static gradients only'
        : n === 'cosmos' ? 'nebula + parallax stars + comets'
        : 'living wallpaper',
    run: () => setBg(n),
  }))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
      // '?' key varies by keyboard layout; match both '?' and shift+'/'
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        if (!e.metaKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault()
          setShortcutsOpen((v) => !v)
        }
      }
      // shift+space toggles the tiling WM overlay
      if (e.shiftKey && e.key === ' ' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        setWmOpen((v) => !v)
      }
      if (e.key === 'Escape') { setPaletteOpen(false); setShortcutsOpen(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const mergedCommands = [...commands, ...bgCommands]

  return (
    <>
      <GridBackground program={bg} />
      <Spotlight />
      <main className="min-h-[calc(100vh-28px)] px-6 pt-6 pb-10 md:px-8 md:pt-8">
        <PageNav />
        <AnimatedRoutes />
      </main>
      <StatusBar
        onPalette={() => setPaletteOpen(true)}
        onShortcuts={() => setShortcutsOpen(true)}
        onWM={() => setWmOpen(true)}
        bgName={bg}
        onCycleBg={cycleBg}
      />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={mergedCommands} />
      <Shortcuts open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <WM open={wmOpen} onClose={() => setWmOpen(false)} />
      <Cursor />
    </>
  )
}
