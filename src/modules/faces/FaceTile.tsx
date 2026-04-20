import { memo } from 'react'

// shared system font stack. kaomoji rely on proportional-width unicode
// punctuation; forcing a monospace face (like pirte's jetbrains mono) breaks
// the artistic balance.
export const KAOMOJI_FONT =
  'system-ui, -apple-system, "Segoe UI", "Hiragino Sans", "Yu Gothic", sans-serif'

type Props = {
  face: string
  tags: readonly string[]
  copied?: boolean
  /** sm = recent row, md = main grid. */
  size?: 'sm' | 'md'
  /** optional tailwind class like `col-span-2` for extra-wide faces. */
  spanClass?: string
  onCopy: (face: string) => void
}

function FaceTileImpl({ face, tags, copied, size = 'md', spanClass, onCopy }: Props) {
  const h = size === 'sm' ? 'h-12' : 'h-20'
  const fs = size === 'sm' ? 'text-[13px]' : 'text-[15px]'
  const ariaTagsText = tags.length ? `, tagged ${tags.join(', ')}` : ''

  return (
    <button
      type="button"
      onClick={() => onCopy(face)}
      title={`copy · ${face}${tags.length ? `  ·  ${tags.join(' · ')}` : ''}`}
      aria-label={`copy ${face}${ariaTagsText}`}
      className={[
        'group relative flex items-center justify-center overflow-hidden rounded-md border px-2 outline-none',
        'transition-all duration-150',
        'focus-visible:ring-2 focus-visible:ring-[var(--color-fg)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-bg)]',
        h,
        copied
          ? 'scale-[1.04] border-[var(--color-fg)] bg-[var(--color-fg)]/10'
          : 'border-[var(--color-line)] hover:scale-[1.02] hover:border-[var(--color-dim)] hover:bg-[var(--color-bg)]',
        spanClass ?? '',
      ].join(' ')}
      style={{ fontFamily: KAOMOJI_FONT }}
    >
      <span className={`truncate ${fs} leading-none text-[var(--color-fg)]`}>
        {face}
      </span>
      {copied && (
        <span
          aria-hidden
          className="pointer-events-none absolute right-1.5 top-1.5 text-[9px] tracking-[0.1em] text-[var(--color-fg)]/80"
        >
          copied
        </span>
      )}
    </button>
  )
}

// tiles rarely change — memo prevents re-render of the whole grid when one tile's copied state flips.
export default memo(FaceTileImpl)
