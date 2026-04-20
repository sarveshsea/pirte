// lookahead scheduler. keeps the 25ms poll / 100ms window pattern from the
// original synth, extended to handle: variable steps-per-bar, per-track swing,
// per-step probability / micro-timing, and song-mode pattern traversal.

export type SchedulerCallbacks = {
  /** called once per scheduled step, ahead of time. perform all voice triggers here. */
  onStep: (stepIdx: number, audioTime: number) => void
  /** called when the pattern pointer wraps to 0 — use to advance song-mode. */
  onBar?: () => void
}

export type SchedulerConfig = {
  getCtx: () => AudioContext
  getBpm: () => number
  getSwing: () => number      // 0..1
  getStepsPerBar: () => number
}

export class Scheduler {
  private timerId: number | null = null
  private nextTime = 0
  private step = 0
  private lookaheadMs = 25
  private scheduleAhead = 0.1
  private running = false
  private cfg: SchedulerConfig
  private cb: SchedulerCallbacks

  constructor(cfg: SchedulerConfig, cb: SchedulerCallbacks) {
    this.cfg = cfg
    this.cb = cb
  }

  start() {
    if (this.running) return
    const ctx = this.cfg.getCtx()
    this.running = true
    this.step = 0
    this.nextTime = ctx.currentTime + 0.06
    this.tick()
  }

  stop() {
    this.running = false
    if (this.timerId !== null) { clearTimeout(this.timerId); this.timerId = null }
  }

  get isRunning() { return this.running }
  get currentStep() { return this.step }

  /** for ui "jump to step" / loop restart. */
  reset() {
    this.step = 0
    const ctx = this.cfg.getCtx()
    this.nextTime = ctx.currentTime + 0.06
  }

  private tick = () => {
    if (!this.running) return
    const ctx = this.cfg.getCtx()
    const horizon = ctx.currentTime + this.scheduleAhead
    const bpm = this.cfg.getBpm()
    const swing = this.cfg.getSwing()
    const stepsPerBar = this.cfg.getStepsPerBar()
    const secPerStep = 60 / bpm / 4

    while (this.nextTime < horizon) {
      const isOdd = (this.step & 1) === 1
      const swingOffset = isOdd ? secPerStep * swing * 0.3 : 0
      this.cb.onStep(this.step, this.nextTime + swingOffset)
      const wasBarEnd = this.step === stepsPerBar - 1
      this.step = (this.step + 1) % stepsPerBar
      if (wasBarEnd) this.cb.onBar?.()
      this.nextTime += secPerStep
    }
    this.timerId = window.setTimeout(this.tick, this.lookaheadMs)
  }
}
