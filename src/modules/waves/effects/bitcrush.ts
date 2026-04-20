// bitcrush + sample-rate reduction via WaveShaper (bit depth) + a downsample
// zero-order-hold implemented with a ScriptProcessorNode. audio-worklet would
// be cleaner but adds boilerplate; ScriptProcessor is deprecated-but-works in
// every browser pirte supports.

import type { BitcrushParams } from '../types'

export class Bitcrush {
  readonly input: GainNode
  readonly output: GainNode
  private waveshaper: WaveShaperNode
  private processor: ScriptProcessorNode
  private wet: GainNode
  private dry: GainNode
  private downsample = 1   // 1 = no downsample
  private counter = 0
  private lastSample = [0, 0]

  constructor(ctx: AudioContext) {
    this.input = ctx.createGain()
    this.output = ctx.createGain()
    this.waveshaper = ctx.createWaveShaper()
    this.processor = ctx.createScriptProcessor(512, 2, 2)
    this.wet = ctx.createGain(); this.wet.gain.value = 0
    this.dry = ctx.createGain(); this.dry.gain.value = 1

    this.setBits(16)

    // dry path
    this.input.connect(this.dry).connect(this.output)
    // wet path: waveshaper → script processor (downsample) → wet
    this.input.connect(this.waveshaper).connect(this.processor).connect(this.wet).connect(this.output)

    this.processor.onaudioprocess = (e) => {
      const inL = e.inputBuffer.getChannelData(0)
      const inR = e.inputBuffer.numberOfChannels > 1 ? e.inputBuffer.getChannelData(1) : inL
      const outL = e.outputBuffer.getChannelData(0)
      const outR = e.outputBuffer.getChannelData(1)
      const step = this.downsample
      for (let i = 0; i < inL.length; i++) {
        if (this.counter <= 0) {
          this.lastSample[0] = inL[i]
          this.lastSample[1] = inR[i]
          this.counter = step
        }
        outL[i] = this.lastSample[0]
        outR[i] = this.lastSample[1]
        this.counter--
      }
    }
    // processor needs to drain; connecting to output is enough
  }

  setParams(p: BitcrushParams) {
    this.setBits(p.bits)
    this.downsample = Math.max(1, Math.floor(p.downsample))
    const mix = Math.max(0, Math.min(1, p.mix))
    this.dry.gain.value = 1 - mix
    this.wet.gain.value = mix
  }

  private setBits(bits: number) {
    const steps = Math.pow(2, Math.max(1, Math.min(16, bits)))
    const n = 2048
    const curve = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1
      curve[i] = Math.round(x * steps) / steps
    }
    this.waveshaper.curve = curve as Float32Array<ArrayBuffer>
  }

  dispose() {
    try {
      this.input.disconnect()
      this.waveshaper.disconnect()
      this.processor.disconnect()
      this.processor.onaudioprocess = null
      this.wet.disconnect()
      this.dry.disconnect()
      this.output.disconnect()
    } catch { /* */ }
  }
}
