import { useEffect, useState } from 'react'
import { useStudio } from './StudioContext'

export default function Settings() {
  const s = useStudio()
  const [initError, setInitError] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)

  // arm for ~4s; if the user doesn't confirm in that window, disarm
  useEffect(() => {
    if (!confirmReset) return
    const id = window.setTimeout(() => setConfirmReset(false), 4000)
    return () => clearTimeout(id)
  }, [confirmReset])

  useEffect(() => {
    // autostart midi if the browser supports it
    if (s.midiAvailable && s.midiDevices.length === 0) {
      s.initMidi().catch((e) => setInitError(e?.message ?? 'init failed'))
    }
  }, [s])

  return (
    <div className="flex flex-col gap-3 p-3 text-[12px]">
      <div>
        <div className="text-[11px] text-[var(--color-dim)] mb-1">midi input</div>
        {!s.midiAvailable ? (
          <div className="text-[var(--color-dim)]">webmidi unavailable in this browser</div>
        ) : initError ? (
          <div className="text-[#ff7a7a]">midi permission denied or failed: {initError}</div>
        ) : s.midiDevices.length === 0 ? (
          <div className="text-[var(--color-dim)]">no midi devices detected (plug one in, then hit rescan)</div>
        ) : (
          <select
            className="w-full bg-[var(--color-bg)] border border-[var(--color-line)] rounded-[3px] px-2 py-1 text-[12px] text-[var(--color-fg)]"
            value={s.midiActiveId ?? ''}
            onChange={(e) => s.selectMidi(e.target.value || null)}
          >
            <option value="">— none —</option>
            {s.midiDevices.map((d) => (
              <option key={d.id} value={d.id}>{d.name}{d.manufacturer ? ` · ${d.manufacturer}` : ''}</option>
            ))}
          </select>
        )}
        <button
          data-interactive
          onClick={() => s.initMidi().then(() => setInitError(null)).catch((e) => setInitError(e?.message ?? 'init failed'))}
          className="mt-2 !px-2 !py-1 !text-[11px] !text-[var(--color-dim)]"
        >
          rescan
        </button>
      </div>

      <div className="border-t border-[var(--color-line)] pt-3">
        <div className="text-[11px] text-[var(--color-dim)] mb-1">project</div>
        <button
          data-interactive
          onClick={() => {
            if (confirmReset) {
              s.resetProject()
              setConfirmReset(false)
            } else {
              setConfirmReset(true)
            }
          }}
          className={`!px-2 !py-1 !text-[11px] ${
            confirmReset
              ? '!text-[var(--color-bg)] !bg-[#ff7a7a] !border-[#ff7a7a]'
              : '!text-[#ff7a7a] !border-[#2a1a1a]'
          }`}
          title={confirmReset ? 'click again within 4s to confirm' : 'reset project — autosave will be cleared'}
        >
          {confirmReset ? 'click again to confirm' : 'reset project'}
        </button>
      </div>

      <div className="text-[11px] text-[var(--color-dim)] leading-relaxed border-t border-[var(--color-line)] pt-3">
        arm a track (red ● on the strip) to route incoming midi notes to it.
        velocity + note both carry through. monophonic per track for now; held
        notes and cc/pb arrive in phase d.
      </div>
    </div>
  )
}
