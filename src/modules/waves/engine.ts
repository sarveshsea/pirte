// master audio graph + transport owner.
// owns: ctx, master bus, analyser, sidechain tap, per-track strips + voices.
// commits 7-9 flesh out the master FX chain (bitcrush/comp/delay/reverb).

import { Scheduler } from './scheduler'
import type { BitcrushParams, CompParams, DelayParams, LimiterParams, Project, ReverbParams, Track, VoiceKind } from './types'
import { findPattern } from './pattern'
import { TrackStrip } from './effects/trackStrip'
import { Reverb } from './effects/reverb'
import { TapeDelay } from './effects/delay'
import { Bitcrush } from './effects/bitcrush'
import { createVoice, type Voice, SamplerVoice } from './voices'

export type EngineCallbacks = {
  onStep?: (step: number, audioTime: number) => void
  onBar?: () => void
}

type TrackRuntime = {
  strip: TrackStrip
  voice: Voice
  voiceKind: VoiceKind
}

export class WavesEngine {
  readonly ctx: AudioContext
  readonly master: GainNode
  readonly limiter: DynamicsCompressorNode
  readonly compressor: DynamicsCompressorNode
  readonly duck: GainNode
  readonly preFx: GainNode
  readonly reverbIn: GainNode
  readonly delayIn: GainNode
  readonly analyser: AnalyserNode
  readonly reverb: Reverb
  readonly delay: TapeDelay
  readonly bitcrush: Bitcrush
  private project: Project
  private scheduler: Scheduler
  private callbacks: EngineCallbacks = {}
  private tracks: TrackRuntime[] = []

  constructor(project: Project) {
    this.project = project
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    this.ctx = new Ctx({ latencyHint: 'interactive' })

    // master chain:
    //   tracks + sends → preFx → duck → bitcrush → compressor → master → limiter → analyser → destination
    this.preFx = this.ctx.createGain()
    this.duck = this.ctx.createGain(); this.duck.gain.value = 1

    this.bitcrush = new Bitcrush(this.ctx)
    this.bitcrush.setParams(project.master.bitcrush)

    this.compressor = this.ctx.createDynamicsCompressor()
    this.applyCompParams(project.master.comp)

    this.limiter = this.ctx.createDynamicsCompressor()
    this.applyLimiterParams(project.master.limiter)

    this.master = this.ctx.createGain()
    this.master.gain.value = project.master.gain

    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = 2048

    this.preFx
      .connect(this.duck)
      .connect(this.bitcrush.input)
    this.bitcrush.output
      .connect(this.compressor)
      .connect(this.master)
      .connect(this.limiter)
      .connect(this.analyser)
      .connect(this.ctx.destination)

    // reverb + delay sends live on parallel buses that land in the main chain
    // at preFx (so bitcrush/comp affect the wet signal too — more glue).
    this.reverb = new Reverb(this.ctx)
    this.reverb.setParams(project.master.reverb)
    this.delay = new TapeDelay(this.ctx)
    this.delay.setParams(project.master.delay)

    this.reverbIn = this.ctx.createGain()
    this.reverbIn.connect(this.reverb.input)
    this.reverb.output.connect(this.preFx)

    this.delayIn = this.ctx.createGain()
    this.delayIn.connect(this.delay.input)
    this.delay.output.connect(this.preFx)

    this.buildTracks()

    this.scheduler = new Scheduler(
      {
        getCtx: () => this.ctx,
        getBpm: () => this.project.bpm,
        getSwing: () => this.project.swing,
        getStepsPerBar: () => findPattern(this.project, this.project.activePattern).stepsPerBar,
      },
      {
        onStep: (step, time) => {
          this.triggerStep(step, time)
          this.callbacks.onStep?.(step, time)
        },
        onBar: () => this.callbacks.onBar?.(),
      },
    )
  }

  private buildTracks() {
    const pattern = findPattern(this.project, this.project.activePattern)
    for (let i = 0; i < pattern.tracks.length; i++) {
      const t = pattern.tracks[i]
      const strip = new TrackStrip(this.ctx, this.reverbIn, this.delayIn)
      const voice = createVoice(t.voice, this.ctx)
      voice.output.connect(strip.input)
      strip.output.connect(this.preFx)
      this.applyStripState(strip, t)
      this.tracks.push({ strip, voice, voiceKind: t.voice })
    }
    this.recomputeSolo()
  }

  private applyCompParams(p: CompParams) {
    this.compressor.threshold.value = p.threshold
    this.compressor.ratio.value = p.ratio
    this.compressor.attack.value = p.attack
    this.compressor.release.value = p.release
    this.compressor.knee.value = 6
  }

  private applyLimiterParams(p: LimiterParams) {
    this.limiter.threshold.value = p.ceiling
    this.limiter.ratio.value = 20
    this.limiter.attack.value = 0.001
    this.limiter.release.value = p.release
    this.limiter.knee.value = 0
  }

  /** push any change to master params from the ui into the audio graph. */
  syncMaster() {
    this.applyCompParams(this.project.master.comp)
    this.applyLimiterParams(this.project.master.limiter)
    this.bitcrush.setParams(this.project.master.bitcrush)
    this.reverb.setParams(this.project.master.reverb)
    this.delay.setParams(this.project.master.delay)
    this.master.gain.setTargetAtTime(this.project.master.gain, this.ctx.currentTime, 0.01)
  }

