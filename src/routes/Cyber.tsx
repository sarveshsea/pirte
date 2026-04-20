import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import Tile from '../components/Tile'
import { prefersReducedMotion } from '../lib/canvas'
import { rafLoop } from '../lib/rafLoop'

const KATAKANA = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789{}[]<>/\\'
const NEON_CYAN = '#00f0ff'
const NEON_MAG  = '#ff2bd1'
const NEON_YEL  = '#f7ff00'
const NEON_PUR  = '#8b5cf6'

const CYBER_VARS: CSSProperties & Record<string, string> = {
  '--color-bg':      '#0a0014',
  '--color-surface': '#120822',
  '--color-fg':      '#d5f7ff',
  '--color-dim':     '#6a7a9a',
  '--color-line':    '#1f2f4a',
  '--cyan':    NEON_CYAN,
  '--mag':     NEON_MAG,
  '--yel':     NEON_YEL,
  '--pur':     NEON_PUR,
}

/* ---------- glitch title with rgb-split ---------- */

function GlitchText({ text, className = '' }: { text: string; className?: string }) {
  const [display, setDisplay] = useState(text)
  useEffect(() => {
    let holdUntil = 0
    const timeouts = new Set<number>()
    const stop = rafLoop((t) => {
      if (t > holdUntil && Math.random() < 0.08) {
        const chars = text.split('')
        const swaps = 1 + Math.floor(Math.random() * 2)
        for (let i = 0; i < swaps; i++) {
          const k = Math.floor(Math.random() * chars.length)
          if (chars[k] !== ' ') chars[k] = KATAKANA[Math.floor(Math.random() * KATAKANA.length)]
        }
        setDisplay(chars.join(''))
        holdUntil = t + 80 + Math.random() * 140
        const id = window.setTimeout(() => {
          setDisplay(text)
          timeouts.delete(id)
        }, 70 + Math.random() * 90)
        timeouts.add(id)
      }
    })
    return () => {
      stop()
      for (const id of timeouts) window.clearTimeout(id)
      timeouts.clear()
    }
  }, [text])
  return (
    <span className={`relative inline-block leading-none ${className}`}>
      <span aria-hidden className="absolute inset-0 text-[var(--cyan)] mix-blend-screen" style={{ transform: 'translate(-1.5px, 0)', filter: 'blur(0.2px)' }}>{display}</span>
      <span aria-hidden className="absolute inset-0 text-[var(--mag)] mix-blend-screen" style={{ transform: 'translate(1.5px, 0)', filter: 'blur(0.2px)' }}>{display}</span>
      <span className="relative text-[var(--color-fg)]">{display}</span>
    </span>
  )
}

/* ---------- katakana rain (neon) ---------- */

function KatakanaRain() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ctx = c.getContext('2d')!
    let drops: { y: number; speed: number }[] = []
    let cols = 0
    const FONT = 15

    const resize = () => {
      const rect = c.getBoundingClientRect()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      c.width = Math.floor(rect.width * dpr)
      c.height = Math.floor(rect.height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      cols = Math.max(1, Math.floor(rect.width / FONT))
      drops = Array.from({ length: cols }, () => ({
        y: Math.floor(Math.random() * (rect.height / FONT)),
        speed: 0.4 + Math.random() * 0.9,
      }))
      ctx.font = `${FONT}px "JetBrains Mono Variable", "Hiragino Kaku Gothic Pro", monospace`
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(c)

    const reduce = prefersReducedMotion()
    if (reduce) return () => { ro.disconnect() }
    const stop = rafLoop((_t, dt) => {
      const rect = c.getBoundingClientRect()
      // trail fade: slight purple residue
      ctx.fillStyle = 'rgba(10, 0, 20, 0.18)'
      ctx.fillRect(0, 0, rect.width, rect.height)

      for (let i = 0; i < cols; i++) {
        const d = drops[i]
        const y = d.y * FONT
        const ch = KATAKANA[Math.floor(Math.random() * KATAKANA.length)]
        ctx.fillStyle = NEON_CYAN + 'b0'
        ctx.fillText(ch, i * FONT, y)
        ctx.fillStyle = '#ffffff'
        ctx.shadowColor = NEON_CYAN
        ctx.shadowBlur = 10
        ctx.fillText(ch, i * FONT, y + FONT)
        ctx.shadowBlur = 0
        if (Math.random() < 0.008) {
          ctx.fillStyle = NEON_MAG
          ctx.shadowColor = NEON_MAG
          ctx.shadowBlur = 12
          ctx.fillText(KATAKANA[Math.floor(Math.random() * KATAKANA.length)], i * FONT, y - FONT * (2 + Math.random() * 3))
          ctx.shadowBlur = 0
        }
        d.y += d.speed * dt * 22
        if (d.y * FONT > rect.height + 40 && Math.random() < 0.025) {
          d.y = -Math.floor(Math.random() * 10)
          d.speed = 0.4 + Math.random() * 0.9
        }
      }
    })
    return () => { ro.disconnect(); stop() }
  }, [])
  return <canvas ref={ref} className="block h-full w-full" />
}

