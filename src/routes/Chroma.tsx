import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  parseHex, rgbToHex, rgbToCss,
  rgbToHsl, rgbToHsv, rgbToOklch, rgbToOklab,
  hslToRgb, relativeLuminance, contrast, wcagGrade,
  WHITE, BLACK, type RGB, type HSL,
} from '../modules/chroma/color'
import { harmonies, type Harmony } from '../modules/chroma/harmony'
import { rafLoop } from '../lib/rafLoop'

const INITIAL = '#6a8cff'

type Grade = ReturnType<typeof wcagGrade>
const gradeLabel: Record<Grade, string> = {
  aaa: 'aaa',
  aa: 'aa',
  'aa-large': 'aa large only',
  fail: 'fail',
}

function Pane({ className = '', children, onClick, title }: {
  className?: string
  children: React.ReactNode
  onClick?: () => void
  title?: string
}) {
  return (
    <div
      onClick={onClick}
      title={title}
      className={
        'relative rounded-[18px] border border-white/10 bg-white/[0.04] p-4 ' +
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_20px_60px_-24px_rgba(0,0,0,0.6)] ' +
        'backdrop-blur-2xl backdrop-saturate-150 ' +
        (onClick ? 'cursor-pointer transition-colors hover:bg-white/[0.06]' : '') +
        ' ' + className
      }
      data-interactive={onClick ? true : undefined}
    >
      {children}
    </div>
  )
}

function KV({ k, v, mono = true }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[12px]">
      <span className="tracking-[0.12em] text-white/40 uppercase">{k}</span>
      <span className={`text-white/90 ${mono ? 'font-mono tabular-nums' : ''}`}>{v}</span>
    </div>
  )
}