  /** schedule a sidechain-style duck triggered by the kick. */
  private duckEnvelope(time: number) {
    if (!this.project.master.comp.sidechain) return
    // depth proportional to "mix" knob of the compressor as a standin for
    // duck amount. keeps the public api small.
    const depth = Math.max(0.1, Math.min(0.9, this.project.master.comp.mix))
    const release = Math.max(0.05, Math.min(0.6, this.project.master.comp.release * 3))
    this.duck.gain.cancelScheduledValues(time)
    this.duck.gain.setValueAtTime(1, time)
    this.duck.gain.linearRampToValueAtTime(1 - depth, time + 0.005)
    this.duck.gain.linearRampToValueAtTime(1, time + release)
  }

  /** current gain-reduction in dB for ui meter. */
  getCompGR(): number { return this.compressor.reduction }
  getLimiterGR(): number { return this.limiter.reduction }

  private applyStripState(strip: TrackStrip, t: Track) {
    strip.setFilter(t.filter.type, t.filter.cutoff, t.filter.res)
    strip.setDrive(t.drive)
    strip.setGain(t.gain)
    strip.setPan(t.pan)
    strip.setSendA(t.sendA)
    strip.setSendB(t.sendB)
    strip.setMute(t.mute)
  }

  /** call after any mute/solo changes. */
  recomputeSolo() {
    const pattern = findPattern(this.project, this.project.activePattern)
    const anySolo = pattern.tracks.some((t) => t.solo)
    for (let i = 0; i < this.tracks.length; i++) {
      this.tracks[i].strip.setSolo(pattern.tracks[i].solo, anySolo)
    }
  }

  /** caller mutated project state — push relevant subset to the audio graph. */
  syncTrack(i: number) {
    const pattern = findPattern(this.project, this.project.activePattern)
    const t = pattern.tracks[i]
    const r = this.tracks[i]
    if (!t || !r) return
    // swap voice if kind changed
    if (t.voice !== r.voiceKind) {
      try { r.voice.output.disconnect() } catch { /* */ }
      r.voice.dispose()
      r.voice = createVoice(t.voice, this.ctx)
      r.voice.output.connect(r.strip.input)
      r.voiceKind = t.voice
    }
    this.applyStripState(r.strip, t)
  }

  /** assign an AudioBuffer to a sampler-kind track. no-op for other voices. */
  setTrackSample(i: number, buf: AudioBuffer | null, rootNote = 60) {
    const r = this.tracks[i]
    if (r && r.voice instanceof SamplerVoice) r.voice.setBuffer(buf, rootNote)
  }

  /** trigger a track manually (for pad performance / keyboard play). */
  triggerManual(i: number, note = 60, vel = 1, gate = 0.2) {
    const r = this.tracks[i]
    if (!r) return
    r.voice.trigger({ time: this.ctx.currentTime, note, vel, gate })
  }

  /** read stereo level for a track — for per-track VU. */
  getTrackLevel(i: number): [number, number] {
    return this.tracks[i]?.strip.getLevel() ?? [0, 0]
  }

  setCallbacks(cb: EngineCallbacks) { this.callbacks = cb }
  getProject(): Project { return this.project }
  replaceProject(p: Project) { this.project = p }

  setBpm(v: number) { this.project.bpm = v }
  setSwing(v: number) { this.project.swing = v }
  setMasterGain(v: number) {
    this.project.master.gain = v
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.01)
  }

  async start() {
    if (this.ctx.state === 'suspended') await this.ctx.resume()
    this.scheduler.start()
  }
  stop() { this.scheduler.stop() }
  get isPlaying() { return this.scheduler.isRunning }
  get currentStep() { return this.scheduler.currentStep }

  async dispose() {
    this.scheduler.stop()
    for (const r of this.tracks) {
      try { r.voice.output.disconnect() } catch { /* */ }
      r.voice.dispose()
      r.strip.dispose()
    }
    this.tracks = []
    try { await this.ctx.close() } catch { /* */ }
  }

  readTimeDomain(out: Uint8Array) { this.analyser.getByteTimeDomainData(out as Uint8Array<ArrayBuffer>) }
  readFrequency(out: Uint8Array) { this.analyser.getByteFrequencyData(out as Uint8Array<ArrayBuffer>) }

  private triggerStep(step: number, time: number) {
    const pattern = findPattern(this.project, this.project.activePattern)
    for (let i = 0; i < pattern.tracks.length; i++) {
      const t = pattern.tracks[i]
      const s = t.steps[step]
      if (!s || !s.on) continue
      if (s.prob < 100 && Math.random() * 100 >= s.prob) continue
      const vel = Math.max(0.0001, (s.vel + 1) / 8)          // 1..8 / 8 → 0.125..1
      const secPerStep = 60 / this.project.bpm / 4
      const gate = Math.max(0.01, (s.gate / 16) * secPerStep)
      this.tracks[i].voice.trigger({ time, note: s.note, vel, gate })
      // fire a duck envelope off the first track (kick)
      if (i === 0) this.duckEnvelope(time)
    }
  }

  /** replace the waves engine types barrel re-export. */
  getMasterParams() {
    return {
      bitcrush: { ...this.project.master.bitcrush } as BitcrushParams,
      delay: { ...this.project.master.delay } as DelayParams,
      reverb: { ...this.project.master.reverb } as ReverbParams,
      comp: { ...this.project.master.comp } as CompParams,
      limiter: { ...this.project.master.limiter } as LimiterParams,
      gain: this.project.master.gain,
    }
  }
}
