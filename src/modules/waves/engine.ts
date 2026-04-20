// master audio graph + transport owner.
// scaffold only — voices and master fx wire in over the next commits.
// today we own: ctx, master bus (master gain → limiter → destination),
// reverb/delay bus stubs, analyser for visualizer, transport start/stop via
// scheduler.

import { Scheduler } from './scheduler'
import type { Project, Track } from './types'
import { findPattern } from './pattern'

export type EngineCallbacks = {
  onStep?: (step: number, audioTime: number) => void
  onBar?: () => void
}

export class WavesEngine {
  readonly ctx: AudioContext
  readonly master: GainNode
  readonly limiter: DynamicsCompressorNode
  readonly reverbIn: GainNode
  readonly delayIn: GainNode
  readonly analyser: AnalyserNode
  readonly sidechainBus: GainNode     // kick trigger tap goes here
  private project: Project
  private scheduler: Scheduler
  private callbacks: EngineCallbacks = {}

  // per-track strips live on the track object — stored out-of-band since Track
  // is json-serializable. indexed by the project's track position.
  private trackNodes: Map<number, TrackNodes> = new Map()

  constructor(project: Project) {
    this.project = project
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    this.ctx = new Ctx({ latencyHint: 'interactive' })

    // master bus: [tracks + sends] → master gain → limiter → destination
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

    // fx sends are placeholders here; commit 7 wires the actual reverb+delay chains.
    this.reverbIn = this.ctx.createGain()
    this.reverbIn.connect(this.master)
    this.delayIn = this.ctx.createGain()
    this.delayIn.connect(this.master)
    this.sidechainBus = this.ctx.createGain()
    this.sidechainBus.gain.value = 0

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

  setCallbacks(cb: EngineCallbacks) { this.callbacks = cb }
  getProject(): Project { return this.project }
  replaceProject(p: Project) { this.project = p }

  async start() {
    if (this.ctx.state === 'suspended') await this.ctx.resume()
    this.scheduler.start()
  }
  stop() { this.scheduler.stop() }
  get isPlaying() { return this.scheduler.isRunning }
  get currentStep() { return this.scheduler.currentStep }

  /** tear everything down (for route nav-away). */
  async dispose() {
    this.scheduler.stop()
    for (const nodes of this.trackNodes.values()) nodes.dispose()
    this.trackNodes.clear()
    try { await this.ctx.close() } catch { /* ignore */ }
  }

  readTimeDomain(out: Uint8Array) { this.analyser.getByteTimeDomainData(out as Uint8Array<ArrayBuffer>) }
  readFrequency(out: Uint8Array) { this.analyser.getByteFrequencyData(out as Uint8Array<ArrayBuffer>) }

  // called each step — here we look at the active pattern's tracks and trigger
  // the voices that have that step active. voices themselves are added in
  // commit 3; for now this is a no-op scaffold.
  private triggerStep(step: number, time: number) {
    const pattern = findPattern(this.project, this.project.activePattern)
    const anySolo = pattern.tracks.some((t) => t.solo)
    for (let i = 0; i < pattern.tracks.length; i++) {
      const t = pattern.tracks[i]
      if (t.mute) continue
      if (anySolo && !t.solo) continue
      const s = t.steps[step]
      if (!s || !s.on) continue
      if (s.prob < 100 && Math.random() * 100 >= s.prob) continue
      this.triggerTrack(i, t, s, time)
    }
  }

  private triggerTrack(_idx: number, _track: Track, _step: { vel: number; gate: number; note: number }, _time: number) {
    // intentionally empty in commit 1 — voices land in commit 3.
  }
}

// per-track audio graph handle. real implementation arrives in commit 4.
export type TrackNodes = {
  input: AudioNode
  output: AudioNode
  dispose(): void
}
