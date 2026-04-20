import { useCallback, useState } from 'react'
import { findPattern } from '../../modules/waves/pattern'
import { useStudio } from './StudioContext'

/** minimal drag-drop drop-zone + sample label for each drum track. built-in
 *  kits can be layered in later as dynamic imports that set the same buffer. */
export default function KitPicker() {
  const s = useStudio()
  const pattern = findPattern(s.project, s.project.activePattern)
  // show rows only for tracks whose voice is drum-kind or sampler
  const eligible = pattern.tracks
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => t.voice === 'sampler' || t.voice === 'kick' || t.voice === 'snare' || t.voice === 'hat' || t.voice === 'clap' || t.voice === 'tom')

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="text-[11px] text-[var(--color-dim)]">
        drop a .wav onto a track to replace its voice with a sampler loaded to that buffer.
        tracks currently using drum synths are also eligible — dropping a wav converts them to sampler voices.
      </div>
      <div className="grid grid-cols-2 gap-2">
        {eligible.map(({ t, i }) => (
          <DropCell key={i} trackIdx={i} name={t.name} voice={t.voice} sample={t.sampleSlot} />
        ))}
      </div>
    </div>
  )
}

function DropCell({
  trackIdx, name, voice, sample,
}: {
  trackIdx: number
  name: string
  voice: string
  sample?: unknown
}) {
  const s = useStudio()
  const [over, setOver] = useState(false)
  const [loaded, setLoaded] = useState<string | null>(
    sample && typeof sample === 'object' && 'name' in (sample as Record<string, unknown>)
      ? ((sample as { name: string }).name)
      : null,
  )

  const load = useCallback(async (file: File) => {
    const buf = await file.arrayBuffer()
    await s.loadSample(trackIdx, buf, file.name)
    setLoaded(file.name)
  }, [s, trackIdx])

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault(); setOver(false)
        const f = e.dataTransfer.files[0]
        if (f) load(f)
      }}
      className={`flex flex-col gap-1 rounded-[4px] border p-2 text-[11px] ${over ? 'border-[#50ffd8] bg-[rgba(80,255,216,0.05)]' : 'border-[var(--color-line)] bg-[var(--color-bg)]'}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[var(--color-fg)]">{String(trackIdx + 1).padStart(2, '0')} · {name}</span>
        <span className="text-[var(--color-dim)]">{voice}</span>
      </div>
      <div className="text-[10px] text-[var(--color-dim)]">
        {loaded ? `♪ ${loaded}` : 'drop a .wav here'}
      </div>
      <label className="mt-1 inline-flex cursor-pointer items-center justify-center border border-dashed border-[var(--color-line)] px-2 py-1 text-[10px] text-[var(--color-dim)] hover:border-[var(--color-fg)]">
        browse…
        <input
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) load(f) }}
        />
      </label>
    </div>
  )
}
