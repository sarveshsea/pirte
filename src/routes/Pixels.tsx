import { useCallback, useEffect, useRef, useState } from 'react'
import Tile from '../components/Tile'
import Slider from '../components/Slider'
import {
  buildFromFile, buildFromSeed, buildFromUrl,
  type Puzzle, type PuzzleSource,
} from '../modules/pixelFill'

const DEFAULT_SIZE = 32
const DEFAULT_COLORS = 8

export default function Pixels() {
  const [size, setSize]       = useState(DEFAULT_SIZE)
  const [colors, setColors]   = useState(DEFAULT_COLORS)
  const [puzzle, setPuzzle]   = useState<Puzzle | null>(null)
  const [filled, setFilled]   = useState<Uint8Array | null>(null)
  const [selected, setSelected] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [urlInput, setUrlInput] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const idleTimer = useRef<number | null>(null)
  const autoTimer = useRef<number | null>(null)

  const applyPuzzle = (p: Puzzle) => {
    setPuzzle(p)
    setFilled(new Uint8Array(p.size * p.size))
    setSelected(0)
    setError(null)
  }

  const runBuild = useCallback(async (builder: () => Promise<Puzzle>) => {
    setLoading(true)
    setError(null)
    try {
      const p = await builder()
      applyPuzzle(p)
    } catch (e) {
      setError((e as Error)?.message ?? 'failed to process image')
    } finally {
      setLoading(false)
    }
  }, [])

  // initial image
  useEffect(() => {
    const seed = Math.random().toString(36).slice(2, 8)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    runBuild(() => buildFromSeed(size, colors, seed))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pct = puzzle && filled
    ? Math.round((Array.from(filled).filter((v) => v === 1).length / filled.length) * 100)
    : 0

  const resetIdle = () => {
    if (idleTimer.current) clearTimeout(idleTimer.current)
    if (autoTimer.current) clearInterval(autoTimer.current)
    idleTimer.current = window.setTimeout(() => {
      autoTimer.current = window.setInterval(() => {
        if (!puzzle || !filled) return
        const unfilled: number[] = []
        for (let i = 0; i < filled.length; i++) if (filled[i] === 0) unfilled.push(i)
        if (unfilled.length === 0) { if (autoTimer.current) clearInterval(autoTimer.current); return }
        const next = unfilled[Math.floor(Math.random() * unfilled.length)]
        const copy = new Uint8Array(filled)
        copy[next] = 1
        setFilled(copy)
      }, 40)
    }, 30000)
  }

  useEffect(() => {
    resetIdle()
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current)
      if (autoTimer.current) clearInterval(autoTimer.current)
    }
    /* eslint-disable-next-line */
  }, [puzzle, filled])

  const onCell = (i: number) => {
    if (!puzzle || !filled) return
    resetIdle()
    if (filled[i] === 1) return
    if (puzzle.cells[i] === selected) {
      const copy = new Uint8Array(filled)
      copy[i] = 1
      setFilled(copy)
    } else {
      const copy = new Uint8Array(filled)
      copy[i] = 2
      setFilled(copy)
      setTimeout(() => {
        setFilled((prev) => {
          if (!prev) return prev
          const n = new Uint8Array(prev)
          if (n[i] === 2) n[i] = 0
          return n
        })
      }, 260)
    }
  }

  const onFile = (file: File | null | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('not an image'); return }
    runBuild(() => buildFromFile(file, size, colors))
  }

  const onSurpriseMe = () => {
    const seed = Math.random().toString(36).slice(2, 8)
    runBuild(() => buildFromSeed(size, colors, seed))
  }

  const onLoadUrl = () => {
    const u = urlInput.trim()
    if (!u) return
    runBuild(() => buildFromUrl(u, size, colors))
  }

  // reprocess the current source whenever size/colors change
  const rebuildCurrent = () => {
    if (!puzzle) return
    const src = puzzle.source
    if (src.kind === 'random')      runBuild(() => buildFromSeed(size, colors, src.seed))
    else if (src.kind === 'url')    runBuild(() => buildFromUrl(src.url, size, colors))
    // uploaded files can't be re-read without stashing the image; offer surprise instead
  }

  const sourceLabel = (s: PuzzleSource | undefined) =>
    !s ? '—' :
    s.kind === 'upload' ? `upload · ${s.name}` :
    s.kind === 'url'    ? `url · ${truncate(s.url, 32)}` :
                          `random · ${s.seed}`

  const sizeDim = puzzle?.size ?? size

  return (
    <div
      className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]"
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setIsDragging(false)
        onFile(e.dataTransfer?.files?.[0])
      }}
    >
      <Tile
        label="pixels · paint by number"
        code="05"
        footer={
          <div className="flex items-center justify-between">
            <span>{pct}% filled · {sourceLabel(puzzle?.source)}</span>
            <span>click cells · idle 30s auto-solves · drop an image anywhere</span>
          </div>
        }
      >
        <div className="relative grid h-[72vh] place-items-center p-4">
          {loading && <span className="text-[11px] tracking-[0.1em] text-[var(--color-dim)]">processing image…</span>}
          {error && !loading && <span className="text-[11px] tracking-[0.1em] text-[#ff7a7a]">{error}</span>}
          {puzzle && filled && !loading && (
            <div
              className="grid aspect-square max-h-full max-w-full border border-[var(--color-line)]"
              style={{
                gridTemplateColumns: `repeat(${sizeDim}, 1fr)`,
                gridTemplateRows: `repeat(${sizeDim}, 1fr)`,
                width: 'min(72vh, 100%)',
                height: 'min(72vh, 100%)',
              }}
            >
              {Array.from({ length: sizeDim * sizeDim }).map((_, i) => {
                const n = puzzle.cells[i]
                const st = filled[i]
                const rgb = puzzle.palette[n]
                const bg = st === 1 ? `rgb(${rgb[0]},${rgb[1]},${rgb[2]})` : st === 2 ? '#662222' : 'transparent'
                return (
                  <button
                    key={i}
                    data-interactive
                    onClick={() => onCell(i)}
                    className="flex items-center justify-center !border-[0.5px] !border-[var(--color-line)] !p-0 text-[8px] text-[var(--color-dim)] hover:!border-[var(--color-fg)]"
                    style={{ background: bg, color: st === 1 ? 'transparent' : undefined }}
                  >
                    {st !== 1 && n}
                  </button>
                )
              })}
            </div>
          )}
          {isDragging && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center border-2 border-dashed border-[var(--color-fg)] bg-[var(--color-bg)]/60 text-[12px] tracking-[0.1em] text-[var(--color-fg)]">
              drop to process
            </div>
          )}
        </div>
      </Tile>

      <div className="flex flex-col gap-6">
        <Tile label="image source">
          <div className="flex flex-col gap-2 p-3 text-[11px] tracking-[0.06em]">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
            <button data-interactive onClick={() => fileInputRef.current?.click()}>
              upload image
            </button>
            <div className="flex gap-1">
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') onLoadUrl() }}
                placeholder="paste image url"
                className="min-w-0 flex-1 border border-[var(--color-line)] bg-transparent px-2 py-1 text-[11px] text-[var(--color-fg)] placeholder:text-[var(--color-dim)] focus:border-[var(--color-fg)] focus:outline-none"
              />
              <button data-interactive onClick={onLoadUrl}>load</button>
            </div>
            <button data-interactive onClick={onSurpriseMe}>surprise me</button>
          </div>
        </Tile>

        <Tile label="pixelation">
          <div className="flex flex-col gap-3 p-3">
            <Slider label="size"   min={16} max={64} step={4} value={size}   onChange={setSize}   format={(v) => `${v}×${v}`} />
            <Slider label="colors" min={4}  max={16} step={1} value={colors} onChange={setColors} format={(v) => `${v}`} />
            <button
              data-interactive
              onClick={rebuildCurrent}
              disabled={!puzzle || puzzle.source.kind === 'upload'}
              className="text-[11px] tracking-[0.06em] disabled:opacity-40"
            >
              reprocess
            </button>
            <span className="text-[10px] text-[var(--color-dim)]">
              reprocess works for random and url sources. for uploads, re-upload to apply new settings.
            </span>
          </div>
        </Tile>

        <Tile label="palette">
          <div className="grid grid-cols-4 gap-2 p-3">
            {puzzle?.palette.map((rgb, i) => (
              <button
                key={i}
                data-interactive
                onClick={() => setSelected(i)}
                className={`flex aspect-square items-center justify-center !border ${i === selected ? '!border-[var(--color-fg)]' : '!border-[var(--color-line)]'} text-[11px] !p-0`}
                style={{ background: `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`, color: (rgb[0] + rgb[1] + rgb[2]) / 3 > 140 ? '#000' : '#fff' }}
              >
                {i}
              </button>
            ))}
          </div>
        </Tile>

        <Tile label="actions">
          <div className="flex flex-col gap-2 p-3 text-[11px] tracking-[0.06em]">
            <button data-interactive onClick={() => puzzle && setFilled(new Uint8Array(puzzle.size * puzzle.size))}>reset fills</button>
            <button data-interactive onClick={() => puzzle && setFilled(new Uint8Array(puzzle.cells.map(() => 1)))}>solve</button>
          </div>
        </Tile>

        {puzzle?.thumbUrl && (
          <Tile label="preview">
            <div className="p-3">
              <img
                src={puzzle.thumbUrl}
                alt="quantized preview"
                className="block w-full border border-[var(--color-line)]"
                style={{ imageRendering: 'pixelated' }}
              />
              <span className="mt-2 block text-[10px] text-[var(--color-dim)]">
                {puzzle.size}×{puzzle.size} · {puzzle.palette.length} colors · {pct}% filled
              </span>
            </div>
          </Tile>
        )}
      </div>
    </div>
  )
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…'
}