/* ---------- system hud with animated bars ---------- */

type Metric = { label: string; value: number; max: number; suffix: string; color: string }

function HUDBar({ m }: { m: Metric }) {
  const pct = Math.max(0, Math.min(1, m.value / m.max))
  const segs = 24
  const filled = Math.round(pct * segs)
  return (
    <div className="flex items-center gap-3 text-[11px]">
      <span className="w-8 uppercase text-[var(--color-dim)]">{m.label}</span>
      <div className="flex flex-1 gap-[2px]">
        {Array.from({ length: segs }).map((_, i) => (
          <span
            key={i}
            className="h-[10px] flex-1"
            style={{
              background: i < filled ? m.color : 'rgba(255,255,255,0.04)',
              boxShadow: i < filled ? `0 0 6px ${m.color}66` : undefined,
            }}
          />
        ))}
      </div>
      <span className="w-16 text-right tabular-nums text-[var(--color-fg)]">{m.value.toFixed(m.suffix === 'ms' || m.suffix === '%' ? 0 : 1)}{m.suffix}</span>
    </div>
  )
}

function SystemHUD() {
  const [metrics, setMetrics] = useState<Metric[]>([
    { label: 'cpu',  value: 42,   max: 100, suffix: '%',  color: NEON_CYAN },
    { label: 'mem',  value: 67,   max: 100, suffix: '%',  color: NEON_PUR },
    { label: 'net',  value: 88,   max: 100, suffix: '%',  color: NEON_YEL },
    { label: 'gpu',  value: 54,   max: 100, suffix: '%',  color: NEON_MAG },
    { label: 'ping', value: 23,   max: 200, suffix: 'ms', color: NEON_CYAN },
  ])
  useEffect(() => {
    const id = setInterval(() => {
      setMetrics((arr) => arr.map((m) => {
        const drift = (Math.random() - 0.5) * (m.max * 0.08)
        const next = Math.max(m.max * 0.05, Math.min(m.max * 0.99, m.value + drift))
        return { ...m, value: next }
      }))
    }, 380)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="flex flex-col gap-2 p-4">
      {metrics.map((m) => <HUDBar key={m.label} m={m} />)}
      <div className="mt-2 grid grid-cols-3 gap-2 border-t border-[var(--color-line)] pt-3 text-[11px]">
        <StatusLight label="link"   state="ok"    />
        <StatusLight label="auth"   state="ok"    />
        <StatusLight label="firewall" state="warn" />
      </div>
    </div>
  )
}

function StatusLight({ label, state }: { label: string; state: 'ok' | 'warn' | 'err' }) {
  const color = state === 'ok' ? '#00f0a0' : state === 'warn' ? NEON_YEL : NEON_MAG
  return (
    <div className="flex items-center gap-2 text-[var(--color-dim)]">
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
      <span>{label}</span>
      <span className="ml-auto text-[var(--color-fg)]">{state.toUpperCase()}</span>
    </div>
  )
}

/* ---------- scrolling news ticker ---------- */

const HEADLINES = [
  'megacorp merger :: arasaka ⨯ militech — 3.2B eb',
  'patch 2.1 live :: braindance loops fixed · new relic drops',
  'weather :: acid rain over watson district, 22°c',
  'market :: kiroshi optics +4.2% · nicola -0.8%',
  'alert :: unregistered ICE detected @ node_17',
  'rumor :: johnny silverhand spotted in afterlife',
  'traffic :: v9 convoy rerouted via corpo plaza',
  '> wake_up_samurai.exe · you got work to do',
  'broadcast :: night city radio — 105.1 morro rock',
  'patch notes :: synaptic accelerator nerfed -8%',
  'obit :: another saburo · cause: unknown',
  '> ping 127.0.0.1 :: 0.4ms · 0.4ms · 0.4ms',
]

function Ticker() {
  const line = useMemo(() => HEADLINES.join('   ◆   ') + '   ◆   ', [])
  return (
    <div className="relative flex h-full items-center overflow-hidden">
      <div className="flex whitespace-nowrap text-[13px] text-[var(--cyan)]" style={{ animation: 'cyber-ticker 48s linear infinite' }}>
        <span className="px-6">{line}</span>
        <span aria-hidden className="px-6">{line}</span>
      </div>
    </div>
  )
}

/* ---------- skyline with flickering windows ---------- */

const SKYLINE = [
  '                                     ▄                                              ',
  '                          ▄▄▄        █▄▄      ▄▄                                    ',
  '       ▄▄▄               █▓▓█       ▐▓▓▌    ▄▄█▌            ▄▄▄                    ',
  '      █▓▓█▄▄            █▓▓▓█       ▐▓▓▌   ▐▓▓▓▌    ▄▄▄    █▓▓█                    ',
  '     █▓▓▓▓▓█   ▄▄▄      █▓▓▓█       ▐▓▓▌   ▐▓▓▓▌  ▄█▓▓█▄▄ █▓▓▓█   ▄▄               ',
  '    █▓░▓░▓▓█  █▓▓█      █▓░▓█  ▄▄▄  ▐▓░▌   ▐▓░▓▌ █▓▓░▓▓▓█ █▓░▓█   ██▄              ',
  '    █▓▓▓░▓▓█▄▄█▓░█▄▄    █▓▓▓█ █▓▓█▄▄▐▓▓▌▄▄▄▐▓▓▓▌ █▓▓▓▓░▓█ █▓▓▓█   ████▄▄           ',
  '    █▓░▓▓▓▓█▓▓█▓▓█▓█▄▄  █▓░▓█ █▓░▓█ ▐▓░▌▓▓█▐▓░▓▌ █▓░▓▓▓▓█ █▓░▓█   █▓▓▓██▄          ',
  '    █▓▓▓░▓▓█▓▓█▓░█▓▓█▓▄ █▓▓▓█ █▓▓▓█ ▐▓▓▌▓░█▐▓▓▓▌ █▓▓▓░▓▓█ █▓▓▓█   █▓░▓█▓▓▄         ',
  '    ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀       ',
]

function Skyline() {
  const [flick, setFlick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setFlick((f) => f + 1), 420)
    return () => clearInterval(id)
  }, [])
  const lines = useMemo(() => SKYLINE, [])
  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* gradient sky */}
      <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 50% 90%, ${NEON_PUR}22 0%, transparent 60%), linear-gradient(to bottom, transparent 0%, ${NEON_MAG}18 80%, ${NEON_MAG}30 100%)` }} />
      {/* horizon line */}
      <div className="absolute inset-x-0 bottom-[40px] h-px" style={{ background: NEON_MAG, boxShadow: `0 0 14px ${NEON_MAG}` }} />
      {/* flickering dots (windows) */}
      <div className="absolute inset-0 pointer-events-none">
        {Array.from({ length: 18 }).map((_, i) => {
          const seed = (i * 37 + flick * 3) % 100
          const lit = seed < 42
          const color = seed % 3 === 0 ? NEON_YEL : seed % 3 === 1 ? NEON_CYAN : NEON_MAG
          return (
            <span
              key={i}
              className="absolute h-[3px] w-[3px]"
              style={{
                left: `${8 + (i * 67) % 92}%`,
                bottom: `${48 + (i * 13) % 90}px`,
                background: lit ? color : 'transparent',
                boxShadow: lit ? `0 0 6px ${color}` : undefined,
                opacity: lit ? 0.9 : 0,
                transition: 'opacity 200ms ease',
              }}
            />
          )
        })}
      </div>
      <pre className="relative m-0 whitespace-pre pt-6 text-[10px] leading-[1.0]" style={{ color: NEON_PUR, textShadow: `0 0 8px ${NEON_PUR}aa` }}>
        {lines.join('\n')}
      </pre>
    </div>
  )
}

/* ---------- scanlines + noise overlay ---------- */

function CRTOverlay() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'repeating-linear-gradient(to bottom, rgba(255,255,255,0.03) 0 1px, transparent 1px 3px)',
          mixBlendMode: 'overlay',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.4) 100%)`,
        }}
      />
    </>
  )
}

