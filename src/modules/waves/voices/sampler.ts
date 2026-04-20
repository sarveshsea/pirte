// audio-buffer sampler. holds one buffer at a time; trigger plays it with
// optional pitch shift, start/end windowing, reverse, and one-shot decay.

import type { Voice, VoiceTriggerArgs } from './voice'
import { mtof } from './voice'

export class SamplerVoice implements Voice {
  readonly output: GainNode
  private ctx: AudioContext
  private buffer: AudioBuffer | null = null
  /** root note for the loaded sample; pitch shifts are relative to this. */
  private rootNote = 60

  constructor(ctx: AudioContext) {
    this.ctx = ctx
    this.output = ctx.createGain()
    this.output.gain.value = 0.9
  }

  setBuffer(buf: AudioBuffer | null, rootNote = 60) {
    this.buffer = buf
    this.rootNote = rootNote
  }

  dispose() { try { this.output.disconnect() } catch { /* */ } }

  trigger({ time, note, vel, params }: VoiceTriggerArgs) {
    if (!this.buffer) return
    const ctx = this.ctx
    const start = Math.max(0, (params?.start ?? 0) * this.buffer.duration)
    const end = Math.min(this.buffer.duration, (params?.end ?? 1) * this.buffer.duration)
    const duration = Math.max(0.01, end - start)
    const reverse = (params?.reverse ?? 0) > 0.5

    // pitch: semitones above rootNote → playback rate
    const semi = note - this.rootNote
    const rate = Math.pow(2, semi / 12)

    let buf = this.buffer
    if (reverse) {
      buf = ctx.createBuffer(this.buffer.numberOfChannels, this.buffer.length, this.buffer.sampleRate)
      for (let c = 0; c < this.buffer.numberOfChannels; c++) {
        const src = this.buffer.getChannelData(c)
        const dst = buf.getChannelData(c)
        for (let i = 0; i < src.length; i++) dst[i] = src[src.length - 1 - i]
      }
    }

    const src = ctx.createBufferSource()
    src.buffer = buf
    src.playbackRate.value = rate

    const g = ctx.createGain()
    g.gain.setValueAtTime(vel, time)
    src.connect(g).connect(this.output)

    src.start(time, start, duration / rate)
    src.stop(time + duration / rate + 0.01)
  }
}

/** decode an ArrayBuffer (e.g. from a fetched or dropped wav) into an AudioBuffer. */
export async function decodeSample(ctx: AudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
  return await ctx.decodeAudioData(data.slice(0))
}

/** resolve midi-note-C4 root regardless of context — convenience re-export. */
export const MIDDLE_C = 60
export { mtof }
