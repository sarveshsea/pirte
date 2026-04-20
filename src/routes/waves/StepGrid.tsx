import { useCallback, useRef, useState } from 'react'
import { findPattern } from '../../modules/waves/pattern'
import { NotePad } from '../../components/waves/primitives'
import { useStudio } from './StudioContext'
import type { Step, VoiceKind } from '../../modules/waves/types'

const MELODIC: VoiceKind[] = ['fm', 'wavetable', 'sub', 'pluck', 'pad', 'tom']

function isMelodic(v: VoiceKind) { return MELODIC.includes(v) }

const NOTE_NAMES = ['c','c#','d','d#','e','f','f#','g','g#','a','a#','b']
function noteName(midi: number): string {
  const n = NOTE_NAMES[((midi % 12) + 12) % 12]
  const oct = Math.floor(midi / 12) - 1
  return `${n}${oct}`
}

type EditKind = 'vel' | 'prob' | 'gate'

export default function StepGrid() {
  const s = useStudio()
  const pattern = findPattern(s.project, s.project.activePattern)
  const cols = pattern.stepsPerBar
  const [edit, setEdit] = useState<EditKind>('vel')
  const [notePopover, setNotePopover] = useState<{ track: number; step: number } | null>(null)

  return (
    <div className="flex flex-col gap-2 p-2">
      {/* edit mode switch */}
      <div className="flex items-center gap-2 text-[11px]">
        <span className="text-[var(--color-dim)]">edit:</span>
        {(['vel', 'prob', 'gate'] as EditKind[]).map((k) => (
          <button
            key={k}
            data-interactive
            onClick={() => setEdit(k)}
            className={`!px-2 !py-0.5 !text-[11px] ${edit === k ? '!border-[#50ffd8] !text-[#50ffd8]' : '!border-[var(--color-line)] !text-[var(--color-dim)]'}`}
          >
            {k}
          </button>
        ))}
        <span className="ml-auto text-[var(--color-dim)]">
          click = toggle · drag vertical = adjust · right-click melodic = set note
        </span>
      </div>

      <div className="flex flex-col gap-[2px] overflow-x-auto">
        {pattern.tracks.map((t, ti) => (
          <TrackRow
            key={ti}
            trackIdx={ti}
            cols={cols}
            edit={edit}
            melodic={isMelodic(t.voice)}
            onOpenNote={(step) => setNotePopover({ track: ti, step })}
          />
        ))}
      </div>

      {notePopover && (
        <NotePopoverShell
          track={notePopover.track}
          step={notePopover.step}
          onClose={() => setNotePopover(null)}
        />
      )}
    </div>
  )
}

