// warm supersaw pad. 5 detuned saws → lpf → long attack/release envelope.
// good for atmospheric chord stabs and washes.

import type { Voice, VoiceTriggerArgs } from './voice'
import { mtof } from './voice'

export class PadVoice implements Voice {
  readonly output: GainNode
  private ctx: AudioContext

  constructor(ctx: AudioContext) {
    this.ctx = ctx
    this.output = ctx.createGain()
    this.output.gain.value = 0.5
  }

  dispose() { try { this.output.disconnect() } catch { /* */ } }

  trigger({ time, note, vel, gate, params }: VoiceTriggerArgs) {
    const ctx = this.ctx
    const detune = params?.detune ?? 14        // cents
    const cutoff = params?.cutoff ?? 1600
    const attack = params?.attack ?? 0.3
    const release = params?.release ?? 0.7
    const freq = mtof(note)

    const mix = ctx.createGain()
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'
    lp.frequency.value = cutoff; lp.Q.value = 0.6

    const oscs: OscillatorNode[] = []
    const offsets = [-2, -1, 0, 1, 2]
    for (const o of offsets) {
      const osc = ctx.createOscillator()
      osc.type = 'sawtooth'
      osc.frequency.value = freq
      osc.detune.value = o * detune
      const g = ctx.createGain(); g.gain.value = 1 / offsets.length
      osc.connect(g).connect(mix)
      oscs.push(osc)
    }

    mix.connect(lp)

    const env = ctx.createGain()
    env.gain.setValueAtTime(0.0001, time)
    env.gain.linearRampToValueAtTime(vel, time + attack)
    const rel = time + Math.max(attack, gate)
    env.gain.setValueAtTime(env.gain.value, rel)
    env.gain.exponentialRampToValueAtTime(0.0001, rel + release)

    lp.connect(env).connect(this.output)
    const end = rel + release + 0.05
    for (const osc of oscs) { osc.start(time); osc.stop(end) }
  }
}
