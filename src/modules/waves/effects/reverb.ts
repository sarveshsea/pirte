// algorithmic reverb via a synthesized exponential-decay impulse response
// fed into a ConvolverNode. cheap + decent sounding for ambient/plate work.

import type { ReverbParams } from '../types'

export class Reverb {
  readonly input: GainNode
  readonly output: GainNode
  private ctx: AudioContext
  private convolver: ConvolverNode
  private wet: GainNode
  private dry: GainNode
  private bypass: GainNode

  constructor(ctx: AudioContext) {
    this.ctx = ctx
    this.input = ctx.createGain()
    this.output = ctx.createGain()
    this.convolver = ctx.createConvolver()
    this.bypass = ctx.createGain()
    this.dry = ctx.createGain(); this.dry.gain.value = 1
    this.wet = ctx.createGain(); this.wet.gain.value = 0

    this.input.connect(this.bypass)
    this.bypass.connect(this.dry).connect(this.output)
    this.input.connect(this.convolver).connect(this.wet).connect(this.output)

    this.setParams({ size: 0.6, damp: 0.4, width: 1, mix: 0 })
  }

  setParams(p: ReverbParams) {
    this.convolver.buffer = this.buildIR(p.size, p.damp, p.width)
    const mix = Math.max(0, Math.min(1, p.mix))
    this.dry.gain.value = 1 - mix
    this.wet.gain.value = mix
  }

  private buildIR(size: number, damp: number, width: number): AudioBuffer {
    const sr = this.ctx.sampleRate
    const seconds = 0.4 + size * 4      // 0.4..4.4s tail
    const len = Math.floor(sr * seconds)
    const buf = this.ctx.createBuffer(2, len, sr)
    const decay = 1 - damp * 0.95        // bigger damp = faster decay
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch)
      const widthBias = ch === 0 ? 1 : 1 - width * 0.4 // narrow the right channel for stereo feel
      for (let i = 0; i < len; i++) {
        const t = i / len
        // multi-tap cluster for early reflections then a smooth decay tail
        const taps =
          (i === 0 ? 1 : 0) +
          (i === Math.floor(sr * 0.01) ? 0.6 : 0) +
          (i === Math.floor(sr * 0.017) ? 0.5 : 0)
        const noise = Math.random() * 2 - 1
        data[i] = (taps + noise * (1 - t * 0.3)) * Math.pow(decay, i / sr * 10) * widthBias
      }
    }
    return buf
  }

  dispose() {
    try {
      this.input.disconnect()
      this.convolver.disconnect()
      this.dry.disconnect()
      this.wet.disconnect()
      this.bypass.disconnect()
      this.output.disconnect()
    } catch { /* */ }
  }
}
