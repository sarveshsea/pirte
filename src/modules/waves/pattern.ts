import {
  DEFAULT_STEP, DEFAULT_TRACK_NAMES, DEFAULT_TRACK_VOICES,
  NUM_TRACKS, PATTERN_IDS, PROJECT_VERSION,
  type Pattern, type PatternId, type Project, type Step, type StepsPerBar, type Track,
} from './types'

export function makeStep(partial?: Partial<Step>): Step {
  return { ...DEFAULT_STEP, ...partial }
}

export function makeTrack(i: number, stepsPerBar: StepsPerBar): Track {
  return {
    name: DEFAULT_TRACK_NAMES[i] ?? `t${i + 1}`,
    voice: DEFAULT_TRACK_VOICES[i] ?? 'fm',
    voiceParams: {},
    mute: false,
    solo: false,
    armed: false,
    gain: 0.8,
    pan: 0,
    filter: { type: 'lp', cutoff: 20000, res: 0.3 },
    drive: 0,
    sendA: 0,
    sendB: 0,
    swing: 0,
    steps: Array.from({ length: stepsPerBar }, () => makeStep()),
  }
}

export function makePattern(id: PatternId, stepsPerBar: StepsPerBar = 32): Pattern {
  return {
    id,
    stepsPerBar,
    tracks: Array.from({ length: NUM_TRACKS }, (_, i) => makeTrack(i, stepsPerBar)),
  }
}

export function makeProject(): Project {
  const patterns = PATTERN_IDS.map((id) => makePattern(id))
  // seed pattern A with a gentle default groove so a fresh project is audible on play
  const a = patterns[0]
  const kick = a.tracks[0].steps
  const snare = a.tracks[1].steps
  const hat = a.tracks[2].steps
  ;[0, 8, 16, 24].forEach((i) => { kick[i].on = true; kick[i].vel = 6 })
  ;[8, 24].forEach((i) => { snare[i].on = true; snare[i].vel = 5 })
  for (let i = 0; i < a.stepsPerBar; i += 2) { hat[i].on = true; hat[i].vel = 3 }
  return {
    name: 'untitled',
    bpm: 120,
    swing: 0,
    master: {
      gain: 0.6,
      bitcrush: { bits: 16, downsample: 1, mix: 0 },
      delay: { time: 0.375, feedback: 0.35, tone: 0.5, mix: 0 },
      reverb: { size: 0.6, damp: 0.4, width: 1, mix: 0 },
      comp: { threshold: -14, ratio: 4, attack: 0.005, release: 0.15, sidechain: false, mix: 1 },
      limiter: { ceiling: -1, release: 0.05 },
    },
    patterns,
    activePattern: 'A',
    song: [],
    modMatrix: [],
    version: PROJECT_VERSION,
  }
}

export function findPattern(p: Project, id: PatternId): Pattern {
  const idx = PATTERN_IDS.indexOf(id)
  return p.patterns[idx]
}

export function cloneStep(s: Step): Step { return { ...s } }

export function cloneTrack(t: Track): Track {
  return {
    ...t,
    voiceParams: { ...t.voiceParams },
    filter: { ...t.filter },
    steps: t.steps.map(cloneStep),
    sampleSlot: t.sampleSlot ? { ...t.sampleSlot } as Track['sampleSlot'] : undefined,
  }
}

export function clonePattern(p: Pattern): Pattern {
  return { ...p, tracks: p.tracks.map(cloneTrack) }
}

export function copyPattern(project: Project, from: PatternId, to: PatternId) {
  const src = findPattern(project, from)
  const dst = clonePattern(src)
  dst.id = to
  project.patterns[PATTERN_IDS.indexOf(to)] = dst
}

export function clearPattern(project: Project, id: PatternId) {
  const p = findPattern(project, id)
  for (const t of p.tracks) {
    for (const s of t.steps) { s.on = false; s.vel = 4; s.prob = 100; s.gate = 8 }
  }
}

export function resizePattern(p: Pattern, stepsPerBar: StepsPerBar) {
  if (p.stepsPerBar === stepsPerBar) return
  for (const t of p.tracks) {
    if (stepsPerBar < t.steps.length) {
      t.steps.length = stepsPerBar
    } else {
      while (t.steps.length < stepsPerBar) t.steps.push(makeStep())
    }
  }
  p.stepsPerBar = stepsPerBar
}
