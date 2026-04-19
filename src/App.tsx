import { useEffect, useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import Cursor from './components/Cursor'
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
]

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
      <main className="min-h-[calc(100vh-24px)] px-6 pt-6 pb-10 md:px-8 md:pt-8">
        <PageNav />
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/fractals" element={<Fractals />} />
          <Route path="/attractors" element={<Attractors />} />
          <Route path="/ascii" element={<Ascii />} />
          <Route path="/terminal" element={<Terminal />} />
          <Route path="/pixels" element={<Pixels />} />
          <Route path="/time" element={<Time />} />
          <Route path="/kaleidoscope" element={<Kaleidoscope />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <StatusBar onPalette={() => setPaletteOpen(true)} />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
      <Cursor />
    </>
  )
}
