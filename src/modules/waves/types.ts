// core types for the waves studio. everything in the studio flows through
// these shapes; engine.ts, scheduler.ts, pattern.ts, and the UI all agree
// here first.

export type VoiceKind =
  | 'kick' | 'snare' | 'hat' | 'clap' | 'tom'
  | 'fm' | 'wavetable' | 'sub' | 'pluck' | 'pad'
  | 'sampler'

export type FilterType = 'lp' | 'hp' | 'bp'

export type PatternId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H'

export const PATTERN_IDS: PatternId[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

export type StepsPerBar = 16 | 32 | 48 | 64

// one grid cell. small, packed, dense — we keep 12 * 64 = 768 of these per pattern.
export type Step = {
  on: boolean
  vel: number       // 0..7  — velocity bucket
  prob: number      // 0..100 — chance this hits on any given pass
  gate: number      // 0..16  — gate length in sixteenths-of-a-step
  note: number      // MIDI note, only meaningful for melodic voices
}

export const DEFAULT_STEP: Step = { on: false, vel: 4, prob: 100, gate: 8, note: 60 }

export type FilterParams = { type: FilterType; cutoff: number; res: number }

// per-track mixer strip. kept flat (no nested "effects" array) — keeps undo
// granularity sharp and json serialization obvious.
export type Track = {
  name: string
  voice: VoiceKind
  voiceParams: Record<string, number>
  mute: boolean
  solo: boolean
  armed: boolean
  gain: number          // 0..1 (stored linear; ui may show dB)
  pan: number           // -1..1
  filter: FilterParams
  drive: number         // 0..1 pre-gain into waveshaper
  sendA: number         // 0..1 to reverb bus
  sendB: number         // 0..1 to delay bus
  swing: number         // -0.3..0.3 additive to global swing
  steps: Step[]
  sampleSlot?: SampleSlotRef
}

export type SampleSlotRef =
  | { kind: 'builtin'; kit: 'k808' | 'k909' | 'kbreak'; slot: string }
  | { kind: 'user'; dataUrl: string; name: string }

export type Pattern = {
  id: PatternId
  stepsPerBar: StepsPerBar
  tracks: Track[]
}

export type SongBlock = { pattern: PatternId; bars: number }

export type DelayParams = { time: number; feedback: number; tone: number; mix: number }
export type ReverbParams = { size: number; damp: number; width: number; mix: number }
export type CompParams = { threshold: number; ratio: number; attack: number; release: number; sidechain: boolean; mix: number }
export type BitcrushParams = { bits: number; downsample: number; mix: number }
export type LimiterParams = { ceiling: number; release: number }

export type MasterBus = {
  gain: number
  bitcrush: BitcrushParams
  delay: DelayParams
  reverb: ReverbParams
  comp: CompParams
  limiter: LimiterParams
}

// phase-c mod matrix placeholder — shape defined now so persistence
// doesn't need a schema bump later.
export type ModRoute = {
  source: string        // e.g. 'lfo1' | 'env2' | 'macro1' | 'sidechain'
  dest: string          // e.g. 'track.3.filter.cutoff'
  depth: number         // -1..1
}

export type Project = {
  name: string
  bpm: number           // 40..240
  swing: number         // 0..1
  master: MasterBus
  patterns: Pattern[]   // length = 8
  activePattern: PatternId
  song: SongBlock[]     // may be empty
  modMatrix: ModRoute[] // empty until phase c
  version: number
}

export const PROJECT_VERSION = 2

export const NUM_TRACKS = 12

export const DEFAULT_TRACK_NAMES: readonly string[] = [
  'kick', 'snare', 'hat', 'clap', 'tom',
  'sub', 'bass', 'pluck', 'pad', 'lead',
  'fx', 'aux',
] as const

export const DEFAULT_TRACK_VOICES: readonly VoiceKind[] = [
  'kick', 'snare', 'hat', 'clap', 'tom',
  'sub', 'fm', 'pluck', 'pad', 'fm',
  'wavetable', 'sampler',
] as const
