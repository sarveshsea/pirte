// voice factory — maps a VoiceKind to a concrete Voice instance.

import type { VoiceKind } from '../types'
import type { Voice } from './voice'
import { createDrumVoice } from './drum'
import { FmVoice } from './fm'
import { SubVoice } from './sub'
import { PluckVoice } from './pluck'
import { PadVoice } from './pad'
import { WavetableVoice } from './wavetable'
import { SamplerVoice } from './sampler'

export function createVoice(kind: VoiceKind, ctx: AudioContext): Voice {
  switch (kind) {
    case 'kick': case 'snare': case 'hat': case 'clap': case 'tom':
      return createDrumVoice(kind, ctx)
    case 'fm':        return new FmVoice(ctx)
    case 'sub':       return new SubVoice(ctx)
    case 'pluck':     return new PluckVoice(ctx)
    case 'pad':       return new PadVoice(ctx)
    case 'wavetable': return new WavetableVoice(ctx)
    case 'sampler':   return new SamplerVoice(ctx)
  }
}

export type { Voice, VoiceTriggerArgs } from './voice'
export { SamplerVoice } from './sampler'