function TrackRow({
  trackIdx, cols, edit, melodic, onOpenNote,
}: {
  trackIdx: number
  cols: number
  edit: EditKind
  melodic: boolean
  onOpenNote: (step: number) => void
}) {
  const s = useStudio()
  const pattern = findPattern(s.project, s.project.activePattern)
  const t = pattern.tracks[trackIdx]

  return (
    <div className="flex items-center gap-2">
      <span className="w-[52px] shrink-0 truncate text-[11px] tracking-[0.04em] text-[var(--color-dim)]">
        {t.name}
      </span>
      <div
        className="grid gap-[2px]"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(16px, 1fr))` }}
      >
        {t.steps.map((cell, si) => (
          <Cell
            key={si}
            trackIdx={trackIdx}
            stepIdx={si}
            cell={cell}
            isCurrent={s.playing && si === s.step}
            isBeat={si % 4 === 0}
            isBar={si % 16 === 0}
            melodic={melodic}
            edit={edit}
            onOpenNote={onOpenNote}
          />
        ))}
      </div>
    </div>
  )
}

function Cell({
  trackIdx, stepIdx, cell, isCurrent, isBeat, isBar, melodic, edit, onOpenNote,
}: {
  trackIdx: number
  stepIdx: number
  cell: Step
  isCurrent: boolean
  isBeat: boolean
  isBar: boolean
  melodic: boolean
  edit: EditKind
  onOpenNote: (step: number) => void
}) {
  const s = useStudio()
  const dragStart = useRef<{ y: number; v: number; moved: boolean } | null>(null)

  const updateStep = useCallback((f: (step: Step) => void) => {
    const pattern = findPattern(s.project, s.project.activePattern)
    const c = pattern.tracks[trackIdx]?.steps[stepIdx]
    if (!c) return
    f(c)
    // force a re-render without going through mutTrack (no audio-graph resync needed)
    s.setTrackMute(trackIdx, pattern.tracks[trackIdx].mute) // harmless no-op; bumps rev
  }, [s, trackIdx, stepIdx])

  const onPointerDown = (e: React.PointerEvent) => {
    ;(e.target as Element).setPointerCapture(e.pointerId)
    dragStart.current = { y: e.clientY, v: edit === 'vel' ? cell.vel : edit === 'prob' ? cell.prob : cell.gate, moved: false }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragStart.current
    if (!d) return
    const dy = d.y - e.clientY
    if (Math.abs(dy) > 4) d.moved = true
    if (edit === 'vel') {
      const next = Math.max(0, Math.min(7, Math.round(d.v + dy / 6)))
      updateStep((c) => { c.vel = next })
    } else if (edit === 'prob') {
      const next = Math.max(0, Math.min(100, Math.round(d.v + dy / 1.2)))
      updateStep((c) => { c.prob = next })
    } else {
      const next = Math.max(0, Math.min(16, Math.round(d.v + dy / 3)))
      updateStep((c) => { c.gate = next })
    }
  }
  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragStart.current
    dragStart.current = null
    try { (e.target as Element).releasePointerCapture(e.pointerId) } catch { /* */ }
    if (!d?.moved) s.toggleCell(trackIdx, stepIdx)
  }

  const onContextMenu = (e: React.MouseEvent) => {
    if (!melodic) return
    e.preventDefault()
    onOpenNote(stepIdx)
  }

  const velFrac = cell.on ? 0.25 + (cell.vel / 7) * 0.75 : 0
  const baseBg = isBar ? '#1c1c1c' : isBeat ? '#161616' : '#141414'
  const bg = cell.on
    ? `rgba(80,255,216,${velFrac.toFixed(2)})`
    : baseBg
  const borderColor = cell.on ? '#50ffd8' : (isBar ? '#3a3a3a' : isBeat ? '#2a2a2a' : '#202020')

  const gateBarWidth = cell.on ? Math.max(6, (cell.gate / 16) * 100) : 0
  const probDim = cell.prob < 100 ? 'opacity-60' : ''

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={onContextMenu}
      className={`relative cursor-ns-resize select-none touch-none aspect-square min-h-[18px] overflow-hidden rounded-[2px] text-[9px] ${probDim} ${isCurrent ? 'ring-1 ring-[#50ffd8]' : ''}`}
      style={{ background: bg, border: `1px solid ${borderColor}` }}
      title={`${edit} · vel ${cell.vel} · prob ${cell.prob}% · gate ${cell.gate}/16${melodic ? ` · ${noteName(cell.note)}` : ''}`}
    >
      {/* gate fill */}
      {cell.on && (
        <div
          className="absolute bottom-0 left-0 h-[2px] bg-[#50ffd8]"
          style={{ width: `${gateBarWidth}%`, opacity: 0.75 }}
        />
      )}
      {/* probability corner dot */}
      {cell.on && cell.prob < 100 && (
        <span className="absolute right-[1px] top-[1px] h-[4px] w-[4px] rounded-full bg-[#ffd26a]" />
      )}
      {/* note label for melodic */}
      {cell.on && melodic && (
        <span className="absolute inset-x-0 top-[1px] text-center text-[8px] leading-[1] text-[var(--color-bg)]">
          {noteName(cell.note)}
        </span>
      )}
    </div>
  )
}

function NotePopoverShell({ track, step, onClose }: { track: number; step: number; onClose: () => void }) {
  const s = useStudio()
  const pattern = findPattern(s.project, s.project.activePattern)
  const cell = pattern.tracks[track]?.steps[step]
  if (!cell) return null

  const setNote = (n: number) => {
    const c = pattern.tracks[track]?.steps[step]
    if (!c) return
    c.note = n
    s.setTrackMute(track, pattern.tracks[track].mute) // bump rev
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}>
        <NotePad note={cell.note} onChange={setNote} onClose={onClose} />
      </div>
    </div>
  )
}
