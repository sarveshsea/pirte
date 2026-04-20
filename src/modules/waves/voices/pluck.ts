// karplus-strong plucked string. noise burst through a feedback delay loop
// with a low-pass filter that decays the high frequencies.

import type { Voice, VoiceTriggerArgs } from './voice'
import { mtof } from './voice'

export class PluckVoice implements Voice {
  readonly output: GainNode
  private ctx: AudioContext
  private noise: AudioBuffer

  constructor(ctx: AudioContext) {
    this.ctx = ctx
    this.output = ctx.createGain()
    this.output.gain.value = 0.7
    const sr = ctx.sampleRate
    const len = Math.floor(sr * 0.02)
    const buf = ctx.createBuffer(1, len, sr)
    const ch = buf.getChannelData(0)
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len)
    this.noise = buf
  }

  dispose() { try { this.output.disconnect() } catch { /* */ } }

  trigger({ time, note, vel, params }: VoiceTriggerArgs) {
    const ctx = this.ctx
    const freq = mtof(note)
    const decayTime = params?.decay ?? 1.5
    const damp = params?.damp ?? 0.3       // 0=bright, 1=dark

    const delayTime = 1 / freq
    const delay = ctx.createDelay(1)
    delay.delayTime.value = delayTime
    const fb = ctx.createGain()
    // rough damping — feedback coefficient targeting decayTime
    const totalCycles = freq * decayTime
    fb.gain.value = Math.pow(0.001, 1 / Math.max(1, totalCycles))

    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'
    lp.frequency.value = 12000 - damp * 11000
    lp.Q.value = 0.7

    // feedback loop: delay → lp → fb → delay
    delay.connect(lp).connect(fb).connect(delay)

    // excite with noise burst
    const src = ctx.createBufferSource(); src.buffer = this.noise
    const excG = ctx.createGain(); excG.gain.value = vel
    src.connect(excG).connect(delay)

    // out tap
    delay.connect(this.output)

    src.start(time)
    src.stop(time + 0.02)

    // kill the loop after the decay by ramping feedback to 0
    fb.gain.setValueAtTime(fb.gain.value, time + decayTime * 0.85)
    fb.gain.exponentialRampToValueAtTime(0.0001, time + decayTime + 0.2)
  }
}
