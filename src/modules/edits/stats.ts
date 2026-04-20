// rolling 60-second window of accepted edits. bounded memory — trims on every
// add + read so the buffer can't grow past roughly (rate × window) events.

export type StatEntry = { ts: number; wiki: string; lang: string; bot: boolean }

export type StatsSnapshot = {
  editsPerSec: number            // rate over last 10s
  editsLastMin: number           // total in last 60s
  botRatio: number               // 0..1 over last 60s
  topWikis: { wiki: string; count: number }[]
  topLangs: { lang: string; count: number }[]
  // 60 buckets of 1s each, oldest-first — index 59 is the last second
  sparkline: number[]
}

const WINDOW_MS = 60_000
const EPS = 0

export class EditStats {
  private buf: StatEntry[] = []

  add(e: StatEntry) {
    this.buf.push(e)
    this.trim()
  }

  private trim() {
    const cutoff = Date.now() - WINDOW_MS
    // amortized O(1) — chop from the front until the head is inside the window
    let i = 0
    while (i < this.buf.length && this.buf[i].ts < cutoff) i++
    if (i > 0) this.buf.splice(0, i)
  }

  snapshot(): StatsSnapshot {
    this.trim()
    const now = Date.now()
    const buf = this.buf
    const n = buf.length

    // 10s rate
    const rateCutoff = now - 10_000
    let recent = 0
    for (let k = 0; k < n; k++) if (buf[k].ts >= rateCutoff) recent++
    const editsPerSec = recent / 10

    // bot ratio over full window
    let bots = 0
    for (let k = 0; k < n; k++) if (buf[k].bot) bots++
    const botRatio = n === 0 ? 0 : bots / n

    // counts by wiki + lang
    const wikiCounts = new Map<string, number>()
    const langCounts = new Map<string, number>()
    for (let k = 0; k < n; k++) {
      const e = buf[k]
      wikiCounts.set(e.wiki, (wikiCounts.get(e.wiki) ?? 0) + 1)
      langCounts.set(e.lang, (langCounts.get(e.lang) ?? 0) + 1)
    }
    const topWikis = Array.from(wikiCounts.entries())
      .sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([wiki, count]) => ({ wiki, count }))
    const topLangs = Array.from(langCounts.entries())
      .sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([lang, count]) => ({ lang, count }))

    // sparkline — 60 bins of 1s
    const bins = new Array<number>(60).fill(0)
    for (let k = 0; k < n; k++) {
      const age = now - buf[k].ts
      const binIdx = 59 - Math.floor(age / 1000)
      if (binIdx >= 0 && binIdx < 60) bins[binIdx]++
    }

    return { editsPerSec, editsLastMin: n + EPS, botRatio, topWikis, topLangs, sparkline: bins }
  }
}

// unicode block characters for ascii sparkline rendering
const BLOCKS = [' ', '▁', '▂', '▃', '▄', '▅', '▆', '▇', '█']
export function renderSparkline(values: number[]): string {
  if (values.length === 0) return ''
  let max = 0
  for (const v of values) if (v > max) max = v
  if (max === 0) return ' '.repeat(values.length)
  const out = new Array<string>(values.length)
  for (let i = 0; i < values.length; i++) {
    const t = values[i] / max
    const idx = Math.min(BLOCKS.length - 1, Math.max(0, Math.round(t * (BLOCKS.length - 1))))
    out[i] = BLOCKS[idx]
  }
  return out.join('')
}
