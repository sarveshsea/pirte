/*
 * radio-browser.info client
 *
 * - no api key, no quota (rate-limited by server though)
 * - dns-rotated mirrors; we pick the first reachable one and cache it
 * - we ask for https, geo-tagged, not-broken stations so the browser can
 *   actually play them and we can put them on a map
 * - see https://docs.radio-browser.info/
 */

export type Station = {
  id: string            // stationuuid
  name: string          // lowercased
  url: string           // url_resolved if present, else url (playable)
  homepage: string
  country: string       // lowercased
  countrycode: string   // iso-3166 alpha-2, lowercased
  language: string      // lowercased
  tags: string[]        // lowercased, comma-split
  codec: string         // e.g. 'MP3', 'AAC'
  bitrate: number       // kbps
  hls: boolean
  lat: number
  lon: number
  votes: number
  clickcount: number
}

export type CountryEntry = { name: string; iso_3166_1: string; stationcount: number }
export type TagEntry = { name: string; stationcount: number }

// known mirrors — listed in docs. we try them in order and cache the winner.
const MIRRORS = [
  'https://de1.api.radio-browser.info',
  'https://de2.api.radio-browser.info',
  'https://at1.api.radio-browser.info',
  'https://fi1.api.radio-browser.info',
  'https://nl1.api.radio-browser.info',
]

let cachedMirror: string | null = null
let mirrorPromise: Promise<string> | null = null

export function pickMirror(): Promise<string> {
  if (cachedMirror) return Promise.resolve(cachedMirror)
  if (mirrorPromise) return mirrorPromise
  mirrorPromise = (async () => {
    for (const m of MIRRORS) {
      try {
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), 2000)
        const r = await fetch(`${m}/json/stats`, { signal: ctrl.signal })
        clearTimeout(timer)
        if (r.ok) { cachedMirror = m; return m }
      } catch { /* try next */ }
    }
    throw new Error('radio-browser: no reachable mirror')
  })()
  mirrorPromise.catch(() => { mirrorPromise = null })
  return mirrorPromise
}

type RawStation = {
  stationuuid: string
  name: string
  url: string
  url_resolved?: string
  homepage?: string
  country?: string
  countrycode?: string
  state?: string
  language?: string
  tags?: string
  codec?: string
  bitrate?: number
  hls?: number
  geo_lat?: number | null
  geo_long?: number | null
  votes?: number
  clickcount?: number
  lastcheckok?: number
}

function toStation(r: RawStation): Station | null {
  const url = (r.url_resolved && r.url_resolved.trim()) || r.url
  if (!url || !url.startsWith('https://')) return null
  if (r.geo_lat == null || r.geo_long == null) return null
  if (!Number.isFinite(r.geo_lat) || !Number.isFinite(r.geo_long)) return null
  return {
    id: r.stationuuid,
    name: (r.name || '').toLowerCase().trim(),
    url,
    homepage: r.homepage || '',
    country: (r.country || '').toLowerCase(),
    countrycode: (r.countrycode || '').toLowerCase(),
    language: (r.language || '').toLowerCase(),
    tags: (r.tags || '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean),
    codec: (r.codec || '').toUpperCase(),
    bitrate: r.bitrate || 0,
    hls: r.hls === 1,
    lat: r.geo_lat as number,
    lon: r.geo_long as number,
    votes: r.votes || 0,
    clickcount: r.clickcount || 0,
  }
}

export type FetchOpts = {
  limit?: number
  country?: string        // country name ('germany')
  countrycode?: string    // iso 2-letter ('de')
  tag?: string            // genre ('jazz')
  order?: 'clickcount' | 'votes' | 'name' | 'random'
}

export async function fetchStations(opts: FetchOpts = {}): Promise<Station[]> {
  const base = await pickMirror()
  const params = new URLSearchParams()
  params.set('limit', String(opts.limit ?? 500))
  params.set('hidebroken', 'true')
  params.set('has_geo_info', 'true')
  params.set('is_https', 'true')
  params.set('order', opts.order ?? 'clickcount')
  if (opts.order !== 'random') params.set('reverse', 'true')
  if (opts.country) params.set('country', opts.country)
  if (opts.countrycode) params.set('countrycode', opts.countrycode)
  if (opts.tag) params.set('tag', opts.tag)
  const r = await fetch(`${base}/json/stations/search?${params}`)
  if (!r.ok) throw new Error(`stations: http ${r.status}`)
  const raw: RawStation[] = await r.json()
  const out: Station[] = []
  const seen = new Set<string>()
  for (const row of raw) {
    const s = toStation(row)
    if (!s) continue
    if (seen.has(s.id)) continue
    // skip hls — native <audio> won't play it in chrome/firefox
    if (s.hls) continue
    seen.add(s.id)
    out.push(s)
  }
  return out
}

export async function fetchTopCountries(limit = 30): Promise<CountryEntry[]> {
  const base = await pickMirror()
  const r = await fetch(`${base}/json/countries?order=stationcount&reverse=true&hidebroken=true&limit=${limit}`)
  if (!r.ok) throw new Error(`countries: http ${r.status}`)
  const raw: Array<{ name: string; iso_3166_1?: string; stationcount: number }> = await r.json()
  return raw
    .filter((c) => c.name && c.stationcount > 0)
    .map((c) => ({ name: c.name.toLowerCase(), iso_3166_1: (c.iso_3166_1 || '').toLowerCase(), stationcount: c.stationcount }))
}

export async function fetchTopTags(limit = 40): Promise<TagEntry[]> {
  const base = await pickMirror()
  const r = await fetch(`${base}/json/tags?order=stationcount&reverse=true&hidebroken=true&limit=${limit}`)
  if (!r.ok) throw new Error(`tags: http ${r.status}`)
  const raw: Array<{ name: string; stationcount: number }> = await r.json()
  return raw
    .filter((t) => t.name && t.stationcount > 20)
    .map((t) => ({ name: t.name.toLowerCase(), stationcount: t.stationcount }))
}

// best-effort click registration (the api uses it to rank popularity)
export async function registerClick(uuid: string): Promise<void> {
  try {
    const base = await pickMirror()
    await fetch(`${base}/json/url/${uuid}`)
  } catch { /* ignore */ }
}
