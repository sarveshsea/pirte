import type { WeatherSignals, WorldSceneMode } from './types'

type AudioState = {
  mode: WorldSceneMode
  weather: WeatherSignals | null
  intensity: number
}

export class WorldAmbience {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private windGain: GainNode | null = null
  private droneGain: GainNode | null = null
  private lowpass: BiquadFilterNode | null = null
  private lfo: OscillatorNode | null = null
  private toneA: OscillatorNode | null = null
  private toneB: OscillatorNode | null = null
  private noise: AudioBufferSourceNode | null = null
  private enabled = true
  private ready = false

  private ensure() {
    if (this.ctx) return

    const ctx = new AudioContext()
    const master = ctx.createGain()
    master.gain.value = 0.0001
    master.connect(ctx.destination)

    const windGain = ctx.createGain()
    windGain.gain.value = 0.03
    const droneGain = ctx.createGain()
    droneGain.gain.value = 0.025
    const lowpass = ctx.createBiquadFilter()
    lowpass.type = 'lowpass'
    lowpass.frequency.value = 620
    lowpass.Q.value = 0.4

    const toneA = ctx.createOscillator()
    toneA.type = 'triangle'
    toneA.frequency.value = 83
    const toneB = ctx.createOscillator()
    toneB.type = 'sine'
    toneB.frequency.value = 124

    toneA.connect(droneGain)
    toneB.connect(droneGain)
    droneGain.connect(master)

    const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
    const channel = noiseBuffer.getChannelData(0)
    for (let index = 0; index < channel.length; index++) {
      channel[index] = (Math.random() * 2 - 1) * 0.28
    }
    const noise = ctx.createBufferSource()
    noise.buffer = noiseBuffer
    noise.loop = true
    noise.connect(lowpass)
    lowpass.connect(windGain)
    windGain.connect(master)

    const lfo = ctx.createOscillator()
    const lfoGain = ctx.createGain()
    lfo.frequency.value = 0.09
    lfoGain.gain.value = 32
    lfo.connect(lfoGain)
    lfoGain.connect(lowpass.frequency)

    toneA.start()
    toneB.start()
    noise.start()
    lfo.start()

    this.ctx = ctx
    this.master = master
    this.windGain = windGain
    this.droneGain = droneGain
    this.lowpass = lowpass
    this.lfo = lfo
    this.toneA = toneA
    this.toneB = toneB
    this.noise = noise
    this.ready = true
  }

  async resume() {
    this.ensure()
    if (!this.ctx) return
    if (this.ctx.state !== 'running') await this.ctx.resume()
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled
    if (!this.master || !this.ctx) return
    const now = this.ctx.currentTime
    this.master.gain.cancelScheduledValues(now)
    this.master.gain.linearRampToValueAtTime(enabled ? 0.08 : 0.0001, now + 0.25)
  }

  update(state: AudioState) {
    if (!this.ready || !this.ctx || !this.windGain || !this.droneGain || !this.lowpass || !this.toneA || !this.toneB) return
    const now = this.ctx.currentTime
    const wind = state.weather?.windSpeedKph ?? 12
    const wave = state.weather?.waveHeightM ?? 0.3
    const intensity = Math.max(0.15, state.intensity)
    const modeLift = state.mode === 'ground' ? 1.18 : state.mode === 'region' ? 1.04 : 0.92

    this.windGain.gain.cancelScheduledValues(now)
    this.windGain.gain.linearRampToValueAtTime(0.012 + intensity * 0.026 + wind / 240, now + 0.3)

    this.droneGain.gain.cancelScheduledValues(now)
    this.droneGain.gain.linearRampToValueAtTime(0.016 * modeLift + wave * 0.01, now + 0.3)

    this.lowpass.frequency.cancelScheduledValues(now)
    this.lowpass.frequency.linearRampToValueAtTime(320 + wind * 12 + wave * 90, now + 0.4)

    this.toneA.frequency.cancelScheduledValues(now)
    this.toneA.frequency.linearRampToValueAtTime(78 * modeLift + wind * 0.25, now + 0.3)
    this.toneB.frequency.cancelScheduledValues(now)
    this.toneB.frequency.linearRampToValueAtTime(118 * modeLift + wave * 12, now + 0.3)

    if (!this.enabled) this.setEnabled(false)
  }

  dispose() {
    try { this.toneA?.stop() } catch { void 0 }
    try { this.toneB?.stop() } catch { void 0 }
    try { this.noise?.stop() } catch { void 0 }
    try { this.lfo?.stop() } catch { void 0 }
    try { this.ctx?.close() } catch { void 0 }
    this.ctx = null
    this.master = null
    this.windGain = null
    this.droneGain = null
    this.lowpass = null
    this.lfo = null
    this.toneA = null
    this.toneB = null
    this.noise = null
    this.ready = false
  }
}
