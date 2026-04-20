// 2-op fm synth. carrier + modulator, adjustable ratio + index + feedback
// + envelope. classic bell/pluck/brass territory.

import type { Voice, VoiceTriggerArgs } from './voice'
import { mtof } from './voice'

export class FmVoice implements Voice {
  readonly output: GainNode
  private ctx: AudioContext

  constructor(ctx: AudioContext) {
    this.ctx = ctx
    this.output = ctx.createGain()
    this.output.gain.value = 0.8
  }

  dispose() { try { this.output.disconnect() } catch { /* */ } }

  trigger({ time, note, vel, gate, params }: VoiceTriggerArgs) {
    const ctx = this.ctx
    const ratio = params?.ratio ?? 2        // modulator : carrier frequency ratio
    const index = params?.index ?? 180      // modulation index in Hz
    const feedback = params?.feedback ?? 0  // 0..1
    const attack = params?.attack ?? 0.005
    const decay = params?.decay ?? 0.2
    const sustain = params?.sustain ?? 0.3
    const release = params?.release ?? 0.2

    const baseFreq = mtof(note)

    const carrier = ctx.createOscillator(); carrier.type = 'sine'; carrier.frequency.value = baseFreq
    const modulator = ctx.createOscillator(); modulator.type = 'sine'; modulator.frequency.value = baseFreq * ratio
    const modGain = ctx.createGain()
    modGain.gain.setValueAtTime(index, time)
    modGain.gain.exponentialRampToValueAtTime(Math.max(0.01, index * 0.1), time + decay)

    // fm: modulator.out → modGain → carrier.frequency
    modulator.connect(modGain).connect(carrier.frequency)

    // simple feedback loop: carrier feeds back into modulator
    if (feedback > 0) {
      const fbGain = ctx.createGain()
      fbGain.gain.value = feedback * 400
      carrier.connect(fbGain).connect(modulator.frequency)
    }

    const env = ctx.createGain()
    env.gain.setValueAtTime(0.0001, time)
    env.gain.linearRampToValueAtTime(vel, time + attack)
    env.gain.exponentialRampToValueAtTime(Math.max(0.0001, vel * sustain), time + attack + decay)
    const releaseStart = time + Math.max(attack + decay, gate)
    env.gain.setValueAtTime(env.gain.value, releaseStart)
    env.gain.exponentialRampToValueAtTime(0.0001, releaseStart + release)

    carrier.connect(env).connect(this.output)
    const endT = releaseStart + release + 0.05
    carrier.start(time); carrier.stop(endT)
    modulator.start(time); modulator.stop(endT)
  }
}
