// wavetable scanner. picks between a small set of PeriodicWave "tables"
// via a position param and blends two adjacent tables at schedule time.
// cheap — two oscillators per note, morph is set-and-forget per trigger.

import type { Voice, VoiceTriggerArgs } from './voice'
import { mtof } from './voice'

const TABLES: { real: Float32Array; imag: Float32Array }[] = [
  // 0: sawtooth (odd+even harmonics)
  buildTable(24, (n) => 1 / n),
  // 1: soft saw (rolled-off)
  buildTable(12, (n) => (1 / n) * Math.exp(-n * 0.1)),
  // 2: square
  buildTable(24, (n) => (n % 2 === 1 ? 1 / n : 0)),
  // 3: vocal-ish: emphasize 1,2,3,5
  buildTable(8,  (n) => [0, 1, 0.7, 0.5, 0, 0.35, 0, 0.25][n] ?? 0),
  // 4: nasal: 1, 3, 7
  buildTable(9,  (n) => n === 1 ? 1 : n === 3 ? 0.5 : n === 7 ? 0.3 : 0),
  // 5: bell-ish inharmonic-ish
  buildTable(12, (n) => n === 1 ? 1 : n === 5 ? 0.45 : n === 9 ? 0.22 : 0),
  // 6: hollow: 1, 2, 4
  buildTable(8,  (n) => n === 1 ? 1 : n === 2 ? 0.5 : n === 4 ? 0.25 : 0),
  // 7: sine (fundamental only)
  buildTable(1,  (n) => (n === 1 ? 1 : 0)),
]

function buildTable(h: number, fn: (n: number) => number) {
  const real = new Float32Array(h + 1)
  const imag = new Float32Array(h + 1)
  for (let n = 1; n <= h; n++) imag[n] = fn(n)
  return { real, imag }
}

export class WavetableVoice implements Voice {
  readonly output: GainNode
  private ctx: AudioContext
  private waves: PeriodicWave[]

  constructor(ctx: AudioContext) {
    this.ctx = ctx
    this.output = ctx.createGain()
    this.output.gain.value = 0.7
    this.waves = TABLES.map((t) => ctx.createPeriodicWave(t.real, t.imag, { disableNormalization: false }))
  }

  dispose() { try { this.output.disconnect() } catch { /* */ } }

  trigger({ time, note, vel, gate, params }: VoiceTriggerArgs) {
    const ctx = this.ctx
    const position = Math.max(0, Math.min(1, params?.position ?? 0))  // 0..1 over the table set
    const attack = params?.attack ?? 0.003
    const decay = params?.decay ?? 0.12
    const sustain = params?.sustain ?? 0.5
    const release = params?.release ?? 0.12
    const cutoff = params?.cutoff ?? 3000
    const freq = mtof(note)

    const maxIdx = this.waves.length - 1
    const pos = position * maxIdx
    const lower = Math.floor(pos)
    const upper = Math.min(maxIdx, lower + 1)
    const blend = pos - lower

    const a = ctx.createOscillator(); a.setPeriodicWave(this.waves[lower]); a.frequency.value = freq
    const b = ctx.createOscillator(); b.setPeriodicWave(this.waves[upper]); b.frequency.value = freq
    const ag = ctx.createGain(); ag.gain.value = 1 - blend
    const bg = ctx.createGain(); bg.gain.value = blend

    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'
    lp.frequency.value = cutoff; lp.Q.value = 0.6

    a.connect(ag).connect(lp)
    b.connect(bg).connect(lp)

    const env = ctx.createGain()
    env.gain.setValueAtTime(0.0001, time)
    env.gain.linearRampToValueAtTime(vel, time + attack)
    env.gain.exponentialRampToValueAtTime(Math.max(0.0001, vel * sustain), time + attack + decay)
    const rel = time + Math.max(attack + decay, gate)
    env.gain.setValueAtTime(env.gain.value, rel)
    env.gain.exponentialRampToValueAtTime(0.0001, rel + release)

    lp.connect(env).connect(this.output)
    const end = rel + release + 0.03
    a.start(time); a.stop(end)
    b.start(time); b.stop(end)
  }
}
