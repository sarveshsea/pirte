import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

export type Command = { id: string; label: string; hint?: string; to?: string; run?: () => void }

type Props = { open: boolean; onClose: () => void; commands: Command[] }

export default function CommandPalette({ open, onClose, commands }: Props) {
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const nav = useNavigate()

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return commands
    return commands.filter((c) => c.label.toLowerCase().includes(s) || c.id.toLowerCase().includes(s))
  }, [q, commands])

  useEffect(() => {
    if (open) {
      setQ('')
      setIdx(0)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  useEffect(() => { setIdx(0) }, [q])

  if (!open) return null

  const run = (c: Command) => {
    if (c.to) nav(c.to)
    c.run?.()
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 pt-[18vh]"
      onClick={onClose}
    >
      <div
        className="w-[min(560px,92vw)] border border-[var(--color-line)] bg-[var(--color-bg)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[var(--color-line)] px-3 py-2">
          <span className="text-[var(--color-dim)]">›</span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="jump to…"
            className="w-full bg-transparent text-[13px] text-[var(--color-fg)] outline-none placeholder:text-[var(--color-dim)]"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, filtered.length - 1)) }
              if (e.key === 'ArrowUp')   { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)) }
              if (e.key === 'Enter')     { const c = filtered[idx]; if (c) run(c) }
              if (e.key === 'Escape')    onClose()
            }}
          />
          <span className="text-[11px] text-[var(--color-dim)]">esc</span>
        </div>
        <ul className="max-h-[50vh] overflow-auto">
          {filtered.length === 0 && (
            <li className="px-3 py-3 text-[var(--color-dim)]">no match</li>
          )}
          {filtered.map((c, i) => (
            <li
              key={c.id}
              data-interactive
              onMouseEnter={() => setIdx(i)}
              onClick={() => run(c)}
              className={`flex cursor-none items-center justify-between px-3 py-2 text-[13px] ${i === idx ? 'bg-[var(--color-line)] text-[var(--color-fg)]' : 'text-[var(--color-dim)]'}`}
            >
              <span>{c.label}</span>
              {c.hint && <span className="text-[11px] text-[var(--color-dim)]">{c.hint}</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
