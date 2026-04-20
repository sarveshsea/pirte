const KEY = 'pirte:session-start'

// localStorage throws in safari private mode and with blocked storage
// permissions. fall back to an in-memory session start so the clock
// still works, it just won't persist across reloads.
let memFallback: number | null = null

export function getSessionStart(): number {
  try {
    const existing = localStorage.getItem(KEY)
    if (existing) {
      const n = parseInt(existing, 10)
      if (Number.isFinite(n)) return n
    }
    const now = Date.now()
    localStorage.setItem(KEY, String(now))
    return now
  } catch {
    if (memFallback === null) memFallback = Date.now()
    return memFallback
  }
}

export function resetSession() {
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
  memFallback = null
}

export function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(sec)}`
}
