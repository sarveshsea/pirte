import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { KAOMOJI } from '../data/kaomoji'
import CopyToast from '../modules/faces/CopyToast'
import EmptyState from '../modules/faces/EmptyState'
import FaceTile from '../modules/faces/FaceTile'
import RecentRow from '../modules/faces/RecentRow'
import SearchBar, { type SearchBarHandle } from '../modules/faces/SearchBar'
import { useCopy } from '../modules/faces/useCopy'
import { useRecent } from '../modules/faces/useRecent'

/* faces — kaomoji gallery. orchestration only.
   components under src/modules/faces/; data in src/data/kaomoji.ts. */

// ----- filter -----

function matchesQuery(face: string, tags: readonly string[], q: string): boolean {
  if (!q) return true
  if (face.toLowerCase().includes(q)) return true
  return tags.some((t) => t.includes(q))
}

// ----- adaptive spanning so wide kaomoji don't silently truncate -----
// measured in unicode code points (not char count — emoji are 2, combining
// marks skew, Array.from gives the right answer).
const LONG_CODE_POINTS = 14
const VERY_LONG_CODE_POINTS = 24

function spanFor(face: string): string {
  const n = Array.from(face).length
  if (n >= VERY_LONG_CODE_POINTS) return 'col-span-2 sm:col-span-3'
  if (n >= LONG_CODE_POINTS) return 'col-span-2'
  return ''
}

export default function Faces() {
  const [query, setQuery] = useState('')
  const { copy, lastCopied } = useCopy()
  const { items: recent, remember, clear: clearRecent } = useRecent()
  const searchRef = useRef<SearchBarHandle>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return KAOMOJI
    return KAOMOJI.filter((k) => matchesQuery(k.face.toLowerCase(), k.tags, q))
  }, [query])

  const handleCopy = useCallback((face: string) => {
    void copy(face).then((ok) => { if (ok) remember(face) })
  }, [copy, remember])

  const copyFirst = useCallback(() => {
    if (filtered.length === 0) return
    handleCopy(filtered[0].face)
    setQuery('')
  }, [filtered, handleCopy])

  // global keys (outside inputs)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inInput =
        e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (!inInput && e.key === '/') {
        e.preventDefault()
        searchRef.current?.focus()
        return
      }
      if (!inInput && (e.key === 'r' || e.key === 'R')) {
        if (filtered.length === 0) return
        const pick = filtered[Math.floor(Math.random() * filtered.length)]
        handleCopy(pick.face)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [filtered, handleCopy])

  return (
    <div className="relative flex h-[min(calc(100vh-9rem),calc(100dvh-14rem))] w-full flex-col overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)]">
      <SearchBar
        ref={searchRef}
        value={query}
        onChange={setQuery}
        onEnter={copyFirst}
        count={filtered.length}
        total={KAOMOJI.length}
      />

      <RecentRow
        faces={recent}
        copiedFace={lastCopied}
        onCopy={handleCopy}
        onClear={clearRecent}
      />

      <main
        className="flex-1 overflow-y-auto p-3"
        role="region"
        aria-label="kaomoji gallery"
      >
        {filtered.length === 0 ? (
          <EmptyState query={query} />
        ) : (
          <div
            className="grid grid-flow-row-dense grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2"
            role="list"
          >
            {filtered.map((k) => (
              <FaceTile
                key={k.face}
                face={k.face}
                tags={k.tags}
                copied={lastCopied === k.face}
                spanClass={spanFor(k.face)}
                onCopy={handleCopy}
              />
            ))}
          </div>
        )}
      </main>

      <footer className="border-t border-[var(--color-line)] bg-[var(--color-bg)]/60 px-4 py-1.5 text-center text-[10px] tracking-[0.1em] text-[var(--color-dim)] backdrop-blur-sm">
        click to copy · / focus search · enter copy first · r random · esc clear
      </footer>

      <CopyToast face={lastCopied} />
    </div>
  )
}
