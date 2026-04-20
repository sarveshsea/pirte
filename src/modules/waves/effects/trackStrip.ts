// per-track signal chain:
//
//   input → drive → filter → gain → pan → splitter → analyserL + analyserR → merger → output
//                                                 ↘ sendA (→ reverb bus)
//                                                 ↘ sendB (→ delay bus)
//
// the splitter/analyser stereo pair is only here to drive the VU; the audio
// itself is recombined via the merger so downstream hears normal stereo.

import type { FilterType } from '../types'

export class TrackStrip {
  readonly input: GainNode
  readonly output: GainNode
  private ctx: AudioContext
  private drive: WaveShaperNode
  private driveBypass: GainNode
  private driveWet: GainNode
  private filter: BiquadFilterNode
  private volume: GainNode
  private panner: StereoPannerNode
  private splitter: ChannelSplitterNode
  private analyserL: AnalyserNode
  private analyserR: AnalyserNode
  private merger: ChannelMergerNode
  private sendA: GainNode
  private sendB: GainNode

  private buf = new Uint8Array(128)

  // cached state (so setMute + setSolo can recompute final gain without arg juggling)
  private userGain = 0.8
  private muted = false
  private soloActive = false
  private isSolo = false

  constructor(ctx: AudioContext, reverbIn: AudioNode, delayIn: AudioNode) {
    this.ctx = ctx
    this.input = ctx.createGain()
    this.input.gain.value = 1

    // drive: parallel dry + shaper via wet/dry mix
    this.drive = ctx.createWaveShaper()
    this.drive.curve = makeDriveCurve(0) as Float32Array<ArrayBuffer>
    this.drive.oversample = '2x'
    this.driveBypass = ctx.createGain(); this.driveBypass.gain.value = 1
    this.driveWet = ctx.createGain(); this.driveWet.gain.value = 0

    this.filter = ctx.createBiquadFilter()
    this.filter.type = 'lowpass'
    this.filter.frequency.value = 20000
    this.filter.Q.value = 0.3

    this.volume = ctx.createGain(); this.volume.gain.value = this.userGain
    this.panner = ctx.createStereoPanner()

    this.splitter = ctx.createChannelSplitter(2)
    this.analyserL = ctx.createAnalyser(); this.analyserL.fftSize = 256; this.analyserL.smoothingTimeConstant = 0.5
    this.analyserR = ctx.createAnalyser(); this.analyserR.fftSize = 256; this.analyserR.smoothingTimeConstant = 0.5
    this.merger = ctx.createChannelMerger(2)

    this.output = ctx.createGain(); this.output.gain.value = 1

    this.sendA = ctx.createGain(); this.sendA.gain.value = 0
    this.sendB = ctx.createGain(); this.sendB.gain.value = 0

    // wire dry+wet drive paths
    this.input.connect(this.driveBypass)
    this.input.connect(this.drive).connect(this.driveWet)
    const driveOut = ctx.createGain(); driveOut.gain.value = 1
    this.driveBypass.connect(driveOut)
    this.driveWet.connect(driveOut)

    driveOut
      .connect(this.filter)
      .connect(this.volume)
      .connect(this.panner)

    // send taps post-pan (analyser chain below is parallel, not in series)
    this.panner.connect(this.sendA).connect(reverbIn)
    this.panner.connect(this.sendB).connect(delayIn)

    // analyser chain
    this.panner.connect(this.splitter)
    this.splitter.connect(this.analyserL, 0)
    this.splitter.connect(this.analyserR, 1)
    this.analyserL.connect(this.merger, 0, 0)
    this.analyserR.connect(this.merger, 0, 1)
    this.merger.connect(this.output)
  }

  setFilter(type: FilterType, cutoff: number, res: number) {
    this.filter.type = type === 'lp' ? 'lowpass' : type === 'hp' ? 'highpass' : 'bandpass'
    this.filter.frequency.value = Math.max(20, Math.min(20000, cutoff))
    this.filter.Q.value = 0.7 + Math.max(0, Math.min(1, res)) * 11.3
  }

  setGain(v: number) {
    this.userGain = v
    this.applyGain()
  }

  setPan(v: number) { this.panner.pan.value = Math.max(-1, Math.min(1, v)) }

  setDrive(v: number) {
    const wet = Math.max(0, Math.min(1, v))
    this.driveBypass.gain.value = 1 - wet
    this.driveWet.gain.value = wet
    this.drive.curve = makeDriveCurve(wet) as Float32Array<ArrayBuffer>

  }

  setSendA(v: number) { this.sendA.gain.value = Math.max(0, Math.min(1, v)) }
  setSendB(v: number) { this.sendB.gain.value = Math.max(0, Math.min(1, v)) }

  setMute(muted: boolean) { this.muted = muted; this.applyGain() }
  /** called from engine when solo state changes. */
  setSolo(isSolo: boolean, anySolo: boolean) {
    this.isSolo = isSolo
    this.soloActive = anySolo
    this.applyGain()
  }

  private applyGain() {
    const audible = !this.muted && (!this.soloActive || this.isSolo)
    this.volume.gain.setTargetAtTime(audible ? this.userGain : 0, this.ctx.currentTime, 0.012)
  }

  /** stereo level read (rms-ish). returns [L, R] in 0..1. */
  getLevel(): [number, number] {
    this.analyserL.getByteTimeDomainData(this.buf as Uint8Array<ArrayBuffer>)
    let sumL = 0
    for (let i = 0; i < this.buf.length; i++) { const v = (this.buf[i] - 128) / 128; sumL += v * v }
    const rmsL = Math.sqrt(sumL / this.buf.length)

    this.analyserR.getByteTimeDomainData(this.buf as Uint8Array<ArrayBuffer>)
    let sumR = 0
    for (let i = 0; i < this.buf.length; i++) { const v = (this.buf[i] - 128) / 128; sumR += v * v }
    const rmsR = Math.sqrt(sumR / this.buf.length)

    return [Math.min(1, rmsL * 1.8), Math.min(1, rmsR * 1.8)]
  }

  dispose() {
    try {
      this.input.disconnect()
      this.driveBypass.disconnect()
      this.drive.disconnect()
      this.driveWet.disconnect()
      this.filter.disconnect()
      this.volume.disconnect()
      this.panner.disconnect()
      this.splitter.disconnect()
      this.analyserL.disconnect()
      this.analyserR.disconnect()
      this.merger.disconnect()
      this.sendA.disconnect()
      this.sendB.disconnect()
      this.output.disconnect()
    } catch { /* ignore */ }
  }
}

/** soft symmetric saturation curve. amount 0..1. */
function makeDriveCurve(amount: number): Float32Array {
  const n = 1024
  const curve = new Float32Array(n)
  const k = amount * 80 + 0.01
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1
    curve[i] = Math.tanh(x * (1 + k)) / Math.tanh(1 + k)
  }
  return curve
}
