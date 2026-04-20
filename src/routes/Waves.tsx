import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Tile from '../components/Tile'
import Slider from '../components/Slider'
import { SynthEngine, TRACKS, STEPS, keyToFreq, type Track } from '../modules/synth'
import { rafLoop } from '../lib/rafLoop'

const DEFAULT_PATTERN: Record<Track, number[]> = {
  kick:  [0, 4, 8, 12],
  snare: [4, 12],
  hat:   [0, 2, 4, 6, 8, 10, 12, 14],
  bass:  [0, 3, 6, 8, 11, 14],
}

// encode/decode pattern as 16-char hex: 4 tracks × 4-char uint16 mask
function encodePattern(p: Record<Track, boolean[]>): string {
  return TRACKS.map((t) => {
    let mask = 0
    for (let i = 0; i < STEPS; i++) if (p[t][i]) mask |= 1 << i
    return mask.toString(16).padStart(4, '0')
  }).join('')
}
function decodePattern(s: string | null): Record<Track, boolean[]> | null {
  if (!s || s.length !== 16) return null
  const out = {} as Record<Track, boolean[]>
  for (let t = 0; t < TRACKS.length; t++) {
    const chunk = s.slice(t * 4, t * 4 + 4)
    const mask = parseInt(chunk, 16)
    if (!Number.isFinite(mask)) return null
    const arr = new Array(STEPS).fill(false)
    for (let i = 0; i < STEPS; i++) arr[i] = !!(mask & (1 << i))
    out[TRACKS[t]] = arr
  }
  return out
}

