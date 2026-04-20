// master audio graph + transport owner.
// owns: ctx, master bus, analyser, sidechain tap, per-track strips + voices.
// commits 7-9 flesh out the master FX chain (bitcrush/comp/delay/reverb).

import { Scheduler } from './scheduler'
import type { Project, Track, VoiceKind } from './types'
import { findPattern } from './pattern'
import { TrackStrip } from './effects/trackStrip'
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
  readonly reverbIn: GainNode
  readonly delayIn: GainNode
  readonly analyser: AnalyserNode
  readonly sidechainBus: GainNode
  private project: Project
  private scheduler: Scheduler
  private callbacks: EngineCallbacks = {}
  private tracks: TrackRuntime[] = []

  constructor(project: Project) {
    this.project = project
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    this.ctx = new Ctx({ latencyHint: 'interactive' })

    this.limiter = this.ctx.createDynamicsCompressor()
    this.limiter.threshold.value = project.master.limiter.ceiling
    this.limiter.ratio.value = 20
    this.limiter.attack.value = 0.001
    this.limiter.release.value = project.master.limiter.release
    this.limiter.knee.value = 0

    this.master = this.ctx.createGain()
    this.master.gain.value = project.master.gain

    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = 2048

    this.master.connect(this.limiter).connect(this.analyser).connect(this.ctx.destination)

    this.reverbIn = this.ctx.createGain()
    this.reverbIn.connect(this.master)
    this.delayIn = this.ctx.createGain()
    this.delayIn.connect(this.master)
    this.sidechainBus = this.ctx.createGain()
    this.sidechainBus.gain.value = 0

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
      strip.output.connect(this.master)
      this.applyStripState(strip, t)
      this.tracks.push({ strip, voice, voiceKind: t.voice })
    }
    this.recomputeSolo()
  }

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
    }
  }
}
