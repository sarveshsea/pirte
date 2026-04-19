export type Track = 'kick' | 'snare' | 'hat' | 'bass'
export const TRACKS: Track[] = ['kick', 'snare', 'hat', 'bass']
export const STEPS = 16

export class SynthEngine {
  ctx: AudioContext
  analyser: AnalyserNode
  out: GainNode
  bpm = 120
  swing = 0
  patterns: Record<Track, boolean[]>
  step = 0
  isPlaying = false
  private nextTime = 0
  private lookaheadMs = 25
  private scheduleAhead = 0.1
  private timerId: number | null = null
  private onStep?: (step: number) => void

  constructor() {
    this.ctx = new AudioContext()
    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = 2048
    this.out = this.ctx.createGain()
    this.out.gain.value = 0.7
    this.out.connect(this.analyser)
    this.analyser.connect(this.ctx.destination)
    this.patterns = {
      kick:  new Array(STEPS).fill(false),
      snare: new Array(STEPS).fill(false),
      hat:   new Array(STEPS).fill(false),
      bass:  new Array(STEPS).fill(false),
    }
  }

  setOnStep(cb: (step: number) => void) { this.onStep = cb }

  async start() {
    if (this.ctx.state === 'suspended') await this.ctx.resume()
    if (this.isPlaying) return
    this.isPlaying = true
    this.step = 0
    this.nextTime = this.ctx.currentTime + 0.06
    this.scheduler()
  }

  stop() {
    this.isPlaying = false
    if (this.timerId) { window.clearTimeout(this.timerId); this.timerId = null }
  }

  toggle(track: Track, step: number) {
    this.patterns[track][step] = !this.patterns[track][step]
  }

  clear() { for (const t of TRACKS) this.patterns[t].fill(false) }

  randomize() {
    const density: Record<Track, number> = { kick: 0.35, snare: 0.2, hat: 0.55, bass: 0.3 }
    for (const t of TRACKS) for (let i = 0; i < STEPS; i++) this.patterns[t][i] = Math.random() < density[t]
    // ensure a kick on 1
    this.patterns.kick[0] = true
  }

  private scheduler = () => {
    const horizon = this.ctx.currentTime + this.scheduleAhead
    while (this.nextTime < horizon) {
      this.schedStep(this.step, this.nextTime)
      const secPerStep = 60 / this.bpm / 4
      const swingOffset = (this.step % 2 === 1) ? secPerStep * this.swing * 0.3 : 0
      this.nextTime += secPerStep + swingOffset
      this.step = (this.step + 1) % STEPS
    }
    if (this.isPlaying) this.timerId = window.setTimeout(this.scheduler, this.lookaheadMs)
  }

  private schedStep(step: number, time: number) {
    if (this.patterns.kick[step])  this.kick(time)
    if (this.patterns.snare[step]) this.snare(time)
    if (this.patterns.hat[step])   this.hat(time)
    if (this.patterns.bass[step])  this.bass(time, 55)
    this.onStep?.(step)
  }

  kick(time = this.ctx.currentTime) {
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(160, time)
    osc.frequency.exponentialRampToValueAtTime(45, time + 0.12)
    gain.gain.setValueAtTime(0.95, time)
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.22)
    osc.connect(gain).connect(this.out)
    osc.start(time); osc.stop(time + 0.25)
  }

  snare(time = this.ctx.currentTime) {
    const noise = this.noiseBuffer(0.2)
    const src = this.ctx.createBufferSource()
    src.buffer = noise
    const hp = this.ctx.createBiquadFilter()
    hp.type = 'highpass'; hp.frequency.value = 1200
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.35, time)
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.17)
    src.connect(hp).connect(g).connect(this.out)
    src.start(time); src.stop(time + 0.2)
    // tonal crack
    const osc = this.ctx.createOscillator()
    const og = this.ctx.createGain()
    osc.type = 'triangle'; osc.frequency.value = 220
    og.gain.setValueAtTime(0.28, time)
    og.gain.exponentialRampToValueAtTime(0.001, time + 0.07)
    osc.connect(og).connect(this.out)
    osc.start(time); osc.stop(time + 0.08)
  }

  hat(time = this.ctx.currentTime) {
    const src = this.ctx.createBufferSource()
    src.buffer = this.noiseBuffer(0.1)
    const hp = this.ctx.createBiquadFilter()
    hp.type = 'highpass'; hp.frequency.value = 7000
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.12, time)
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.04)
    src.connect(hp).connect(g).connect(this.out)
    src.start(time); src.stop(time + 0.06)
  }

  bass(time = this.ctx.currentTime, freq = 55) {
    const osc = this.ctx.createOscillator()
    const filter = this.ctx.createBiquadFilter()
    const g = this.ctx.createGain()
    osc.type = 'sawtooth'; osc.frequency.value = freq
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(600, time)
    filter.frequency.exponentialRampToValueAtTime(100, time + 0.22)
    filter.Q.value = 6
    g.gain.setValueAtTime(0.28, time)
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.26)
    osc.connect(filter).connect(g).connect(this.out)
    osc.start(time); osc.stop(time + 0.3)
  }

  // monophonic-ish lead — triggered by keyboard
  lead(freq: number, time = this.ctx.currentTime) {
    const osc = this.ctx.createOscillator()
    const filter = this.ctx.createBiquadFilter()
    const g = this.ctx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.value = freq
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(2400, time)
    filter.frequency.exponentialRampToValueAtTime(600, time + 0.35)
    filter.Q.value = 5
    g.gain.setValueAtTime(0.001, time)
    g.gain.exponentialRampToValueAtTime(0.22, time + 0.01)
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.4)
    osc.connect(filter).connect(g).connect(this.out)
    osc.start(time); osc.stop(time + 0.45)
  }

  private noiseBuffer(seconds: number): AudioBuffer {
    const len = Math.max(1, Math.floor(seconds * this.ctx.sampleRate))
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    return buf
  }

  readTimeDomain(out: Uint8Array<ArrayBuffer>) { this.analyser.getByteTimeDomainData(out) }
  readFrequency(out: Uint8Array<ArrayBuffer>)  { this.analyser.getByteFrequencyData(out) }
}

// key → freq (semitone steps from A3 = 220Hz)
const A3 = 220
const NOTE_MAP: Record<string, number> = {
  a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15, ';': 16,
}
export function keyToFreq(key: string): number | null {
  const s = NOTE_MAP[key.toLowerCase()]
  if (s === undefined) return null
  return A3 * Math.pow(2, s / 12)
}
