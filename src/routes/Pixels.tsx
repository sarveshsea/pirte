import { useEffect, useRef, useState } from 'react'
import Tile from '../components/Tile'
import { buildPuzzle, type Puzzle } from '../modules/pixelFill'

const SIZE = 32
const COLORS = 8

export default function Pixels() {
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null)
  const [filled, setFilled] = useState<Uint8Array | null>(null)
  const [selected, setSelected] = useState(0)
  const [loading, setLoading] = useState(false)
  const [seed, setSeed] = useState(() => Math.random().toString(36).slice(2, 8))
  const idleTimer = useRef<number | null>(null)
  const autoTimer = useRef<number | null>(null)

  const load = async (s: string) => {
    setLoading(true)
    try {
      const p = await buildPuzzle(SIZE, COLORS, s)
      setPuzzle(p)
      setFilled(new Uint8Array(SIZE * SIZE))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(seed) /* eslint-disable-next-line */ }, [seed])

  const pct = puzzle && filled
    ? Math.round((Array.from(filled).filter((v) => v === 1).length / filled.length) * 100)
    : 0

  // idle auto-solve after 30s of no interaction
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
      copy[i] = 2 // wrong — briefly flashes
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

  const newImage = () => {
    resetIdle()
    setSeed(Math.random().toString(36).slice(2, 8))
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
      <Tile label="pixels · paint by number" code="05" footer={<span>{pct}% filled · select a color, click cells · idle 30s auto-solves</span>}>
        <div className="grid h-[72vh] place-items-center p-4">
          {loading && <span className="text-[11px] uppercase tracking-[0.2em] text-[var(--color-dim)]">loading image…</span>}
          {puzzle && filled && !loading && (
            <div
              className="grid aspect-square max-h-full max-w-full border border-[var(--color-line)]"
              style={{
                gridTemplateColumns: `repeat(${puzzle.size}, 1fr)`,
                gridTemplateRows: `repeat(${puzzle.size}, 1fr)`,
                width: 'min(72vh, 100%)',
                height: 'min(72vh, 100%)',
              }}
            >
              {Array.from({ length: puzzle.size * puzzle.size }).map((_, i) => {
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
        </div>
      </Tile>

      <div className="flex flex-col gap-6">
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
          <div className="flex flex-col gap-2 p-3 text-[11px] uppercase tracking-[0.12em]">
            <button data-interactive onClick={newImage}>new image</button>
            <button data-interactive onClick={() => puzzle && setFilled(new Uint8Array(puzzle.size * puzzle.size))}>reset</button>
            <button data-interactive onClick={() => puzzle && setFilled(new Uint8Array(puzzle.cells.map(() => 1)))}>solve</button>
          </div>
        </Tile>

        <Tile label="info">
          <div className="flex flex-col gap-1 p-3 text-[11px] text-[var(--color-dim)]">
            <span>size · {SIZE}×{SIZE}</span>
            <span>colors · {COLORS}</span>
            <span>seed · <span className="text-[var(--color-fg)]">{seed}</span></span>
            <span>progress · <span className="text-[var(--color-fg)]">{pct}%</span></span>
          </div>
        </Tile>
      </div>
    </div>
  )
}
