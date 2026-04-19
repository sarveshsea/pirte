import { useLocation } from 'react-router-dom'
import { GLOBAL, ROUTE_SHORTCUTS, type Group } from '../data/shortcuts'

type Props = { open: boolean; onClose: () => void }

export default function Shortcuts({ open, onClose }: Props) {
  const loc = useLocation()
  if (!open) return null
  const routeGroup: Group | undefined = ROUTE_SHORTCUTS[loc.pathname]
  const groups: Group[] = routeGroup ? [routeGroup, GLOBAL] : [GLOBAL]

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 pt-[12vh] backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="keyboard shortcuts"
    >
      <div
        className="w-[min(640px,94vw)] overflow-hidden rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-[var(--color-line)] px-4 py-2.5 text-[11px] tracking-[0.06em] text-[var(--color-dim)]">
          <span>shortcuts</span>
          <span>esc · close</span>
        </header>
        <div className="max-h-[62vh] overflow-auto p-4">
          {groups.map((g) => (
            <section key={g.heading} className="mb-5 last:mb-0">
              <h3 className="mb-2 text-[11px] tracking-[0.15em] text-[var(--color-dim)]">{g.heading}</h3>
              <ul className="flex flex-col">
                {g.items.map((item, i) => (
                  <li
                    key={`${g.heading}-${i}`}
                    className="flex items-baseline justify-between gap-4 border-b border-[var(--color-line)] py-1.5 last:border-0"
                  >
                    <span className="text-[12px] text-[var(--color-fg)]">{item.label}</span>
                    <kbd className="shrink-0 rounded-[4px] border border-[var(--color-line)] bg-[var(--color-bg)] px-2 py-0.5 text-[11px] tracking-[0.08em] text-[var(--color-fg)]">
                      {item.keys}
                    </kbd>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