export default function Chroma() {
  const [params, setParams] = useSearchParams()
  const [rgb, setRgb] = useState<RGB>(() => parseHex(params.get('h') || INITIAL) || (parseHex(INITIAL) as RGB))
  const [hexInput, setHexInput] = useState(() => rgbToHex(rgb))
  const [copyFlash, setCopyFlash] = useState(false)

  const hsl = useMemo(() => rgbToHsl(rgb), [rgb])
  const hsv = useMemo(() => rgbToHsv(rgb), [rgb])
  const oklch = useMemo(() => rgbToOklch(rgb), [rgb])
  const oklab = useMemo(() => rgbToOklab(rgb), [rgb])
  const lum = useMemo(() => relativeLuminance(rgb), [rgb])
  const cWhite = contrast(rgb, WHITE)
  const cBlack = contrast(rgb, BLACK)
  const hex = useMemo(() => rgbToHex(rgb), [rgb])
  const harm: Harmony[] = useMemo(() => harmonies(rgb), [rgb])

  // keep hex input in sync when color changes from other sources
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setHexInput(hex) }, [hex])

  // throttled url sync
  useEffect(() => {
    const t = setTimeout(() => {
      setParams((p) => { p.set('h', hex.slice(1)); return p }, { replace: true })
    }, 250)
    return () => clearTimeout(t)
  }, [hex, setParams])

  const setHSL = (patch: Partial<HSL>) => setRgb(hslToRgb({ ...hsl, ...patch }))

  const tryHex = (raw: string) => {
    setHexInput(raw)
    const parsed = parseHex(raw)
    if (parsed) setRgb(parsed)
  }

  const copy = useCallback(() => {
    navigator.clipboard?.writeText(hex).catch(() => {})
    setCopyFlash(true)
    setTimeout(() => setCopyFlash(false), 800)
  }, [hex])

  const randomize = useCallback(() => {
    const h = Math.random() * 360
    const s = 0.55 + Math.random() * 0.4
    const l = 0.4 + Math.random() * 0.35
    setRgb(hslToRgb({ h, s, l }))
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key.toLowerCase() === 'r') randomize()
      else if (e.key.toLowerCase() === 'c') copy()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [randomize, copy])

  // ── liquid background canvas ──────────────────────────────────────
  const bgRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = bgRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let W = 0, H = 0

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const rect = canvas.getBoundingClientRect()
      W = Math.max(300, Math.floor(rect.width))
      H = Math.max(300, Math.floor(rect.height))
      canvas.width = W * dpr
      canvas.height = H * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const stop = rafLoop((t) => {
      ctx.clearRect(0, 0, W, H)
      // deep-black base so glass panes read against something
      ctx.fillStyle = '#07080b'
      ctx.fillRect(0, 0, W, H)

      // four orbiting soft radial blobs using the current harmony
      const colors = [
        rgb,
        harm[0].swatches[1],          // complement
        harm[1].swatches[0],          // analogous low
        harm[1].swatches[2],          // analogous high
      ]
      const blobs = 4
      for (let i = 0; i < blobs; i++) {
        const c = colors[i % colors.length]
        const angle = t * 0.0001 + (i * Math.PI * 2) / blobs
        const rad = Math.min(W, H) * 0.32
        const cx = W / 2 + Math.cos(angle) * rad * 0.7
        const cy = H / 2 + Math.sin(angle * 0.8) * rad * 0.7
        const r0 = Math.min(W, H) * 0.55
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r0)
        grad.addColorStop(0,   `rgba(${c.r|0}, ${c.g|0}, ${c.b|0}, 0.55)`)
        grad.addColorStop(0.4, `rgba(${c.r|0}, ${c.g|0}, ${c.b|0}, 0.12)`)
        grad.addColorStop(1,   'rgba(0,0,0,0)')
        ctx.globalCompositeOperation = 'lighter'
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, W, H)
      }
      ctx.globalCompositeOperation = 'source-over'
    })

    return () => {
      ro.disconnect()
      stop()
    }
  }, [rgb, harm])

  const onText = rgb.r * 0.299 + rgb.g * 0.587 + rgb.b * 0.114 > 150 ? '#000' : '#fff'
  const cComp = contrast(rgb, harm[0].swatches[1])

  return (
    <div className="relative min-h-[calc(100vh-120px)]">
      {/* liquid gradient backdrop */}
      <canvas
        ref={bgRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full"
        style={{ filter: 'blur(32px) saturate(125%)' }}
      />

      <div className="relative flex flex-col gap-6 p-1 md:p-2">
        {/* header */}
        <div className="flex items-baseline justify-between text-[13px] tracking-[0.08em] text-white/60">
          <div className="flex items-baseline gap-3">
            <span className="text-white/90 text-[22px] tracking-[-0.01em]">chroma</span>
            <span>· sleek color data</span>
          </div>
          <span className="text-white/40">{copyFlash ? 'copied ✓' : 'c copy · r random'}</span>
        </div>

        {/* hero: swatch + controls */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
          <Pane className="min-h-[260px] overflow-hidden p-0" onClick={copy} title="click to copy hex">
            <div
              className="relative flex h-full min-h-[260px] w-full items-end justify-between p-6"
              style={{ background: rgbToCss(rgb) }}
            >
              <span className="text-[14px] tracking-[0.14em] uppercase" style={{ color: onText, opacity: 0.7 }}>current</span>
              <span className="font-mono text-[42px] tracking-[-0.02em]" style={{ color: onText }}>{hex}</span>
            </div>
          </Pane>

          <Pane>
            <div className="flex flex-col gap-4">
              <div>
                <div className="mb-1 text-[11px] tracking-[0.12em] uppercase text-white/40">hex</div>
                <input
                  value={hexInput}
                  onChange={(e) => tryHex(e.target.value)}
                  placeholder="#rrggbb"
                  spellCheck={false}
                  className="w-full rounded-[8px] border border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-[15px] tracking-[0.02em] text-white/90 outline-none focus:border-white/40"
                />
              </div>
              <LabelledSlider label="hue"        value={hsl.h} min={0} max={360} step={1}     format={(v) => `${v.toFixed(0)}°`} onChange={(h) => setHSL({ h })} />
              <LabelledSlider label="saturation" value={hsl.s} min={0} max={1}   step={0.01}  format={(v) => `${Math.round(v * 100)}%`} onChange={(s) => setHSL({ s })} />
              <LabelledSlider label="lightness"  value={hsl.l} min={0} max={1}   step={0.01}  format={(v) => `${Math.round(v * 100)}%`} onChange={(l) => setHSL({ l })} />
              <div className="flex gap-2">
                <button data-interactive onClick={randomize} className="flex-1 rounded-[8px] border border-white/10 bg-white/[0.04] px-3 py-2 text-[12px] tracking-[0.08em] text-white/80 hover:bg-white/[0.08]">
                  random
                </button>
                <button data-interactive onClick={copy} className="flex-1 rounded-[8px] border border-white/10 bg-white/[0.04] px-3 py-2 text-[12px] tracking-[0.08em] text-white/80 hover:bg-white/[0.08]">
                  copy hex
                </button>
              </div>
            </div>
          </Pane>
        </div>

        {/* values row */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Pane>
            <div className="mb-2 text-[11px] tracking-[0.12em] uppercase text-white/40">rgb</div>
            <div className="flex flex-col gap-1.5">
              <KV k="r" v={String(Math.round(rgb.r))} />
              <KV k="g" v={String(Math.round(rgb.g))} />
              <KV k="b" v={String(Math.round(rgb.b))} />
              <KV k="luma" v={lum.toFixed(3)} />
            </div>
          </Pane>
          <Pane>
            <div className="mb-2 text-[11px] tracking-[0.12em] uppercase text-white/40">hsl</div>
            <div className="flex flex-col gap-1.5">
              <KV k="h" v={`${hsl.h.toFixed(1)}°`} />
              <KV k="s" v={`${(hsl.s * 100).toFixed(1)}%`} />
              <KV k="l" v={`${(hsl.l * 100).toFixed(1)}%`} />
              <KV k="v" v={`${(hsv.v * 100).toFixed(1)}%`} />
            </div>
          </Pane>
          <Pane>
            <div className="mb-2 text-[11px] tracking-[0.12em] uppercase text-white/40">oklch</div>
            <div className="flex flex-col gap-1.5">
              <KV k="l" v={oklch.l.toFixed(3)} />
              <KV k="c" v={oklch.c.toFixed(3)} />
              <KV k="h" v={`${oklch.h.toFixed(1)}°`} />
              <KV k="a·b" v={`${oklab.a.toFixed(3)} · ${oklab.b.toFixed(3)}`} />
            </div>
          </Pane>
          <Pane>
            <div className="mb-2 text-[11px] tracking-[0.12em] uppercase text-white/40">contrast</div>
            <div className="flex flex-col gap-1.5">
              <ContrastRow label="on white" ratio={cWhite} />
              <ContrastRow label="on black" ratio={cBlack} />
              <ContrastRow label="on comp." ratio={cComp} />
              <div className="mt-1 text-[10px] tracking-[0.1em] text-white/30">wcag 2.2</div>
            </div>
          </Pane>
        </div>

        {/* harmony */}
        <Pane>
          <div className="mb-3 text-[11px] tracking-[0.12em] uppercase text-white/40">harmonies · click any swatch</div>
          <div className="flex flex-col gap-3">
            {harm.map((h) => (
              <div key={h.kind} className="flex items-center gap-3">
                <span className="w-[160px] shrink-0 text-[12px] tracking-[0.08em] text-white/60">{h.label}</span>
                <div className="flex flex-1 gap-2">
                  {h.swatches.map((sw, i) => {
                    const sh = rgbToHex(sw)
                    return (
                      <button
                        key={i}
                        data-interactive
                        onClick={() => setRgb(sw)}
                        title={sh}
                        className="group relative flex h-10 flex-1 items-center justify-center rounded-[8px] border border-white/10 transition-transform hover:scale-[1.03]"
                        style={{ background: rgbToCss(sw) }}
                      >
                        <span
                          className="absolute inset-x-2 bottom-1 hidden text-[10px] tracking-[0.08em] opacity-0 transition-opacity group-hover:block group-hover:opacity-100"
                          style={{ color: (sw.r * 0.299 + sw.g * 0.587 + sw.b * 0.114 > 150) ? '#000' : '#fff' }}
                        >{sh}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </Pane>

        {/* characters showcase */}
        <Pane>
          <div className="mb-4 text-[11px] tracking-[0.12em] uppercase text-white/40">characters · on surfaces</div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1fr]">
            <div
              className="flex h-[180px] flex-col justify-between rounded-[12px] border border-white/10 p-5"
              style={{ background: rgbToCss(rgb), color: onText }}
            >
              <div className="font-mono text-[11px] tracking-[0.14em] opacity-60">fg on chroma</div>
              <div className="flex items-baseline gap-3">
                <span className="text-[68px] leading-none tracking-[-0.03em]">Aa</span>
                <span className="font-mono text-[28px]">09</span>
                <span className="text-[36px] leading-none">✦◆★</span>
              </div>
              <div className="text-[11px] leading-relaxed opacity-70">the quick brown fox leaps · lowercase body type · lorem ipsum dolor sit amet consectetur</div>
            </div>
            <div
              className="flex h-[180px] flex-col justify-between rounded-[12px] border border-white/10 p-5"
              style={{ background: '#0a0a0a', color: rgbToCss(rgb) }}
            >
              <div className="font-mono text-[11px] tracking-[0.14em] text-white/40">chroma on dark</div>
              <div className="flex items-baseline gap-3">
                <span className="text-[68px] leading-none tracking-[-0.03em]">Aa</span>
                <span className="font-mono text-[28px]">09</span>
                <span className="text-[36px] leading-none">✦◆★</span>
              </div>
              <div className="text-[11px] leading-relaxed opacity-80">the quick brown fox leaps · lowercase body type · lorem ipsum dolor sit amet consectetur</div>
            </div>
          </div>
        </Pane>
      </div>
    </div>
  )
}

function LabelledSlider({ label, value, min, max, step, format, onChange }: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (v: number) => string
  onChange: (v: number) => void
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-[11px] tracking-[0.1em] text-white/50">
        <span className="uppercase">{label}</span>
        <span className="font-mono tabular-nums text-white/80">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
    </div>
  )
}

function ContrastRow({ label, ratio }: { label: string; ratio: number }) {
  const grade = wcagGrade(ratio)
  const color =
    grade === 'aaa'      ? '#6be38a' :
    grade === 'aa'       ? '#b9e36b' :
    grade === 'aa-large' ? '#e3c26b' :
                           '#e36b6b'
  return (
    <div className="flex items-baseline justify-between gap-3 text-[12px]">
      <span className="tracking-[0.1em] text-white/50">{label}</span>
      <div className="flex items-baseline gap-2">
        <span className="font-mono tabular-nums text-white/90">{ratio.toFixed(2)}</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color }}>{gradeLabel[grade]}</span>
      </div>
    </div>
  )
}
