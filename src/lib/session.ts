const KEY = 'pirte:session-start'

export function getSessionStart(): number {
  const existing = localStorage.getItem(KEY)
  if (existing) return parseInt(existing, 10)
  const now = Date.now()
  localStorage.setItem(KEY, String(now))
  return now
}

export function resetSession() {
  localStorage.removeItem(KEY)
}

export function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(sec)}`
}
