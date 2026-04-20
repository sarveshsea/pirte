import { useEffect, useMemo, useRef, useState } from 'react'
import { KAOMOJI } from '../data/kaomoji'

/* faces — click any to copy. type to search; tags are matched too so
   "bear", "flip", "happy", "cry" all surface the right subset. */

export default function Faces() {
  const [query, setQuery] = useState('')
  const [copied, setCopied] = useState<string | null>(null)
  const copyTimer = useRef<number | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return KAOMOJI
    return KAOMOJI.filter((k) => {
      if (k.face.toLowerCase().includes(q)) return true
      return k.tags.some((t) => t.includes(q))
    })
  }, [query])

  const copy = async (face: string) => {
    try {
      await navigator.clipboard.writeText(face)
    } catch {
      // fallback: temp textarea (for environments without clipboard permission)
      const ta = document.createElement('textarea')
      ta.value = face
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy') } catch { /* ignore */ }
      document.body.removeChild(ta)
    }
    setCopied(face)
    if (copyTimer.current) clearTimeout(copyTimer.current)
    copyTimer.current = window.setTimeout(() => setCopied(null), 900)
  }

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (!inInput && e.key === '/') {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
        return
      }
      if (e.key === 'Escape' && inInput) {
        setQuery('')
        searchRef.current?.blur()
        return
      }
      if (!inInput && (e.key === 'r' || e.key === 'R')) {
        if (filtered.length === 0) return
        const pick = filtered[Math.floor(Math.random() * filtered.length)]
        copy(pick.face)
        return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [filtered])

  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (filtered.length > 0) {
        copy(filtered[0].face)
        setQuery('')
        searchRef.current?.blur()
      }
    }
  }

  return (
    <div className="relative flex h-[calc(100vh-9rem)] w-full flex-col overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)]">
      {/* sticky top bar */}
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--color-line)] bg-[var(--color-bg)]/80 px-4 py-3 backdrop-blur-md">
        <div className="relative flex-1">
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKey}
            placeholder="search — happy · bear · flip · love · sad…"
            className="w-full rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-1.5 pr-16 text-[13px] text-[var(--color-fg)] outline-none focus:border-[var(--color-fg)]"
            autoFocus
          />
          {query && (
            <button
              onClick={() => { setQuery(''); searchRef.current?.focus() }}
              className="absolute right-9 top-1/2 -translate-y-1/2 rounded-full px-1.5 text-[12px] text-[var(--color-dim)] hover:text-[var(--color-fg)]"
              title="clear · esc"
            >×</button>
          )}
          <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-[var(--color-line)] bg-[var(--color-bg)] px-1.5 text-[10px] text-[var(--color-dim)]">
            /
          </span>
        </div>
        <span className="shrink-0 tabular-nums text-[11px] tracking-[0.1em] text-[var(--color-dim)]">
          {filtered.length} / {KAOMOJI.length}
        </span>
      </header>

      {/* grid */}
      <div className="flex-1 overflow-y-auto p-3">
        {filtered.length === 0 ? (
          <div className="grid h-full place-items-center text-[13px] text-[var(--color-dim)]">
            no matches for "{query}" · try bear, flip, happy, cry, cat…
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
            {filtered.map((k) => {
              const isCopied = copied === k.face
              return (
                <button
                  key={k.face}
                  onClick={() => copy(k.face)}
                  title={`copy · ${k.tags.join(' · ')}`}
                  className={`group flex h-20 items-center justify-center overflow-hidden rounded-md border px-2 transition-all ${
                    isCopied
                      ? 'scale-[1.03] border-[var(--color-fg)] bg-[var(--color-fg)]/10'
                      : 'border-[var(--color-line)] hover:scale-[1.02] hover:border-[var(--color-dim)] hover:bg-[var(--color-bg)]'
                  }`}
                  style={{ fontFamily: 'system-ui, -apple-system, "Segoe UI", "Hiragino Sans", "Yu Gothic", sans-serif' }}
                >
                  <span className="truncate text-[15px] leading-none text-[var(--color-fg)]">
                    {k.face}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* bottom hint strip */}
      <div className="border-t border-[var(--color-line)] bg-[var(--color-bg)]/60 px-4 py-1.5 text-center text-[10px] tracking-[0.1em] text-[var(--color-dim)] backdrop-blur-sm">
        click to copy · / focus search · enter copy first · r random · esc clear
      </div>

      {/* copied toast */}
      {copied && (
        <div
          className="pointer-events-none absolute bottom-12 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/85 px-4 py-2 text-[12px] text-white shadow-xl ring-1 ring-white/10 backdrop-blur-md"
          style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
        >
          copied · <span className="font-bold">{copied}</span>
        </div>
      )}
    </div>
  )
}
