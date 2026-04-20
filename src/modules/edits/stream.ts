import { normalize, type EditRow, type WikiEvent } from './types'

// server-sent events firehose of every wikipedia/wikidata/commons edit
// happening globally, right now. no key. public. ~30–100 events/sec.
const STREAM_URL = 'https://stream.wikimedia.org/v2/stream/recentchange'

export type StreamStatus = 'connecting' | 'live' | 'error'

export type StreamHandle = { close: () => void }

type Callbacks = {
  onRow: (row: EditRow) => void
  onStatus: (status: StreamStatus) => void
}

// exponential backoff with a ceiling — wikimedia's stream is reliable but
// consumer network blips (sleeping laptop, vpn switch) happen.
export function subscribeWikiStream({ onRow, onStatus }: Callbacks): StreamHandle {
  let es: EventSource | null = null
  let retry = 0
  let retryTimer: number | null = null
  let closed = false

  const connect = () => {
    if (closed) return
    onStatus('connecting')
    try {
      es = new EventSource(STREAM_URL)
    } catch {
      onStatus('error')
      scheduleRetry()
      return
    }
    es.onopen = () => { retry = 0; onStatus('live') }
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as WikiEvent
        const row = normalize(data)
        if (row) onRow(row)
      } catch {
        /* malformed payload — drop silently, the stream emits millions/day */
      }
    }
    es.onerror = () => {
      if (closed) return
      onStatus('error')
      try { es?.close() } catch { /* ignore */ }
      es = null
      scheduleRetry()
    }
  }

  const scheduleRetry = () => {
    retry = Math.min(retry + 1, 6)
    const delay = 500 * Math.pow(2, retry)   // 1s → 2s → 4s → … → 32s
    retryTimer = window.setTimeout(connect, delay)
  }

  connect()

  return {
    close: () => {
      closed = true
      if (retryTimer !== null) { clearTimeout(retryTimer); retryTimer = null }
      try { es?.close() } catch { /* ignore */ }
      es = null
    },
  }
}
