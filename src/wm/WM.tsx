import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Node, PaneId, Workspace, WMState } from './types'
import { allLeaves, closeAt, firstLeaf, leaf, resizeSplit, setRoute, splitAt } from './tree'
import { REGISTRY } from './registry'
import Pane from './Pane'

type Props = {
  open: boolean
  onClose: () => void
}

const NUM_WORKSPACES = 4

const makeInitial = (): WMState => ({
  current: 0,
  workspaces: Array.from({ length: NUM_WORKSPACES }, (_, i) => ({
    id: i + 1,
    root: i === 0 ? leaf('/fractals') : null,
    focus: null,
  } as Workspace)).map((ws) => ({ ...ws, focus: ws.root ? firstLeaf(ws.root)!.id : null })),
})

export default function WM({ open, onClose }: Props) {
  const [state, setState] = useState<WMState>(makeInitial)
  const [launcherOpen, setLauncherOpen] = useState(false)
  const [launcherMode, setLauncherMode] = useState<'split-h' | 'split-v' | 'swap'>('split-h')
  const [launcherQ, setLauncherQ] = useState('')
  const [launcherIdx, setLauncherIdx] = useState(0)
  const launcherInputRef = useRef<HTMLInputElement>(null)
  const paneRefs = useRef(new Map<PaneId, HTMLDivElement>())

  const ws = state.workspaces[state.current]
  const focus = ws.focus

  const updateWs = useCallback((mut: (ws: Workspace) => Workspace) => {
    setState((s) => ({
      ...s,
      workspaces: s.workspaces.map((w, i) => (i === s.current ? mut(w) : w)),
    }))
  }, [])

  const spawn = useCallback((path: string, dir: 'h' | 'v') => {
    updateWs((w) => {
      if (!w.root) {
        const n = leaf(path)
        return { ...w, root: n, focus: n.id }
      }
      const target = w.focus ?? firstLeaf(w.root)?.id
      if (!target) return w
      const { root, newId } = splitAt(w.root, target, path, dir, 'after')
      return { ...w, root, focus: newId }
    })
  }, [updateWs])

  const swapFocused = useCallback((path: string) => {
    updateWs((w) => {
      if (!w.root || !w.focus) return w
      return { ...w, root: setRoute(w.root, w.focus, path) }
    })
  }, [updateWs])

  const closeFocused = useCallback(() => {
    updateWs((w) => {
      if (!w.root || !w.focus) return w
      const next = closeAt(w.root, w.focus)
      const nextFocus = next ? firstLeaf(next)?.id ?? null : null
      return { ...w, root: next, focus: nextFocus }
    })
  }, [updateWs])

  const setFocus = useCallback((id: PaneId) => {
    updateWs((w) => ({ ...w, focus: id }))
  }, [updateWs])

  // geometric neighbour focus using rendered rects
  const focusDir = useCallback((d: 'left' | 'right' | 'up' | 'down') => {
    const current = focus
    if (!current) return
    const currentEl = paneRefs.current.get(current)
    if (!currentEl) return
    const cr = currentEl.getBoundingClientRect()
    const cx = cr.left + cr.width / 2
    const cy = cr.top + cr.height / 2
    let best: { id: PaneId; dist: number } | null = null
    for (const [id, el] of paneRefs.current.entries()) {
      if (id === current) continue
      const r = el.getBoundingClientRect()
      const ox = r.left + r.width / 2
      const oy = r.top + r.height / 2
      const dx = ox - cx
      const dy = oy - cy
      const good =
        (d === 'left'  && dx < -2 && Math.abs(dy) < Math.abs(dx) * 1.5) ||
        (d === 'right' && dx >  2 && Math.abs(dy) < Math.abs(dx) * 1.5) ||
        (d === 'up'    && dy < -2 && Math.abs(dx) < Math.abs(dy) * 1.5) ||
        (d === 'down'  && dy >  2 && Math.abs(dx) < Math.abs(dy) * 1.5)
      if (!good) continue
      const dist = Math.hypot(dx, dy)
      if (!best || dist < best.dist) best = { id, dist }
    }
    if (best) setFocus(best.id)
  }, [focus, setFocus])

  const switchWorkspace = useCallback((idx: number) => {
    setState((s) => ({ ...s, current: Math.max(0, Math.min(s.workspaces.length - 1, idx)) }))
  }, [])

  // launcher triggered for split or swap
  const openLauncher = useCallback((mode: 'split-h' | 'split-v' | 'swap') => {
    setLauncherMode(mode)
    setLauncherQ('')
    setLauncherIdx(0)
    setLauncherOpen(true)
    setTimeout(() => launcherInputRef.current?.focus(), 0)
  }, [])

  const filtered = useMemo(() => {
    const q = launcherQ.trim().toLowerCase()
    if (!q) return REGISTRY
    return REGISTRY.filter((r) => r.label.toLowerCase().includes(q) || r.path.toLowerCase().includes(q))
  }, [launcherQ])

  const runLauncher = (path: string) => {
    if (launcherMode === 'split-h') spawn(path, 'h')
    else if (launcherMode === 'split-v') spawn(path, 'v')
    else if (launcherMode === 'swap') swapFocused(path)
    setLauncherOpen(false)
  }

  // keyboard handler
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const k = e.key.toLowerCase()

      // prevent browser shortcuts
      const intercept = () => { e.preventDefault(); e.stopPropagation() }

      if (e.key === 'Enter') {
        intercept()
        openLauncher(e.shiftKey ? 'split-v' : 'split-h')
        return
      }
      if (k === 'd') { intercept(); openLauncher('swap'); return }
      if (k === 'q') { intercept(); closeFocused(); return }
      if (k === ' ') { intercept(); onClose(); return }
      if (k === 'h' || e.key === 'ArrowLeft')  { intercept(); focusDir('left');  return }
      if (k === 'l' || e.key === 'ArrowRight') { intercept(); focusDir('right'); return }
      if (k === 'k' || e.key === 'ArrowUp')    { intercept(); focusDir('up');    return }
      if (k === 'j' || e.key === 'ArrowDown')  { intercept(); focusDir('down');  return }

      // resize: alt+shift+h/j/k/l
      if (e.shiftKey && focus && ws.root) {
        if (k === 'h') { intercept(); updateWs((w) => w.root ? { ...w, root: resizeSplit(w.root, focus, -0.05) } : w); return }
        if (k === 'l') { intercept(); updateWs((w) => w.root ? { ...w, root: resizeSplit(w.root, focus, +0.05) } : w); return }
        if (k === 'k') { intercept(); updateWs((w) => w.root ? { ...w, root: resizeSplit(w.root, focus, -0.05) } : w); return }
        if (k === 'j') { intercept(); updateWs((w) => w.root ? { ...w, root: resizeSplit(w.root, focus, +0.05) } : w); return }
      }

      const n = parseInt(e.key, 10)
      if (!Number.isNaN(n) && n >= 1 && n <= state.workspaces.length) {
        intercept()
        switchWorkspace(n - 1)
      }
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [open, focus, ws, state.workspaces.length, openLauncher, closeFocused, focusDir, switchWorkspace, updateWs, onClose])

  // escape closes launcher first, then WM
  useEffect(() => {
    if (!open) return
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (launcherOpen) { setLauncherOpen(false); return }
      }
    }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [open, launcherOpen])

  if (!open) return null

  return (
    <div className="fixed inset-x-0 top-0 z-40 flex flex-col bg-[var(--color-bg)]" style={{ bottom: '28px' }}>
      {/* top menubar */}
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-2 text-[11px]">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-2 text-[var(--color-fg)]">
            <span className="inline-block h-[14px] w-[8px] rounded-[2px] bg-[var(--color-fg)]" />
            <span className="tracking-[0.12em]">pirte-wm</span>
          </span>
          <div className="flex items-center gap-1 text-[var(--color-dim)]">
            {state.workspaces.map((w, i) => (
              <button
                key={i}
                data-interactive
                onClick={() => switchWorkspace(i)}
                className={`!px-2 !py-0.5 !text-[11px] ${i === state.current ? '!border-[var(--color-fg)] text-[var(--color-fg)]' : '!border-[var(--color-line)]'}`}
                title={`workspace ${i + 1} · alt+${i + 1}`}
              >
                {i + 1}
                <span className="ml-1 text-[10px] text-[var(--color-dim)]">{allLeaves(w.root).length || '·'}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3 text-[var(--color-dim)]">
          <span>alt+enter split · alt+d swap · alt+q close · alt+hjkl focus · alt+⇧hjkl resize · alt+space exit</span>
          <button data-interactive onClick={onClose} className="!px-2 !py-0.5 text-[var(--color-dim)] hover:text-[var(--color-fg)]">× exit wm</button>
        </div>
      </header>

      {/* desktop */}
      <div className="relative min-h-0 flex-1 p-3">
        {ws.root ? (
          <RenderTree
            node={ws.root}
            focus={focus}
            onFocus={setFocus}
            onClose={(id) => { setFocus(id); closeFocused() }}
            onSwap={(id) => { setFocus(id); openLauncher('swap') }}
            registerRef={(id, el) => {
              if (el) paneRefs.current.set(id, el)
              else paneRefs.current.delete(id)
            }}
          />
        ) : (
          <EmptyWorkspace onOpen={() => openLauncher('split-h')} />
        )}
      </div>

      {/* launcher */}
      {launcherOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 pt-[18vh] backdrop-blur-sm"
          onClick={() => setLauncherOpen(false)}
        >
          <div
            className="w-[min(520px,92vw)] overflow-hidden rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-[var(--color-line)] px-3 py-2 text-[12px]">
              <span className="text-[var(--color-dim)]">{launcherMode === 'swap' ? 'swap' : launcherMode === 'split-h' ? 'split →' : 'split ↓'}</span>
              <span className="text-[var(--color-dim)]">›</span>
              <input
                ref={launcherInputRef}
                value={launcherQ}
                onChange={(e) => { setLauncherQ(e.target.value); setLauncherIdx(0) }}
                placeholder="module…"
                className="w-full bg-transparent text-[var(--color-fg)] outline-none placeholder:text-[var(--color-dim)]"
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setLauncherIdx((i) => Math.min(i + 1, filtered.length - 1)) }
                  if (e.key === 'ArrowUp')   { e.preventDefault(); setLauncherIdx((i) => Math.max(i - 1, 0)) }
                  if (e.key === 'Enter') { const c = filtered[launcherIdx]; if (c) runLauncher(c.path) }
                  if (e.key === 'Escape') setLauncherOpen(false)
                }}
              />
            </div>
            <ul className="max-h-[44vh] overflow-auto">
              {filtered.map((r, i) => (
                <li
                  key={r.path}
                  data-interactive
                  onMouseEnter={() => setLauncherIdx(i)}
                  onClick={() => runLauncher(r.path)}
                  className={`flex cursor-none items-center justify-between px-3 py-2 text-[12px] ${i === launcherIdx ? 'bg-[var(--color-line)] text-[var(--color-fg)]' : 'text-[var(--color-dim)]'}`}
                >
                  <span>{r.label}</span>
                  <span className="text-[11px] text-[var(--color-dim)]">{r.path}</span>
                </li>
              ))}
              {filtered.length === 0 && <li className="px-3 py-3 text-[var(--color-dim)]">no module</li>}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

function EmptyWorkspace({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="flex h-full w-full items-center justify-center border border-dashed border-[var(--color-line)] text-[12px] text-[var(--color-dim)]">
      <div className="flex flex-col items-center gap-2">
        <span className="tracking-[0.15em]">empty workspace</span>
        <button data-interactive onClick={onOpen} className="!px-3 !py-1 text-[var(--color-fg)]">alt+enter · open module</button>
      </div>
    </div>
  )
}

type RenderProps = {
  node: Node
  focus: PaneId | null
  onFocus: (id: PaneId) => void
  onClose: (id: PaneId) => void
  onSwap: (id: PaneId) => void
  registerRef: (id: PaneId, el: HTMLDivElement | null) => void
}

function RenderTree(props: RenderProps): React.ReactElement {
  const { node } = props
  if (node.kind === 'leaf') {
    return (
      <Pane
        ref={(el) => props.registerRef(node.id, el)}
        id={node.id}
        route={node.route}
        focused={props.focus === node.id}
        onFocus={() => props.onFocus(node.id)}
        onClose={() => props.onClose(node.id)}
        onSwap={() => props.onSwap(node.id)}
      />
    )
  }
  const style: React.CSSProperties = {
    display: 'flex',
    flexDirection: node.dir === 'h' ? 'row' : 'column',
    gap: '8px',
    height: '100%',
    width: '100%',
  }
  const aStyle: React.CSSProperties = { flex: `${node.ratio} 1 0`, minWidth: 0, minHeight: 0 }
  const bStyle: React.CSSProperties = { flex: `${1 - node.ratio} 1 0`, minWidth: 0, minHeight: 0 }
  return (
    <div style={style}>
      <div style={aStyle}><RenderTree {...props} node={node.a} /></div>
      <div style={bStyle}><RenderTree {...props} node={node.b} /></div>
    </div>
  )
}
