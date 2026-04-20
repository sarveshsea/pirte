// wikimedia recentchange event (subset we use). the upstream schema has more
// fields but these are the ones that survive json.parse cleanly and actually
// carry the signal we care about for a data-art feed.

export type WikiEventType = 'edit' | 'new' | 'log' | 'categorize' | 'external'

export type WikiEvent = {
  id?: number
  type?: WikiEventType
  namespace?: number
  title?: string
  comment?: string
  timestamp?: number   // seconds since epoch
  user?: string
  bot?: boolean
  server_name?: string
  wiki?: string        // e.g. 'enwiki', 'dewiki', 'wikidatawiki'
  length?: { old?: number; new?: number }
  meta?: { domain?: string; dt?: string }
}

// normalized display row — derived once per accepted event so render stays dumb
export type EditRow = {
  id: string
  ts: number           // ms epoch, normalized
  lang: string         // 2–3 letter code lifted from wiki id ('enwiki' → 'en')
  wiki: string
  user: string
  title: string
  bot: boolean
  kind: WikiEventType
  delta: number        // length.new - length.old (0 if missing)
}

export function normalize(ev: WikiEvent): EditRow | null {
  if (!ev.title || !ev.user || !ev.wiki) return null
  const kind = (ev.type ?? 'edit') as WikiEventType
  const ts = typeof ev.timestamp === 'number' ? ev.timestamp * 1000 : Date.now()
  const lang = ev.wiki.replace(/wiki$|wikidata.*$|commons.*$/, '') || ev.wiki
  const delta = (ev.length?.new ?? 0) - (ev.length?.old ?? 0)
  return {
    id: `${ev.wiki}-${ev.id ?? ts}`,
    ts,
    lang: lang.slice(0, 3),
    wiki: ev.wiki,
    user: ev.user,
    title: ev.title,
    bot: ev.bot === true,
    kind,
    delta,
  }
}
