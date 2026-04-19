import { useEffect, useRef, useState } from 'react'
import Tile from '../components/Tile'
import { drawSpread, renderCard, joinCards, type Drawn } from '../modules/tarot'

type Size = 1 | 3 | 5

export default function Tarot() {
  const [size, setSize] = useState<Size>(3)
  const [drawn, setDrawn] = useState<Drawn[]>([])
  const [reveal, setReveal] = useState<number[]>([])
  const preRef = useRef<HTMLPreElement>(null)
  const animRef = useRef<number | null>(null)

  useEffect(() => { shuffle(size) /* eslint-disable-next-line */ }, [])

  const shuffle = (n: Size) => {
    if (animRef.current) { clearInterval(animRef.current); animRef.current = null }
    const d = drawSpread(n)
    setDrawn(d)
    setReveal(new Array(n).fill(0))
    // reveal each card sequentially
    let i = 0
    animRef.current = window.setInterval(() => {
      setReveal((r) => { const c = [...r]; c[i] = 1; return c })
      i++
      if (i >= n) {
        if (animRef.current) { clearInterval(animRef.current); animRef.current = null }
      }
    }, 350)
  }

  useEffect(() => {
    if (!preRef.current) return
    const cards = drawn.map((d, i) => renderCard(d, reveal[i] ?? 0))
    if (cards.length === 0) {
      preRef.current.textContent = ''
      return
    }
    preRef.current.textContent = joinCards(cards, 4)
  }, [drawn, reveal])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.key === ' ') { e.preventDefault(); shuffle(size) }
      if (e.key === '1') { setSize(1); shuffle(1) }
      if (e.key === '3') { setSize(3); shuffle(3) }
      if (e.key === '5') { setSize(5); shuffle(5) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    /* eslint-disable-next-line */
  }, [size])

  return (
    <div className="flex flex-col gap-6">
      <Tile
        label={`tarot · ${size} card${size > 1 ? 's' : ''}`}
        code="13"
        footer={
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              {([1, 3, 5] as Size[]).map((n) => (
                <button
                  key={n}
                  data-interactive
                  onClick={() => { setSize(n); shuffle(n) }}
                  className={`!px-2 !py-0.5 text-[11px] ${n === size ? '!border-[var(--color-fg)] text-[var(--color-fg)]' : 'text-[var(--color-dim)]'}`}
                >{n} card{n > 1 ? 's' : ''}</button>
              ))}
            </div>
            <span>space redraw · 1 / 3 / 5 switch spread</span>
          </div>
        }
      >
        <div className="grid min-h-[52vh] place-items-center overflow-auto p-4">
          <pre ref={preRef} className="m-0 whitespace-pre text-[clamp(10px,1.3vw,16px)] leading-[1.1] text-[var(--color-fg)]" />
        </div>
      </Tile>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {drawn.map((d, i) => (
          <Tile key={i} label={d.position} code={d.card.num}>
            <div className="flex flex-col gap-1 p-3 text-[12px]">
              <span className="text-[var(--color-fg)]">{d.card.name}{d.reversed ? ' · reversed' : ''}</span>
              <span className="text-[var(--color-dim)]">{d.reversed && d.card.reversed ? d.card.reversed : d.card.meaning}</span>
            </div>
          </Tile>
        ))}
      </div>
    </div>
  )
}
