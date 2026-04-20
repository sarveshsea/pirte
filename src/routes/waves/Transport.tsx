import Slider from '../../components/Slider'
import { Knob } from '../../components/waves/primitives'
import { PATTERN_IDS } from '../../modules/waves/types'
import { useStudio } from './StudioContext'

export default function Transport() {
  const s = useStudio()
  const p = s.project

  return (
    <div className="flex flex-wrap items-center gap-4 p-3">
      <button
        data-interactive
        onClick={s.toggleTransport}
        className={`!px-4 !py-2 !text-[14px] ${s.playing ? '!border-[var(--color-fg)] !bg-[var(--color-fg)] !text-[var(--color-bg)]' : ''}`}
      >
        {s.playing ? '■ stop' : '▶ play'}
      </button>

      <div className="flex items-center gap-1">
        {PATTERN_IDS.map((id) => (
          <button
            key={id}
            data-interactive
            onClick={() => s.setActivePattern(id)}
            className={`!px-3 !py-1.5 !text-[12px] tabular-nums ${
              p.activePattern === id
                ? '!border-[var(--color-fg)] !text-[var(--color-fg)]'
                : '!border-[var(--color-line)] !text-[var(--color-dim)]'
            }`}
          >
            {id}
          </button>
        ))}
      </div>

      <div className="flex min-w-[160px] flex-1 items-center gap-2">
        <Slider label="bpm"   min={60} max={200} step={1}    value={p.bpm}   onChange={s.setBpm} />
      </div>
      <div className="flex min-w-[160px] flex-1 items-center gap-2">
        <Slider label="swing" min={0}  max={1}   step={0.02} value={p.swing} onChange={s.setSwing} format={(v) => `${(v * 100).toFixed(0)}%`} />
      </div>

      <Knob
        label="master"
        min={0}
        max={1}
        step={0.01}
        value={p.master.gain}
        defaultValue={0.6}
        onChange={s.setMasterGain}
        accent="#50ffd8"
        format={(v) => `${Math.round(v * 100)}`}
      />

      <span className="ml-auto font-mono tabular-nums text-[13px] text-[var(--color-dim)]">
        step {String(s.step + 1).padStart(2, '0')}
      </span>
    </div>
  )
}
