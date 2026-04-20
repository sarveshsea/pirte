import { Knob, MiniMeter } from '../../components/waves/primitives'
import type { VoiceKind } from '../../modules/waves/types'
import { findPattern } from '../../modules/waves/pattern'
import { useStudio } from './StudioContext'

const VOICES: VoiceKind[] = [
  'kick', 'snare', 'hat', 'clap', 'tom',
  'fm', 'wavetable', 'sub', 'pluck', 'pad',
  'sampler',
]

export default function Mixer() {
  const s = useStudio()
  const pattern = findPattern(s.project, s.project.activePattern)

  return (
    <div className="flex h-full overflow-x-auto">
      {pattern.tracks.map((t, i) => {
        const active = !t.mute && (!pattern.tracks.some((x) => x.solo) || t.solo)
        return (
          <div
            key={i}
            className={`flex w-[72px] shrink-0 flex-col items-stretch gap-2 border-r border-[var(--color-line)] p-2 ${active ? '' : 'opacity-60'}`}
          >
            <div className="flex items-center justify-between text-[11px] tracking-[0.08em] text-[var(--color-dim)]">
              <span>{String(i + 1).padStart(2, '0')}</span>
              <span className="truncate text-[var(--color-fg)]">{t.name}</span>
            </div>

            <select
              className="w-full bg-[var(--color-bg)] text-[11px] text-[var(--color-fg)] border border-[var(--color-line)] rounded-[3px] px-1 py-0.5"
              value={t.voice}
              onChange={(e) => s.setTrackVoice(i, e.target.value as VoiceKind)}
            >
              {VOICES.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>

            <div className="flex items-center justify-center gap-2">
              <MiniMeter getLevel={() => s.getTrackLevel(i)} width={6} height={44} accent="#50ffd8" />
              <Knob
                label="vol"
                min={0} max={1.2} step={0.01}
                value={t.gain}
                defaultValue={0.8}
                onChange={(v) => s.setTrackGain(i, v)}
                accent="#50ffd8"
                size={26}
              />
            </div>

            <Knob
              label="pan"
              min={-1} max={1} step={0.02}
              value={t.pan}
              defaultValue={0}
              onChange={(v) => s.setTrackPan(i, v)}
              accent="#50ffd8"
              size={22}
            />

            <div className="flex gap-1">
              <button
                data-interactive
                onClick={() => s.setTrackMute(i, !t.mute)}
                className={`flex-1 !px-1 !py-0.5 !text-[10px] ${t.mute ? '!border-[#ff7a7a] !text-[#ff7a7a]' : '!border-[var(--color-line)] !text-[var(--color-dim)]'}`}
              >
                m
              </button>
              <button
                data-interactive
                onClick={() => s.setTrackSolo(i, !t.solo)}
                className={`flex-1 !px-1 !py-0.5 !text-[10px] ${t.solo ? '!border-[#ffd26a] !text-[#ffd26a]' : '!border-[var(--color-line)] !text-[var(--color-dim)]'}`}
              >
                s
              </button>
            </div>

            <button
              data-interactive
              onClick={() => s.triggerTrack(i, t.steps[0]?.note ?? 60)}
              className="!px-1 !py-1 !text-[10px] !text-[var(--color-dim)]"
              title="preview"
            >
              ▸ preview
            </button>
          </div>
        )
      })}
    </div>
  )
}
