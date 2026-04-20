// stereo tap-delay: left-then-right ping-pong with feedback, plus a "tone"
// lowpass in the feedback loop to make each repeat a little darker.

import type { DelayParams } from '../types'

export class TapeDelay {
  readonly input: GainNode
  readonly output: GainNode
  private ctx: AudioContext
  private splitter: ChannelSplitterNode
  private merger: ChannelMergerNode
  private delayL: DelayNode
  private delayR: DelayNode
  private feedback: GainNode
  private toneFilter: BiquadFilterNode
  private wet: GainNode
  private dry: GainNode

  constructor(ctx: AudioContext) {
    this.ctx = ctx
    this.input = ctx.createGain()
    this.output = ctx.createGain()
    this.splitter = ctx.createChannelSplitter(2)
    this.merger = ctx.createChannelMerger(2)
    this.delayL = ctx.createDelay(2)
    this.delayR = ctx.createDelay(2)
    this.feedback = ctx.createGain(); this.feedback.gain.value = 0
    this.toneFilter = ctx.createBiquadFilter()
    this.toneFilter.type = 'lowpass'
    this.toneFilter.frequency.value = 6000
    this.toneFilter.Q.value = 0.4
    this.wet = ctx.createGain(); this.wet.gain.value = 0
    this.dry = ctx.createGain(); this.dry.gain.value = 1

    // dry path
    this.input.connect(this.dry).connect(this.output)
    // wet path (ping-pong): L in → delayL → merger(L) + delayR → merger(R) + feedback
    this.input.connect(this.splitter)
    this.splitter.connect(this.delayL, 0)
    this.splitter.connect(this.delayR, 1)
    // cross-feed for ping-pong
    this.delayL.connect(this.toneFilter).connect(this.feedback).connect(this.delayR)
    this.delayR.connect(this.toneFilter)        // shared tone lpf (cheap, fine)
    this.delayL.connect(this.merger, 0, 0)
    this.delayR.connect(this.merger, 0, 1)
    this.merger.connect(this.wet).connect(this.output)
  }

  setParams(p: DelayParams) {
    const t = Math.max(0.02, Math.min(2, p.time))
    this.delayL.delayTime.setTargetAtTime(t, this.ctx.currentTime, 0.02)
    this.delayR.delayTime.setTargetAtTime(t, this.ctx.currentTime, 0.02)
    this.feedback.gain.setTargetAtTime(Math.max(0, Math.min(0.95, p.feedback)), this.ctx.currentTime, 0.02)
    this.toneFilter.frequency.setTargetAtTime(400 + Math.max(0, Math.min(1, p.tone)) * 11600, this.ctx.currentTime, 0.05)
    const mix = Math.max(0, Math.min(1, p.mix))
    this.dry.gain.value = 1 - mix
    this.wet.gain.value = mix
  }

  dispose() {
    try {
      this.input.disconnect()
      this.splitter.disconnect()
      this.delayL.disconnect()
      this.delayR.disconnect()
      this.feedback.disconnect()
      this.toneFilter.disconnect()
      this.wet.disconnect()
      this.dry.disconnect()
      this.merger.disconnect()
      this.output.disconnect()
    } catch { /* */ }
  }
}
