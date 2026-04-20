// analog-style drum voices. each one owns a persistent output Gain that
// connects to its track strip; triggers spawn ephemeral oscillators/noise
// that self-destruct at the end of their envelope.

import type { Voice, VoiceTriggerArgs } from './voice'
import { mtof } from './voice'

function makeNoiseBuffer(ctx: BaseAudioContext, seconds = 1): AudioBuffer {
  const sr = ctx.sampleRate
  const buf = ctx.createBuffer(1, Math.floor(sr * seconds), sr)
  const ch = buf.getChannelData(0)
  for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1
  return buf
}

class BaseDrum implements Voice {
  readonly output: GainNode
  protected ctx: AudioContext
  constructor(ctx: AudioContext) {
    this.ctx = ctx
    this.output = ctx.createGain()
    this.output.gain.value = 1
  }
  trigger(_args: VoiceTriggerArgs): void { /* overridden */ }
  dispose(): void { try { this.output.disconnect() } catch { /* */ } }
}

/** 808-style kick: sine with rapid pitch sweep + exp amp envelope. */
export class KickVoice extends BaseDrum {
  trigger({ time, vel, params }: VoiceTriggerArgs) {
    const ctx = this.ctx
    const tune = params?.tune ?? 1         // 0.5..2
    const decay = params?.decay ?? 0.22    // s
    const punch = params?.punch ?? 1       // 0.5..2

    const osc = ctx.createOscillator()
    osc.type = 'sine'
    const g = ctx.createGain()
    osc.connect(g).connect(this.output)

    const startF = 160 * tune * punch
    const endF = 45 * tune
    osc.frequency.setValueAtTime(startF, time)
    osc.frequency.exponentialRampToValueAtTime(endF, time + 0.12 * decay / 0.22)
    g.gain.setValueAtTime(0.0001, time)
    g.gain.linearRampToValueAtTime(0.95 * vel, time + 0.002)
    g.gain.exponentialRampToValueAtTime(0.0001, time + decay)
    osc.start(time)
    osc.stop(time + decay + 0.05)
  }
}

/** snare: high-passed noise + triangle crack. */
export class SnareVoice extends BaseDrum {
  private noise: AudioBuffer
  constructor(ctx: AudioContext) { super(ctx); this.noise = makeNoiseBuffer(ctx) }

  trigger({ time, vel, params }: VoiceTriggerArgs) {
    const ctx = this.ctx
    const decay = params?.decay ?? 0.17
    const tone = params?.tone ?? 220
    const snap = params?.snap ?? 0.28

    const src = ctx.createBufferSource(); src.buffer = this.noise
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1200
    const ng = ctx.createGain()
    src.connect(hp).connect(ng).connect(this.output)
    ng.gain.setValueAtTime(0.35 * vel, time)
    ng.gain.exponentialRampToValueAtTime(0.0001, time + decay)
    src.start(time); src.stop(time + decay + 0.02)

    const osc = ctx.createOscillator(); osc.type = 'triangle'; osc.frequency.value = tone
    const og = ctx.createGain()
    osc.connect(og).connect(this.output)
    og.gain.setValueAtTime(snap * vel, time)
    og.gain.exponentialRampToValueAtTime(0.0001, time + 0.07)
    osc.start(time); osc.stop(time + 0.1)
  }
}

/** hat: very short highpassed-noise burst. */
export class HatVoice extends BaseDrum {
  private noise: AudioBuffer
  constructor(ctx: AudioContext) { super(ctx); this.noise = makeNoiseBuffer(ctx, 0.5) }

  trigger({ time, vel, params }: VoiceTriggerArgs) {
    const ctx = this.ctx
    const decay = params?.decay ?? 0.04
    const bright = params?.bright ?? 7000
    const src = ctx.createBufferSource(); src.buffer = this.noise
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = bright
    const g = ctx.createGain()
    src.connect(hp).connect(g).connect(this.output)
    g.gain.setValueAtTime(0.12 * vel, time)
    g.gain.exponentialRampToValueAtTime(0.0001, time + decay)
    src.start(time); src.stop(time + decay + 0.02)
  }
}

/** clap: 4 close noise transients for that "flam" feel. */
export class ClapVoice extends BaseDrum {
  private noise: AudioBuffer
  constructor(ctx: AudioContext) { super(ctx); this.noise = makeNoiseBuffer(ctx, 0.4) }

  trigger({ time, vel }: VoiceTriggerArgs) {
    const ctx = this.ctx
    const offsets = [0, 0.008, 0.018, 0.03]
    const tailOffset = 0.04
    for (const off of offsets) {
      const src = ctx.createBufferSource(); src.buffer = this.noise
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'
      bp.frequency.value = 1400; bp.Q.value = 1.2
      const g = ctx.createGain()
      src.connect(bp).connect(g).connect(this.output)
      const t = time + off
      g.gain.setValueAtTime(0.3 * vel, t)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.02)
      src.start(t); src.stop(t + 0.04)
    }
    // decay tail
    const src = ctx.createBufferSource(); src.buffer = this.noise
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'
    bp.frequency.value = 1400; bp.Q.value = 0.8
    const g = ctx.createGain()
    src.connect(bp).connect(g).connect(this.output)
    const t = time + tailOffset
    g.gain.setValueAtTime(0.15 * vel, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12)
    src.start(t); src.stop(t + 0.16)
  }
}

/** tom: pitched kick-style sine w/ slower sweep. note controls base pitch. */
export class TomVoice extends BaseDrum {
  trigger({ time, note, vel, params }: VoiceTriggerArgs) {
    const ctx = this.ctx
    const decay = params?.decay ?? 0.32
    const base = mtof(note) / 3      // bring midi range into tom territory
    const osc = ctx.createOscillator(); osc.type = 'sine'
    const g = ctx.createGain()
    osc.connect(g).connect(this.output)
    osc.frequency.setValueAtTime(base * 2, time)
    osc.frequency.exponentialRampToValueAtTime(base, time + 0.16)
    g.gain.setValueAtTime(0.0001, time)
    g.gain.linearRampToValueAtTime(0.7 * vel, time + 0.003)
    g.gain.exponentialRampToValueAtTime(0.0001, time + decay)
    osc.start(time); osc.stop(time + decay + 0.05)
  }
}

export type DrumKind = 'kick' | 'snare' | 'hat' | 'clap' | 'tom'

export function createDrumVoice(kind: DrumKind, ctx: AudioContext): Voice {
  switch (kind) {
    case 'kick':  return new KickVoice(ctx)
    case 'snare': return new SnareVoice(ctx)
    case 'hat':   return new HatVoice(ctx)
    case 'clap':  return new ClapVoice(ctx)
    case 'tom':   return new TomVoice(ctx)
  }
}
