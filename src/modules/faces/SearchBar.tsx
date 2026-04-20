import { forwardRef, useImperativeHandle, useRef } from 'react'

export type SearchBarHandle = {
  focus(): void
}

type Props = {
  value: string
  onChange: (v: string) => void
  /** fired when enter pressed with a non-empty filter result. */
  onEnter: () => void
  count: number
  total: number
  placeholder?: string
}

const SearchBar = forwardRef<SearchBarHandle, Props>(function SearchBar(
  { value, onChange, onEnter, count, total, placeholder },
  ref,
) {
  const inputRef = useRef<HTMLInputElement>(null)

  useImperativeHandle(ref, () => ({
    focus() {
      inputRef.current?.focus()
      inputRef.current?.select()
    },
  }), [])

  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--color-line)] bg-[var(--color-bg)]/80 px-4 py-3 backdrop-blur-md">
      <div className="relative flex-1">
        <input
          ref={inputRef}
          type="text"
          role="searchbox"
          aria-label="search kaomoji"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              onEnter()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              onChange('')
              inputRef.current?.blur()
            }
          }}
          placeholder={placeholder ?? 'search — bear · flip · happy · cry · cat · love…'}
          className="w-full rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-1.5 pr-16 text-[13px] text-[var(--color-fg)] outline-none transition-colors focus:border-[var(--color-fg)]"
          autoFocus
        />
        {value && (
          <button
            type="button"
            onClick={() => { onChange(''); inputRef.current?.focus() }}
            title="clear · esc"
            aria-label="clear search"
            className="absolute right-9 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-full text-[12px] text-[var(--color-dim)] hover:bg-[var(--color-line)]/50 hover:text-[var(--color-fg)]"
          >×</button>
        )}
        <span
          aria-hidden
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-[var(--color-line)] bg-[var(--color-bg)] px-1.5 text-[10px] text-[var(--color-dim)]"
        >/</span>
      </div>
      <span
        className="shrink-0 tabular-nums text-[11px] tracking-[0.1em] text-[var(--color-dim)]"
        aria-live="polite"
        aria-atomic="true"
      >
        {count} / {total}
      </span>
    </header>
  )
})

export default SearchBar
