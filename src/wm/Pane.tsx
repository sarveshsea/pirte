import { forwardRef, Suspense } from 'react'
import { byPath } from './registry'

type Props = {
  id: string
  route: string
  focused: boolean
  onFocus: () => void
  onClose: () => void
  onSwap: () => void
}

const Pane = forwardRef<HTMLDivElement, Props>(function Pane(
  { id, route, focused, onFocus, onClose, onSwap },
  ref,
) {
  const entry = byPath(route)
  const Content = entry?.Component
  return (
    <div
      ref={ref}
      data-pane-id={id}
      onMouseDown={onFocus}
      className={`flex h-full w-full flex-col overflow-hidden border transition-colors ${
        focused ? 'border-[var(--color-fg)]' : 'border-[var(--color-line)]'
      }`}
      style={{ borderRadius: '6px', background: 'var(--color-surface)' }}
    >
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--color-line)] px-3 py-1.5 text-[11px]">
        <div className="flex items-center gap-2">
          <span className={`inline-block h-[8px] w-[8px] rounded-full ${focused ? 'bg-[var(--color-fg)]' : 'bg-[var(--color-line)]'}`} />
          <span className="tracking-[0.08em] text-[var(--color-fg)]">{entry?.label ?? route}</span>
          <span className="text-[var(--color-dim)]">{route}</span>
        </div>
        <div className="flex items-center gap-2 text-[var(--color-dim)]">
          <button
            data-interactive
            onClick={(e) => { e.stopPropagation(); onSwap() }}
            className="!border-0 !px-1 !py-0 hover:text-[var(--color-fg)]"
            title="swap module (alt+d)"
          >swap</button>
          <button
            data-interactive
            onClick={(e) => { e.stopPropagation(); onClose() }}
            className="!border-0 !px-1 !py-0 hover:text-[var(--color-fg)]"
            title="close pane (alt+q)"
          >×</button>
        </div>
      </header>
      <div className="relative min-h-0 flex-1 overflow-auto p-3">
        {Content ? (
          <Suspense fallback={<div className="p-4 text-[11px] tracking-[0.18em] text-[var(--color-dim)]">loading…</div>}>
            <Content />
          </Suspense>
        ) : <div className="p-4 text-[var(--color-dim)]">unknown module · {route}</div>}
      </div>
    </div>
  )
})

export default Pane
