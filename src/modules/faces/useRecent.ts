import { useCallback, useEffect, useRef, useState } from 'react'

// ring-buffer of recently-copied kaomoji, backed by localStorage.
// most-recent first. de-duplicates — re-copying a face moves it to the front.

const STORAGE_KEY = 'pirte:faces:recent'
const MAX = 10

function load(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x): x is string => typeof x === 'string').slice(0, MAX)
  } catch {
    return []
  }
}

function save(items: readonly string[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)) } catch { /* ignore */ }
}

export type UseRecent = {
  /** most-recent first, capped at MAX. */
  items: readonly string[]
  /** push `face` to the front; de-duplicates. */
  remember: (face: string) => void
  /** wipe history. */
  clear: () => void
}

export function useRecent(): UseRecent {
  const [items, setItems] = useState<readonly string[]>([])
  // guard against writing before we've hydrated — prevents clobbering on first mount in strict-mode double-run
  const hydrated = useRef(false)

  useEffect(() => {
    setItems(load())
    hydrated.current = true
  }, [])

  const remember = useCallback((face: string) => {
    if (!face) return
    setItems((prev) => {
      const next = [face, ...prev.filter((x) => x !== face)].slice(0, MAX)
      if (hydrated.current) save(next)
      return next
    })
  }, [])

  const clear = useCallback(() => {
    setItems([])
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
  }, [])

  return { items, remember, clear }
}
