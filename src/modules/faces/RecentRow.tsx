import { useMemo } from 'react'
import { KAOMOJI } from '../../data/kaomoji'
import FaceTile from './FaceTile'

type Props = {
  /** most-recent first. */
  faces: readonly string[]
  copiedFace: string | null
  onCopy: (face: string) => void
  onClear: () => void
}

// builds { face → tags } once per KAOMOJI change (which is never at runtime).
// recent entries may reference faces not in the current dataset (e.g. after a
// content update); those still copy fine, they just carry no tags.
const TAGS_BY_FACE = new Map<string, readonly string[]>(KAOMOJI.map((k) => [k.face, k.tags]))

export default function RecentRow({ faces, copiedFace, onCopy, onClear }: Props) {
  const enriched = useMemo(
    () => faces.map((f) => ({ face: f, tags: TAGS_BY_FACE.get(f) ?? [] })),
    [faces],
  )
  if (enriched.length === 0) return null

  return (
    <section
      aria-label="recent copies"
      className="border-b border-[var(--color-line)] bg-[var(--color-bg)]/30 px-3 py-2"
    >
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="text-[10px] tracking-[0.2em] text-[var(--color-dim)]">recent</span>
        <button
          type="button"
          onClick={onClear}
          title="clear recent"
          className="rounded-full px-1.5 text-[10px] tracking-[0.1em] text-[var(--color-dim)] hover:bg-[var(--color-line)]/40 hover:text-[var(--color-fg)]"
        >clear</button>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {enriched.map((k) => (
          <div key={k.face} className="w-28 shrink-0">
            <FaceTile
              face={k.face}
              tags={k.tags}
              copied={copiedFace === k.face}
              size="sm"
              onCopy={onCopy}
            />
          </div>
        ))}
      </div>
    </section>
  )
}
