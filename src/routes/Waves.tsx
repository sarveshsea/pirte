import { useEffect } from 'react'
import Tile from '../components/Tile'
import { StudioProvider, useStudio } from './waves/StudioContext'
import Transport from './waves/Transport'
import Mixer from './waves/Mixer'
import StepGrid from './waves/StepGrid'
import Visualizer from './waves/Visualizer'
import FXRack from './waves/FXRack'
import KitPicker from './waves/KitPicker'
import Settings from './waves/Settings'

/** global-keybinds bridge. kept inside the provider so it can call dispatchers. */
function Shortcuts() {
  const s = useStudio()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key

      // transport
      if (k === ' ') { e.preventDefault(); s.toggleTransport(); return }

      // undo / redo
      if ((k === 'z' || k === 'Z') && !e.shiftKey) { e.preventDefault(); s.undo(); return }
      if (k === 'Z' && e.shiftKey)                 { e.preventDefault(); s.redo(); return }

      // patterns 1..8 → A..H
      if (k >= '1' && k <= '8') {
        const ids = ['A','B','C','D','E','F','G','H'] as const
        const idx = k.charCodeAt(0) - '1'.charCodeAt(0)
        e.preventDefault()
        s.setActivePattern(ids[idx])
        return
      }

      // clear active pattern
      if (k === 'c' || k === 'C') { e.preventDefault(); s.clearActivePattern(); return }

      // bpm nudge
      if (k === ',') { e.preventDefault(); s.setBpm(Math.max(40, s.project.bpm - 1));  return }
      if (k === '.') { e.preventDefault(); s.setBpm(Math.min(240, s.project.bpm + 1)); return }

      // numpad 1..9 → trigger tracks 1..9
      const np = parseInt(e.code.replace('Numpad', ''), 10)
      if (Number.isFinite(np) && np >= 1 && np <= 9) {
        e.preventDefault()
        s.triggerTrack(np - 1, 60)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [s])
  return null
}

function Studio() {
  return (
    <div className="flex w-full flex-col gap-4">
      <Tile label="waves · studio" code="09">
        <Transport />
      </Tile>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_600px]">
        <Tile label="sequencer" footer={<span>click steps to toggle · pattern {} · space play</span>}>
          <StepGrid />
        </Tile>
        <div className="flex flex-col gap-4">
          <Tile label="visualizer">
            <Visualizer />
          </Tile>
          <Tile label="mixer" footer={<span>12 tracks · drag knobs vertically · shift+drag = fine · dblclick = default</span>}>
            <Mixer />
          </Tile>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_420px]">
        <Tile label="master fx" footer={<span>bitcrush · compressor (sidechain taps the kick) · delay · reverb · limiter</span>}>
          <FXRack />
        </Tile>
        <div className="flex flex-col gap-4">
          <Tile label="kit" footer={<span>drop .wav onto a drum track · converts voice to sampler</span>}>
            <KitPicker />
          </Tile>
          <Tile label="settings" footer={<span>midi · project</span>}>
            <Settings />
          </Tile>
        </div>
      </div>
    </div>
  )
}

export default function Waves() {
  return (
    <StudioProvider>
      <Shortcuts />
      <Studio />
    </StudioProvider>
  )
}
