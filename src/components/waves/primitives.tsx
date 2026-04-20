// shared ui primitives for /waves. canvas-freedom approved — knobs, meters,
// and filter curves are proper svg/canvas rather than ascii. kept together so
// the studio's visual language stays coherent.

import { useEffect, useRef, useState, useCallback } from 'react'

/* ---------------- Knob -------------------------------------------------- */

type KnobProps = {
  label?: string
  min: number
  max: number
  value: number
  step?: number
  defaultValue?: number
  size?: number
  accent?: string
  onChange: (v: number) => void
  format?: (v: number) => string
}

/** vertical drag = value. shift+drag = fine. double-click = default. */
export function Knob({
  label, min, max, value, step = 0.01, defaultValue,
  size = 32, accent, onChange, format,
}: KnobProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const dragStart = useRef<{ y: number; v: number; fine: boolean } | null>(null)
  const range = max - min
  const norm = range > 0 ? (value - min) / range : 0
  // map 0..1 → -135°..135° (ccw sweep)
  const angle = -135 + norm * 270
  const cx = size / 2
  const cy = size / 2
  const r = size / 2 - 3
  const indicator = polar(cx, cy, r - 2, angle)
  const accentCol = accent ?? 'var(--color-fg)'

  const quantize = (v: number) => {
    const snapped = Math.round(v / step) * step
    return Math.max(min, Math.min(max, snapped))
  }

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    dragStart.current = { y: e.clientY, v: value, fine: e.shiftKey }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragStart.current) return
    const dy = dragStart.current.y - e.clientY
    const sensitivity = dragStart.current.fine ? 0.001 : 0.006
    const next = dragStart.current.v + dy * sensitivity * range
    onChange(quantize(next))
  }
  const onPointerUp = (e: React.PointerEvent) => {
    if ((e.target as Element).hasPointerCapture?.(e.pointerId))
      (e.target as Element).releasePointerCapture(e.pointerId)
    dragStart.current = null
  }
  const onDblClick = () => {
    if (defaultValue !== undefined) onChange(quantize(defaultValue))
  }
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = -Math.sign(e.deltaY) * step * (e.shiftKey ? 1 : 5)
    onChange(quantize(value + delta))
  }

  return (
    <div className="flex flex-col items-center gap-1 select-none">
      <svg
        ref={svgRef}
        width={size} height={size} viewBox={`0 0 ${size} ${size}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDblClick}
        onWheel={onWheel}
        className="cursor-ns-resize touch-none"
        role="slider"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
      >
        {/* track arc (full sweep) */}
        <path
          d={arcPath(cx, cy, r, -135, 135)}
          stroke="var(--color-line)"
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
        />
        {/* value arc */}
        <path
          d={arcPath(cx, cy, r, -135, angle)}
          stroke={accentCol}
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
        />
        {/* indicator line */}
        <line
          x1={cx} y1={cy} x2={indicator.x} y2={indicator.y}
          stroke={accentCol} strokeWidth={1.5} strokeLinecap="round"
        />
        {/* centre pip */}
        <circle cx={cx} cy={cy} r={1.4} fill={accentCol} />
      </svg>
      {label !== undefined && (
        <div className="text-[11px] leading-tight text-[var(--color-dim)]">
          {label}
        </div>
      )}
      {format && (
        <div className="text-[11px] tabular-nums leading-tight text-[var(--color-fg)]">
          {format(value)}
        </div>
      )}
    </div>
  )
}

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg - 90) * (Math.PI / 180)
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  if (Math.abs(endDeg - startDeg) < 0.01) {
    // degenerate arc → just draw a 0.01° arc to avoid SVG dropping it
    endDeg = startDeg + 0.01
  }
  const start = polar(cx, cy, r, startDeg)
  const end = polar(cx, cy, r, endDeg)
  const largeArc = endDeg - startDeg > 180 ? 1 : 0
  const sweep = endDeg > startDeg ? 1 : 0
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} ${sweep} ${end.x} ${end.y}`
}

/* ---------------- MiniMeter -------------------------------------------- */

type MiniMeterProps = {
  /** level getter returns [left, right] in 0..1 linear. called 15fps. */
  getLevel: () => [number, number]
  width?: number
  height?: number
  accent?: string
}

/** stereo vu strip with peak hold. draws to canvas. 15fps. */
export function MiniMeter({ getLevel, width = 6, height = 60, accent }: MiniMeterProps) {
  const ref = useRef<HTMLCanvasElement>(null)
  const peaksRef = useRef<[number, number]>([0, 0])
  const peakDecayRef = useRef<[number, number]>([0, 0])

  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ctx = c.getContext('2d')!
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    c.width = width * dpr
    c.height = height * dpr
    ctx.scale(dpr, dpr)

    let raf = 0
    let last = 0
    const accentCol = accent ?? '#50ffd8'

    const tick = (t: number) => {
      if (t - last >= 1000 / 15) {
        last = t
        const [l, r] = getLevel()
        // peak hold w/ decay
        const [pl, pr] = peaksRef.current
        const [dl, dr] = peakDecayRef.current
        peaksRef.current = [
          l > pl ? l : Math.max(0, pl - 0.015),
          r > pr ? r : Math.max(0, pr - 0.015),
        ]
        peakDecayRef.current = [
          Math.max(dl - 0.005, l),
          Math.max(dr - 0.005, r),
        ]
        ctx.clearRect(0, 0, width, height)
        ctx.fillStyle = 'rgba(255,255,255,0.04)'
        ctx.fillRect(0, 0, width, height)
        drawBar(ctx, 0, height, width / 2 - 0.5, l, accentCol)
        drawBar(ctx, width / 2 + 0.5, height, width / 2 - 0.5, r, accentCol)
        // peak tick marks
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, height - height * peaksRef.current[0], width / 2 - 0.5, 1)
        ctx.fillRect(width / 2 + 0.5, height - height * peaksRef.current[1], width / 2 - 0.5, 1)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [getLevel, width, height, accent])

  return <canvas ref={ref} style={{ width, height }} className="block" />
}

function drawBar(ctx: CanvasRenderingContext2D, x: number, h: number, w: number, level: number, accent: string) {
  const barH = h * Math.min(1, level)
  // green→yellow→red gradient roughly at 0.7 / 0.9
  const grad = ctx.createLinearGradient(0, h, 0, 0)
  grad.addColorStop(0, accent)
  grad.addColorStop(0.7, accent)
  grad.addColorStop(0.9, '#ffd26a')
  grad.addColorStop(1.0, '#ff7a7a')
  ctx.fillStyle = grad
  ctx.fillRect(x, h - barH, w, barH)
}

/* ---------------- FilterCurve ------------------------------------------ */

type FilterCurveProps = {
  type: 'lp' | 'hp' | 'bp'
  cutoff: number      // Hz, 20..20000
  res: number         // 0..1 → Q 0.7..12
  width?: number
  height?: number
  accent?: string
}

/** read-only biquad magnitude response (20hz..20khz log axis). */
export function FilterCurve({
  type, cutoff, res, width = 120, height = 44, accent,
}: FilterCurveProps) {
  const accentCol = accent ?? 'var(--color-fg)'
  const path = useFilterPath(type, cutoff, res, width, height)
  return (
    <svg width={width} height={height} className="block">
      <rect width={width} height={height} fill="var(--color-bg)" />
      <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke="var(--color-line)" strokeDasharray="2 2" />
      <path d={path} stroke={accentCol} strokeWidth={1.5} fill="none" />
    </svg>
  )
}

function useFilterPath(type: 'lp'|'hp'|'bp', cutoff: number, res: number, width: number, height: number): string {
  // compute 64-point magnitude on log freq axis
  const points: string[] = []
  const Q = 0.7 + res * 11.3
  for (let i = 0; i < 64; i++) {
    const f = 20 * Math.pow(1000, i / 63)      // 20 → 20k log
    const mag = biquadMag(type, f, cutoff, Q)
    const db = 20 * Math.log10(Math.max(0.001, mag))
    const y = height / 2 - (db / 24) * (height / 2)
    const x = (i / 63) * width
    points.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${Math.max(0, Math.min(height, y)).toFixed(1)}`)
  }
  return points.join(' ')
}

function biquadMag(type: 'lp'|'hp'|'bp', f: number, fc: number, Q: number): number {
  const w = f / fc
  const w2 = w * w
  if (type === 'lp') return 1 / Math.sqrt((1 - w2) ** 2 + (w / Q) ** 2)
  if (type === 'hp') return w2 / Math.sqrt((1 - w2) ** 2 + (w / Q) ** 2)
  // bp
  return (w / Q) / Math.sqrt((1 - w2) ** 2 + (w / Q) ** 2)
}

/* ---------------- CompMeter -------------------------------------------- */

type CompMeterProps = {
  /** return current gain-reduction in dB (0 = none, negative = reducing). */
  getGR: () => number
  width?: number
  height?: number
  accent?: string
}

/** horizontal gain-reduction needle. 0dB at right, -30 at left. */
export function CompMeter({ getGR, width = 120, height = 18, accent }: CompMeterProps) {
  const [gr, setGr] = useState(0)
  useEffect(() => {
    let raf = 0
    let last = 0
    const tick = (t: number) => {
      if (t - last >= 1000 / 15) { setGr(getGR()); last = t }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [getGR])

  const grClamped = Math.max(-30, Math.min(0, gr))
  const frac = grClamped / -30
  const accentCol = accent ?? '#ffd26a'
  return (
    <svg width={width} height={height} className="block">
      <rect width={width} height={height} fill="var(--color-bg)" />
      {/* tick marks every 6 dB */}
      {[0, 6, 12, 18, 24, 30].map((db) => {
        const x = width - (db / 30) * width
        return <line key={db} x1={x} y1={height - 3} x2={x} y2={height} stroke="var(--color-line)" />
      })}
      {/* bar from right shrinking left as GR increases */}
      <rect
        x={width - width * frac - 1}
        y={2}
        width={width * frac + 1}
        height={height - 5}
        fill={accentCol}
        opacity={0.7}
      />
    </svg>
  )
}

/* ---------------- NotePad ---------------------------------------------- */

type NotePadProps = {
  note: number              // midi
  onChange: (n: number) => void
  onClose?: () => void
}

const KEY_LAYOUT: { note: number; black: boolean }[] = []
for (let n = 36; n <= 84; n++) {
  const semi = n % 12
  KEY_LAYOUT.push({ note: n, black: [1, 3, 6, 8, 10].includes(semi) })
}

/** tiny 4-octave on-screen keyboard for per-step pitch selection. */
export function NotePad({ note, onChange, onClose }: NotePadProps) {
  const width = 280
  const height = 56
  const whites = KEY_LAYOUT.filter((k) => !k.black)
  const wW = width / whites.length
  const bH = height * 0.62

  const onKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') { onClose?.(); return }
    if (e.key === 'ArrowUp')   { onChange(Math.min(127, note + 1)); e.preventDefault() }
    if (e.key === 'ArrowDown') { onChange(Math.max(0,   note - 1)); e.preventDefault() }
    if (e.key === 'ArrowRight'){ onChange(Math.min(127, note + 12)); e.preventDefault() }
    if (e.key === 'ArrowLeft') { onChange(Math.max(0,   note - 12)); e.preventDefault() }
  }, [note, onChange, onClose])
  useEffect(() => {
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onKey])

  return (
    <div className="inline-flex flex-col gap-1 rounded-[6px] border border-[var(--color-line)] bg-[var(--color-surface)] p-2">
      <svg width={width} height={height} className="block">
        {whites.map((k, i) => {
          const selected = k.note === note
          return (
            <rect
              key={k.note}
              x={i * wW + 0.5}
              y={0.5}
              width={wW - 1}
              height={height - 1}
              fill={selected ? 'var(--color-fg)' : 'var(--color-bg)'}
              stroke="var(--color-line)"
              onClick={() => onChange(k.note)}
              style={{ cursor: 'pointer' }}
            />
          )
        })}
        {KEY_LAYOUT.map((k, i) => {
          if (!k.black) return null
          // position: between prior white and next white
          const whiteIdx = KEY_LAYOUT.slice(0, i).filter((x) => !x.black).length
          const x = whiteIdx * wW - wW * 0.3
          const selected = k.note === note
          return (
            <rect
              key={k.note}
              x={x}
              y={0}
              width={wW * 0.6}
              height={bH}
              fill={selected ? 'var(--color-fg)' : '#000'}
              stroke="var(--color-line)"
              onClick={() => onChange(k.note)}
              style={{ cursor: 'pointer' }}
            />
          )
        })}
      </svg>
      <div className="text-[11px] text-[var(--color-dim)] tabular-nums">
        {noteName(note)} · {note} · ↑↓ semitone · ←→ octave · esc close
      </div>
    </div>
  )
}

const NOTE_NAMES = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b']
function noteName(midi: number): string {
  const n = NOTE_NAMES[((midi % 12) + 12) % 12]
  const oct = Math.floor(midi / 12) - 1
  return `${n}${oct}`
}
