import { useRef, useState } from 'react'
import Slider from '../../components/Slider'
import { Knob } from '../../components/waves/primitives'
import { PATTERN_IDS, type PatternId } from '../../modules/waves/types'
import { useStudio } from './StudioContext'

export default function Transport() {
  const s = useStudio()
  const p = s.project
  const [copyTarget, setCopyTarget] = useState<PatternId | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
            onClick={() => {
              if (copyTarget !== null) {
                s.copyActivePatternTo(id)
                setCopyTarget(null)
              } else {
                s.setActivePattern(id)
              }
            }}
            className={`!px-3 !py-1.5 !text-[12px] tabular-nums ${
              p.activePattern === id
                ? '!border-[var(--color-fg)] !text-[var(--color-fg)]'
                : copyTarget !== null
                  ? '!border-[#6ab8ff] !text-[#6ab8ff]'
                  : '!border-[var(--color-line)] !text-[var(--color-dim)]'
            }`}
          >
            {id}
          </button>
        ))}
        <button
          data-interactive
          onClick={() => setCopyTarget(copyTarget === null ? p.activePattern : null)}
          className={`!px-2 !py-1.5 !text-[11px] ${copyTarget !== null ? '!border-[#6ab8ff] !text-[#6ab8ff]' : '!border-[var(--color-line)] !text-[var(--color-dim)]'}`}
          title={copyTarget !== null ? `copy ${copyTarget} → click destination` : `copy active pattern (${p.activePattern}) to…`}
        >
          {copyTarget !== null ? `copy ${copyTarget} →` : 'copy'}
        </button>
        <button
          data-interactive
          onClick={s.clearActivePattern}
          className="!px-2 !py-1.5 !text-[11px] !border-[var(--color-line)] !text-[var(--color-dim)]"
          title={`clear pattern ${p.activePattern}`}
        >
          clear
        </button>
      </div>

      <div className="flex items-center gap-1">
        <button
          data-interactive
          onClick={s.undo}
          disabled={!s.canUndo}
          className={`!px-2 !py-1.5 !text-[11px] ${s.canUndo ? '' : '!opacity-40'}`}
          title="undo (z)"
        >
          ↶
        </button>
        <button
          data-interactive
          onClick={s.redo}
          disabled={!s.canRedo}
          className={`!px-2 !py-1.5 !text-[11px] ${s.canRedo ? '' : '!opacity-40'}`}
          title="redo (shift+z)"
        >
          ↷
        </button>
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

      <div className="flex items-center gap-1">
        <button
          data-interactive
          onClick={s.exportProject}
          className="!px-2 !py-1.5 !text-[11px] !text-[var(--color-dim)]"
          title="export project as json"
        >
          export
        </button>
        <button
          data-interactive
          onClick={() => fileInputRef.current?.click()}
          className="!px-2 !py-1.5 !text-[11px] !text-[var(--color-dim)]"
          title="import project json"
        >
          import
        </button>
        <input
          type="file"
          accept="application/json"
          className="hidden"
          ref={fileInputRef}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) s.importProject(f)
            if (fileInputRef.current) fileInputRef.current.value = ''
          }}
        />
      </div>

      <span className="ml-auto font-mono tabular-nums text-[13px] text-[var(--color-dim)]">
        step {String(s.step + 1).padStart(2, '0')}
      </span>
    </div>
  )
}
