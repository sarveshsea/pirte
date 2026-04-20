const KEY = 'pirte:favs'

export function getFavs(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

export function setFavs(list: string[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { /* ignore */ }
}

export function toggleFav(path: string): string[] {
  const list = getFavs()
  const next = list.includes(path) ? list.filter((p) => p !== path) : [path, ...list]
  setFavs(next)
  return next
}

export function isFav(path: string): boolean {
  return getFavs().includes(path)
}
