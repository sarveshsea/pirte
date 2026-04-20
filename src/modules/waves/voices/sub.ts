// deep sub-bass: fundamental + optional octave-down. clean sine core, gentle
// lpf envelope for "round" attack. good for trap/dnb low-end.

import type { Voice, VoiceTriggerArgs } from './voice'
import { mtof } from './voice'

export class SubVoice implements Voice {
  readonly output: GainNode
  private ctx: AudioContext

  constructor(ctx: AudioContext) {
    this.ctx = ctx
    this.output = ctx.createGain()
    this.output.gain.value = 0.9
  }

  dispose() { try { this.output.disconnect() } catch { /* */ } }

  trigger({ time, note, vel, gate, params }: VoiceTriggerArgs) {
    const ctx = this.ctx
    const octaveDown = (params?.octaveDown ?? 0.3)    // 0..1 mix of -12
    const attack = params?.attack ?? 0.004
    const release = params?.release ?? 0.1
    const freq = mtof(note)

    const fund = ctx.createOscillator(); fund.type = 'sine'; fund.frequency.value = freq
    const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = freq / 2
    const subGain = ctx.createGain(); subGain.gain.value = octaveDown

    const mix = ctx.createGain()
    fund.connect(mix)
    sub.connect(subGain).connect(mix)

    const env = ctx.createGain()
    env.gain.setValueAtTime(0.0001, time)
    env.gain.linearRampToValueAtTime(vel, time + attack)
    const releaseStart = time + Math.max(attack, gate)
    env.gain.setValueAtTime(env.gain.value, releaseStart)
    env.gain.exponentialRampToValueAtTime(0.0001, releaseStart + release)

    mix.connect(env).connect(this.output)
    const end = releaseStart + release + 0.02
    fund.start(time); fund.stop(end)
    sub.start(time); sub.stop(end)
  }
}