/* ---------- route ---------- */

export default function Cyber() {
  const [now, setNow] = useState(new Date())
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id) }, [])
  const ts = now.toISOString().replace('T', ' · ').slice(0, 19)

  return (
    <div
      className="relative -mx-6 -mt-6 overflow-hidden px-6 pb-10 pt-6 md:-mx-8 md:-mt-8 md:px-8 md:pt-8"
      style={{
        ...CYBER_VARS,
        background: `
          radial-gradient(800px 500px at 20% 15%, ${NEON_PUR}22, transparent 60%),
          radial-gradient(700px 400px at 85% 90%, ${NEON_MAG}1a, transparent 60%),
          #0a0014
        `,
      }}
    >
      <CRTOverlay />

      <div className="relative z-10 flex flex-col gap-6">
        {/* header */}
        <header className="flex flex-col gap-1 pb-2">
          <div className="flex items-baseline justify-between">
            <h1 className="text-[44px] leading-none tracking-[-0.03em]">
              <GlitchText text="cyberdeck // night_city" />
            </h1>
            <span className="text-[11px] tracking-[0.2em]" style={{ color: NEON_CYAN }}>v2.077</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-[var(--color-dim)]">
            <span>chummer @ <span style={{ color: NEON_YEL }}>watson.corpo.plaza</span></span>
            <span className="tabular-nums">{ts} utc</span>
          </div>
        </header>

        {/* top row: rain, system hud */}
        <section className="grid grid-cols-1 gap-5 lg:grid-cols-[2fr_1fr]">
          <Tile label="katakana_rain" code="jp_01" footer={<span style={{ color: NEON_CYAN }}>● stream live</span>}>
            <div className="h-[340px] w-full" style={{ background: '#08001a' }}>
              <KatakanaRain />
            </div>
          </Tile>
          <Tile label="system_hud" code="sys_02" footer={<span>drift ±8% every 380ms</span>}>
            <SystemHUD />
          </Tile>
        </section>

        {/* ticker */}
        <section>
          <Tile label="net_feed" code="rss_03" footer={<span>◆ unfiltered · uncensored · unpaid</span>}>
            <div className="h-[56px] border-y border-[var(--color-line)]" style={{ background: `linear-gradient(to right, transparent, ${NEON_CYAN}08, transparent)` }}>
              <Ticker />
            </div>
          </Tile>
        </section>

        {/* skyline */}
        <section>
          <Tile label="skyline" code="env_04" footer={<span style={{ color: NEON_MAG }}>night city · kabuki district</span>}>
            <div className="h-[260px]">
              <Skyline />
            </div>
          </Tile>
        </section>

        {/* bottom row: three compact panels */}
        <section className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <Tile label="agents" code="agt_05">
            <div className="flex flex-col gap-2 p-4 text-[12px]">
              {[
                { n: 'silverhand.j', s: 'online',  c: NEON_YEL },
                { n: 'alt.cunningham', s: 'ghost',  c: NEON_PUR },
                { n: 'lucy.k',         s: 'netrunning', c: NEON_CYAN },
                { n: 'rebecca.a',      s: 'edgerun',    c: NEON_MAG },
                { n: 'takemura.g',     s: 'offline',    c: '#444' },
              ].map((a) => (
                <div key={a.n} className="flex items-center justify-between border-b border-[var(--color-line)] pb-1 last:border-0">
                  <span className="text-[var(--color-fg)]">{a.n}</span>
                  <span style={{ color: a.c }}>{a.s}</span>
                </div>
              ))}
            </div>
          </Tile>

          <Tile label="intrusion_log" code="log_06">
            <pre className="m-0 whitespace-pre-wrap p-4 text-[11px] leading-[1.6]" style={{ color: NEON_CYAN }}>
{`[23:41:08] scanning node_17...
[23:41:09] ICE detected · tier 3
[23:41:12] daemon.sniper deployed
[23:41:14] → bypass ok
[23:41:16] extracted 12mb
[23:41:18] cleanup trace · done`}
            </pre>
          </Tile>

          <Tile label="weapon_bench" code="wep_07">
            <div className="flex flex-col gap-2 p-4 text-[12px]">
              {[
                { w: 'malorian 3516',  k: 'power',    d: 92, c: NEON_YEL },
                { w: 'satara',         k: 'tech',     d: 74, c: NEON_CYAN },
                { w: 'hakamura mk.v',  k: 'smart',    d: 81, c: NEON_MAG },
                { w: 'katana · jinchu-maru', k: 'melee', d: 68, c: NEON_PUR },
              ].map((x) => (
                <div key={x.w} className="flex items-center gap-2">
                  <span className="flex-1 text-[var(--color-fg)]">{x.w}</span>
                  <span className="text-[11px] text-[var(--color-dim)]">{x.k}</span>
                  <div className="flex gap-[1px]">
                    {Array.from({ length: 10 }).map((_, i) => (
                      <span key={i} className="h-[8px] w-[4px]" style={{ background: i < Math.round(x.d / 10) ? x.c : 'rgba(255,255,255,0.06)', boxShadow: i < Math.round(x.d / 10) ? `0 0 4px ${x.c}88` : undefined }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Tile>
        </section>

        {/* bottom footer */}
        <footer className="flex items-center justify-between pb-2 text-[11px] text-[var(--color-dim)]">
          <span>{'> '}<span style={{ color: NEON_CYAN }}>wake_up_samurai.exe</span> — you got work to do</span>
          <span>compiled · <span style={{ color: NEON_YEL }}>pirte://cyber</span></span>
        </footer>
      </div>

      <style>{`
        @keyframes cyber-ticker {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  )
}
