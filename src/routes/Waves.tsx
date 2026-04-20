import { useEffect } from 'react'
import Tile from '../components/Tile'
import { StudioProvider, useStudio } from './waves/StudioContext'
import Transport from './waves/Transport'
import Mixer from './waves/Mixer'
import StepGrid from './waves/StepGrid'
import Visualizer from './waves/Visualizer'
import FXRack from './waves/FXRack'
import KitPicker from './waves/KitPicker'

/** global-keybinds bridge. kept inside the provider so it can call dispatchers. */
function Shortcuts() {
  const s = useStudio()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.key === ' ') { e.preventDefault(); s.toggleTransport() }
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
        <Tile label="kit" footer={<span>drop .wav onto a drum track · converts voice to sampler</span>}>
          <KitPicker />
        </Tile>
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
