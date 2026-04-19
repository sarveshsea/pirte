import { useEffect, useState } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import Cursor from './components/Cursor'
import Spotlight from './components/Spotlight'
import StatusBar from './components/StatusBar'
import CommandPalette, { type Command } from './components/CommandPalette'
import PageNav from './components/PageNav'
import Index from './routes/Index'
import Fractals from './routes/Fractals'
import Attractors from './routes/Attractors'
import Ascii from './routes/Ascii'
import Terminal from './routes/Terminal'
import Pixels from './routes/Pixels'
import Time from './routes/Time'
import Kaleidoscope from './routes/Kaleidoscope'
import Sprites from './routes/Sprites'
import Waves from './routes/Waves'
import Doom from './routes/Doom'
import Breathe from './routes/Breathe'
import Starfield from './routes/Starfield'
import Tarot from './routes/Tarot'
import Particles from './routes/Particles'
import Cyber from './routes/Cyber'
import Folds from './routes/Folds'
import Orbit from './routes/Orbit'
import NotFound from './routes/NotFound'

const commands: Command[] = [
  { id: 'home',        label: 'index',       to: '/',            hint: '/' },
  { id: 'fractals',    label: 'fractals',    to: '/fractals',    hint: 'mandelbrot + julia' },
  { id: 'attractors',  label: 'attractors',  to: '/attractors',  hint: 'lorenz / clifford / dejong' },
  { id: 'ascii',       label: 'ascii',       to: '/ascii',       hint: 'image → text' },
  { id: 'terminal',    label: 'terminal',    to: '/terminal',    hint: 'rain / donut / life / flow / rule-30' },
  { id: 'pixels',      label: 'pixels',      to: '/pixels',      hint: 'fill game' },
  { id: 'time',        label: 'time',        to: '/time',        hint: 'global clocks' },
  { id: 'kaleidoscope', label: 'kaleidoscope', to: '/kaleidoscope', hint: 'n-fold mirror' },
  { id: 'sprites',     label: 'sprites',     to: '/sprites',     hint: 'ascii playground' },
  { id: 'waves',       label: 'waves',       to: '/waves',       hint: 'edm sequencer + scope' },
  { id: 'doom',        label: 'doom',        to: '/doom',        hint: 'e1m1 ascii homage' },
  { id: 'breathe',     label: 'breathe',     to: '/breathe',     hint: 'box-breathing guide' },
  { id: 'starfield',   label: 'starfield',   to: '/starfield',   hint: '3d flythrough' },
  { id: 'tarot',       label: 'tarot',       to: '/tarot',       hint: 'major arcana draw' },
  { id: 'particles',   label: 'particles',   to: '/particles',   hint: 'verlet physics' },
  { id: 'cyber',       label: 'cyber',       to: '/cyber',       hint: 'night city dashboard' },
  { id: 'folds',       label: 'folds',       to: '/folds',       hint: 'generative gallery' },
  { id: 'orbit',       label: 'orbit',       to: '/orbit',       hint: 'iss live · telemetry' },
]

const TRANSITION = { duration: 0.14, ease: [0.2, 0.7, 0.2, 1] as [number, number, number, number] }

function AnimatedRoutes() {
  const location = useLocation()
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 6, filter: 'blur(2px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        exit={{ opacity: 0, y: -4, filter: 'blur(2px)' }}
        transition={TRANSITION}
      >
        <Routes location={location}>
          <Route path="/" element={<Index />} />
          <Route path="/fractals" element={<Fractals />} />
          <Route path="/attractors" element={<Attractors />} />
          <Route path="/ascii" element={<Ascii />} />
          <Route path="/terminal" element={<Terminal />} />
          <Route path="/pixels" element={<Pixels />} />
          <Route path="/time" element={<Time />} />
          <Route path="/kaleidoscope" element={<Kaleidoscope />} />
          <Route path="/sprites" element={<Sprites />} />
          <Route path="/waves" element={<Waves />} />
          <Route path="/doom" element={<Doom />} />
          <Route path="/breathe" element={<Breathe />} />
          <Route path="/starfield" element={<Starfield />} />
          <Route path="/tarot" element={<Tarot />} />
          <Route path="/particles" element={<Particles />} />
          <Route path="/cyber" element={<Cyber />} />
          <Route path="/folds" element={<Folds />} />
          <Route path="/orbit" element={<Orbit />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  )
}

export default function App() {
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
      if (e.key === 'Escape') setPaletteOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      <Spotlight />
      <main className="min-h-[calc(100vh-28px)] px-6 pt-6 pb-10 md:px-8 md:pt-8">
        <PageNav />
        <AnimatedRoutes />
      </main>
      <StatusBar onPalette={() => setPaletteOpen(true)} />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
      <Cursor />
    </>
  )
}