export default function Waves() {
  const [params, setParams] = useSearchParams()
  const engineRef = useRef<SynthEngine | null>(null)
  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [step, setStep] = useState(0)
  const [bpm, setBpm] = useState(() => {
    const v = parseInt(params.get('bpm') ?? '', 10)
    return Number.isFinite(v) && v >= 60 && v <= 180 ? v : 120
  })
  const [swing, setSwing] = useState(() => {
    const v = parseFloat(params.get('sw') ?? '')
    return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 0
  })
  const [muted, setMuted] = useState(false)
  const [patternsVersion, setPatternsVersion] = useState(0)
  const scopeRef = useRef<HTMLPreElement>(null)
  const specRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    const eng = new SynthEngine()
    const fromUrl = decodePattern(params.get('p'))
    if (fromUrl) {
      for (const t of TRACKS) eng.patterns[t] = fromUrl[t]
    } else {
      for (const t of TRACKS) for (const s of DEFAULT_PATTERN[t]) eng.patterns[t][s] = true
    }
    eng.bpm = bpm
    eng.swing = swing
    eng.setOnStep((s) => setStep(s))
    engineRef.current = eng
    setReady(true)
    return () => {
      eng.stop()
      // fully release the audio context so nav-away leaves no scheduled silence
      if (eng.ctx.state !== 'closed') eng.ctx.close().catch(() => {})
      engineRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // debounced URL sync for bpm/swing/pattern
  useEffect(() => {
    const t = setTimeout(() => {
      const eng = engineRef.current
      if (!eng) return
      setParams((p) => {
        p.set('bpm', String(bpm))
        p.set('sw', swing.toFixed(2))
        p.set('p', encodePattern(eng.patterns))
        return p
      }, { replace: true })
    }, 400)
    return () => clearTimeout(t)
  }, [bpm, swing, patternsVersion, setParams])

  useEffect(() => { if (engineRef.current) engineRef.current.bpm = bpm }, [bpm])
  useEffect(() => { if (engineRef.current) engineRef.current.swing = swing }, [swing])
  useEffect(() => {
    const eng = engineRef.current
    if (!eng) return
    const target = muted ? 0 : 0.7
    eng.out.gain.setTargetAtTime(target, eng.ctx.currentTime, 0.02)
  }, [muted, ready])

  // visualizer: ASCII oscilloscope + tiny ASCII spectrum
  useEffect(() => {
    if (!ready) return
    const eng = engineRef.current!
    const timeBuf = new Uint8Array(new ArrayBuffer(eng.analyser.fftSize))
    const freqBuf = new Uint8Array(new ArrayBuffer(eng.analyser.frequencyBinCount))

    const render = () => {
      // OSCILLOSCOPE — build a cols × rows grid where each column is a sample of the waveform
      if (scopeRef.current) {
        eng.readTimeDomain(timeBuf)
        const cols = 120
        const rows = 14
        const grid: string[][] = Array.from({ length: rows }, () => Array(cols).fill(' '))
        const zero = Math.floor(rows / 2)
        for (let x = 0; x < cols; x++) {
          const sampleIdx = Math.floor((x / cols) * timeBuf.length)
          const v = timeBuf[sampleIdx] / 128.0 - 1
          const y = Math.max(0, Math.min(rows - 1, Math.round(zero - v * zero)))
          grid[y][x] = '█'
          // draw fill from zero line
          const lo = Math.min(zero, y), hi = Math.max(zero, y)
          for (let k = lo; k <= hi; k++) if (grid[k][x] === ' ') grid[k][x] = '·'
        }
        scopeRef.current.textContent = grid.map((r) => r.join('')).join('\n')
      }

      // SPECTRUM — bottom-aligned bars
      if (specRef.current) {
        eng.readFrequency(freqBuf)
        const cols = 120
        const rows = 6
        const grid: string[][] = Array.from({ length: rows }, () => Array(cols).fill(' '))
        const ramp = ' ▁▂▃▄▅▆▇█'
        for (let x = 0; x < cols; x++) {
          const i = Math.floor(Math.pow(x / cols, 1.8) * (freqBuf.length / 3))
          const v = freqBuf[i] / 255
          const filled = v * rows
          for (let y = 0; y < rows; y++) {
            const row = rows - 1 - y
            const f = Math.max(0, Math.min(1, filled - y))
            grid[row][x] = ramp[Math.floor(f * (ramp.length - 1))]
          }
        }
        specRef.current.textContent = grid.map((r) => r.join('')).join('\n')
      }
    }
    return rafLoop(render)
  }, [ready])

  // keyboard synth + transport
  useEffect(() => {
    const down = new Set<string>()
    const onDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.key === ' ') { e.preventDefault(); toggle(); return }
      if (e.key.toLowerCase() === 'c') { engineRef.current?.clear(); setPatternsVersion((v) => v + 1); return }
      if (e.key.toLowerCase() === 'r') { engineRef.current?.randomize(); setPatternsVersion((v) => v + 1); return }
      if (down.has(e.key)) return
      const freq = keyToFreq(e.key)
      if (freq && engineRef.current) {
        if (engineRef.current.ctx.state === 'suspended') engineRef.current.ctx.resume()
        engineRef.current.lead(freq)
        down.add(e.key)
      }
    }
    const onUp = (e: KeyboardEvent) => down.delete(e.key)
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
    /* eslint-disable-next-line */
  }, [playing])

  const toggle = async () => {
    const eng = engineRef.current
    if (!eng) return
    if (eng.isPlaying) { eng.stop(); setPlaying(false) }
    else { await eng.start(); setPlaying(true) }
  }

  const toggleCell = (t: Track, s: number) => {
    engineRef.current?.toggle(t, s)
    setPatternsVersion((v) => v + 1)
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
      <div className="flex flex-col gap-6">
        <Tile label="waves · oscilloscope" code="09" footer={<span>step {String(step + 1).padStart(2, '0')}/{STEPS}  ·  {bpm} bpm{swing > 0 ? `  ·  swing ${(swing * 100).toFixed(0)}%` : ''}</span>}>
          <div className="p-2">
            <pre ref={scopeRef} className="m-0 whitespace-pre text-[13px] leading-[1.0] text-[var(--color-fg)]" />
            <pre ref={specRef}  className="m-0 mt-2 whitespace-pre text-[13px] leading-[1.0] text-[var(--color-dim)]" />
          </div>
        </Tile>

        <Tile label="sequencer" footer={<span>space play · c clear · r randomize · a-; play synth notes</span>}>
          <div className="flex flex-col gap-2 p-3">
            {TRACKS.map((t) => (
              <div key={t} className="grid grid-cols-[80px_1fr] items-center gap-3">
                <span className="text-[13px] tracking-[0.1em] text-[var(--color-dim)]">{t}</span>
                <div className="grid grid-cols-[repeat(16,minmax(0,1fr))] gap-1">
                  {Array.from({ length: STEPS }).map((_, s) => {
                    const on = engineRef.current?.patterns[t][s] ?? false
                    const isCurrent = playing && s === step
                    return (
                      <button
                        key={s}
                        data-interactive
                        onClick={() => toggleCell(t, s)}
                        className={`!p-0 aspect-square min-h-[22px] text-[12px] ${on ? '!border-[var(--color-fg)] bg-[var(--color-fg)] text-[var(--color-bg)]' : '!border-[var(--color-line)] text-[var(--color-dim)] hover:!border-[var(--color-dim)]'} ${isCurrent ? 'ring-1 ring-[var(--color-fg)]' : ''}`}
                        title={`${t} ${s + 1}`}
                      >
                        {s % 4 === 0 ? (s / 4 + 1) : ''}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </Tile>
        <span className="hidden">{patternsVersion}</span>
      </div>

      <div className="flex flex-col gap-6">
        <Tile label="transport">
          <div className="flex flex-col gap-2 p-3 text-[13px] tracking-[0.06em]">
            <button data-interactive onClick={toggle}>{playing ? '■ stop' : '▶ play'}</button>
            <button data-interactive onClick={() => setMuted((m) => !m)}>{muted ? '🔈 unmute' : '🔇 mute'}</button>
            <button data-interactive onClick={() => { engineRef.current?.randomize(); setPatternsVersion((v) => v + 1) }}>randomize</button>
            <button data-interactive onClick={() => { engineRef.current?.clear(); setPatternsVersion((v) => v + 1) }}>clear</button>
          </div>
        </Tile>
        <Tile label="tempo">
          <div className="flex flex-col gap-3 p-3">
            <Slider label="bpm"   min={60} max={180} step={1} value={bpm}   onChange={setBpm} />
            <Slider label="swing" min={0}  max={1}   step={0.02} value={swing} onChange={setSwing} format={(v) => `${(v * 100).toFixed(0)}%`} />
          </div>
        </Tile>
        <Tile label="synth keys" footer={<span>monophonic saw + filter envelope</span>}>
          <pre className="m-0 whitespace-pre p-3 text-[13px] leading-[1.4] text-[var(--color-dim)]">{`
 w e   t y u   o p
a s d f g h j k l ;

A = A3 · each key = semitone
sustain via hold, release on keyup
`}</pre>
        </Tile>
      </div>
    </div>
  )
}
