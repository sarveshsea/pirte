// studio context — single owner of the engine + project state.
//
// the project object is mutated in place (to keep 12x64 step arrays cheap)
// and we bump a `rev` counter to trigger re-renders. every dispatcher
// mutates the project and calls bump(). callers read project via useStudio().

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { WavesEngine } from '../../modules/waves/engine'
import { clearPattern, copyPattern, findPattern, makeProject } from '../../modules/waves/pattern'
import {
  History, clearAutosave, exportProject, importProject, loadAutosave, saveAutosave,
} from '../../modules/waves/project'
import { MidiInput, type MidiDevice } from '../../modules/waves/midi'
import type {
  BitcrushParams, CompParams, DelayParams, FilterType, LimiterParams,
  PatternId, Project, ReverbParams, Track, VoiceKind,
} from '../../modules/waves/types'

type StudioAPI = {
  project: Project
  rev: number                         // bumps on any mutation
  ready: boolean
  playing: boolean
  step: number
  // transport
  toggleTransport: () => void
  setBpm: (v: number) => void
  setSwing: (v: number) => void
  setMasterGain: (v: number) => void
  // pattern
  setActivePattern: (id: PatternId) => void
  toggleCell: (trackIdx: number, stepIdx: number) => void
  // track state
  setTrackGain: (i: number, v: number) => void
  setTrackPan: (i: number, v: number) => void
  setTrackMute: (i: number, v: boolean) => void
  setTrackSolo: (i: number, v: boolean) => void
  setTrackVoice: (i: number, v: VoiceKind) => void
  setTrackFilter: (i: number, type: FilterType, cutoff: number, res: number) => void
  setTrackDrive: (i: number, v: number) => void
  setTrackSendA: (i: number, v: number) => void
  setTrackSendB: (i: number, v: number) => void
  setTrackArmed: (i: number, v: boolean) => void
  triggerTrack: (i: number, note?: number) => void
  loadSample: (i: number, buf: ArrayBuffer, name: string) => Promise<void>
  // pattern ops
  copyActivePatternTo: (id: PatternId) => void
  clearActivePattern: () => void
  // undo / redo
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  // project i/o
  exportProject: () => void
  importProject: (file: File) => Promise<void>
  resetProject: () => void
  // midi
  midiAvailable: boolean
  midiDevices: MidiDevice[]
  midiActiveId: string | null
  initMidi: () => Promise<void>
  selectMidi: (id: string | null) => void
  // master fx
  setMasterBitcrush: (p: Partial<BitcrushParams>) => void
  setMasterDelay: (p: Partial<DelayParams>) => void
  setMasterReverb: (p: Partial<ReverbParams>) => void
  setMasterComp: (p: Partial<CompParams>) => void
  setMasterLimiter: (p: Partial<LimiterParams>) => void
  // read-only handles for visualizer / meters
  readTimeDomain: (out: Uint8Array) => void
  readFrequency: (out: Uint8Array) => void
  getTrackLevel: (i: number) => [number, number]
  getCompGR: () => number
  getLimiterGR: () => number
}

const Ctx = createContext<StudioAPI | null>(null)

export function StudioProvider({ children }: { children: ReactNode }) {
  // project kept in a ref so mutations don't churn React on every step
  const projectRef = useRef<Project>(loadAutosave() ?? makeProject())
  const engineRef = useRef<WavesEngine | null>(null)
  const historyRef = useRef<History>(new History())
  const midiRef = useRef<MidiInput>(new MidiInput())
  const [rev, setRev] = useState(0)
  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [step, setStep] = useState(0)
  const [midiDevices, setMidiDevices] = useState<MidiDevice[]>([])
  const [midiActiveId, setMidiActiveId] = useState<string | null>(null)

  const bump = useCallback(() => setRev((r) => r + 1), [])

  // snapshot before any mutation
  const snapshot = useCallback(() => {
    historyRef.current.push(projectRef.current)
  }, [])

  // autosave on project changes
  useEffect(() => {
    if (!ready) return
    const id = setTimeout(() => saveAutosave(projectRef.current), 500)
    return () => clearTimeout(id)
  }, [rev, ready])

  const [audioError, setAudioError] = useState<string | null>(null)
  useEffect(() => {
    let eng: WavesEngine
    try {
      eng = new WavesEngine(projectRef.current)
    } catch (e) {
      // AudioContext can throw in cross-origin iframes, ios pre-gesture, etc.
      setAudioError(e instanceof Error ? e.message : 'audio unavailable in this context')
      return
    }
    eng.setCallbacks({
      onStep: (s) => setStep(s),
    })
    engineRef.current = eng
    historyRef.current.push(projectRef.current)
    setReady(true)
    return () => {
      try { eng.stop() } catch { /* ignore */ }
      try { eng.dispose() } catch { /* ignore */ }
      engineRef.current = null
      try { midiRef.current.dispose() } catch { /* ignore */ }
    }
  }, [])

  // replace entire project (undo/redo/import)
  const replaceProject = useCallback((p: Project) => {
    projectRef.current = p
    const eng = engineRef.current
    if (eng) {
      eng.replaceProject(p)
      eng.syncMaster()
      for (let i = 0; i < p.patterns[0].tracks.length; i++) eng.syncTrack(i)
      eng.recomputeSolo()
    }
    bump()
  }, [bump])

  const mutTrack = useCallback((i: number, f: (t: Track) => void) => {
    const p = projectRef.current
    const pattern = findPattern(p, p.activePattern)
    const t = pattern.tracks[i]
    if (!t) return
    f(t)
    engineRef.current?.syncTrack(i)
    bump()
  }, [bump])

  const api: StudioAPI = useMemo(() => ({
    project: projectRef.current,
    rev,
    ready,
    playing,
    step,
    toggleTransport: () => {
      const eng = engineRef.current
      if (!eng) return
      if (eng.isPlaying) { eng.stop(); setPlaying(false) }
      else { eng.start(); setPlaying(true) }
    },
    setBpm: (v) => {
      projectRef.current.bpm = v
      engineRef.current?.setBpm(v)
      bump()
    },
    setSwing: (v) => {
      projectRef.current.swing = v
      engineRef.current?.setSwing(v)
      bump()
    },
    setMasterGain: (v) => {
      projectRef.current.master.gain = v
      engineRef.current?.setMasterGain(v)
      bump()
    },
    setActivePattern: (id) => {
      projectRef.current.activePattern = id
      bump()
    },
    toggleCell: (i, s) => {
      const p = projectRef.current
      const pattern = findPattern(p, p.activePattern)
      const cell = pattern.tracks[i]?.steps[s]
      if (!cell) return
      snapshot()
      cell.on = !cell.on
      bump()
    },
    setTrackGain: (i, v) => mutTrack(i, (t) => { t.gain = v }),
    setTrackPan: (i, v) => mutTrack(i, (t) => { t.pan = v }),
    setTrackMute: (i, v) => mutTrack(i, (t) => { t.mute = v }),
    setTrackSolo: (i, v) => {
      mutTrack(i, (t) => { t.solo = v })
      engineRef.current?.recomputeSolo()
    },
    setTrackVoice: (i, v) => mutTrack(i, (t) => { t.voice = v; t.voiceParams = {} }),
    setTrackFilter: (i, type, cutoff, res) => mutTrack(i, (t) => {
      t.filter.type = type; t.filter.cutoff = cutoff; t.filter.res = res
    }),
    setTrackDrive: (i, v) => mutTrack(i, (t) => { t.drive = v }),
    setTrackSendA: (i, v) => mutTrack(i, (t) => { t.sendA = v }),
    setTrackSendB: (i, v) => mutTrack(i, (t) => { t.sendB = v }),
    setTrackArmed: (i, v) => {
      // mutually exclusive arm: arming a track disarms the others
      const p = projectRef.current
      const pattern = findPattern(p, p.activePattern)
      for (let j = 0; j < pattern.tracks.length; j++) pattern.tracks[j].armed = v && j === i
      bump()
    },
    triggerTrack: (i, note = 60) => { engineRef.current?.triggerManual(i, note) },
    loadSample: async (i, buf, name) => {
      const eng = engineRef.current
      if (!eng) return
      const audioBuf = await eng.ctx.decodeAudioData(buf.slice(0))
      // swap voice to sampler if it isn't already
      const pattern = findPattern(projectRef.current, projectRef.current.activePattern)
      const t = pattern.tracks[i]
      if (!t) return
      if (t.voice !== 'sampler') { t.voice = 'sampler'; t.voiceParams = {}; eng.syncTrack(i) }
      eng.setTrackSample(i, audioBuf, 60)
      t.sampleSlot = { kind: 'user', dataUrl: '', name }
      bump()
    },
    setMasterBitcrush: (p) => {
      Object.assign(projectRef.current.master.bitcrush, p)
      engineRef.current?.syncMaster(); bump()
    },
    setMasterDelay: (p) => {
      Object.assign(projectRef.current.master.delay, p)
      engineRef.current?.syncMaster(); bump()
    },
    setMasterReverb: (p) => {
      Object.assign(projectRef.current.master.reverb, p)
      engineRef.current?.syncMaster(); bump()
    },
    setMasterComp: (p) => {
      Object.assign(projectRef.current.master.comp, p)
      engineRef.current?.syncMaster(); bump()
    },
    setMasterLimiter: (p) => {
      Object.assign(projectRef.current.master.limiter, p)
      engineRef.current?.syncMaster(); bump()
    },
    copyActivePatternTo: (to) => {
      const p = projectRef.current
      if (to === p.activePattern) return
      snapshot()
      copyPattern(p, p.activePattern, to)
      bump()
    },
    clearActivePattern: () => {
      snapshot()
      clearPattern(projectRef.current, projectRef.current.activePattern)
      bump()
    },
    undo: () => {
      const prev = historyRef.current.undo()
      if (prev) replaceProject(prev)
    },
    redo: () => {
      const next = historyRef.current.redo()
      if (next) replaceProject(next)
    },
    canUndo: historyRef.current.canUndo(),
    canRedo: historyRef.current.canRedo(),
    exportProject: () => exportProject(projectRef.current, `waves-${projectRef.current.name}-${Date.now()}.json`),
    importProject: async (file) => {
      const p = await importProject(file)
      historyRef.current.clear()
      historyRef.current.push(p)
      replaceProject(p)
    },
    resetProject: () => {
      const p = makeProject()
      clearAutosave()
      historyRef.current.clear()
      historyRef.current.push(p)
      replaceProject(p)
    },
    readTimeDomain: (out) => engineRef.current?.readTimeDomain(out),
    readFrequency: (out) => engineRef.current?.readFrequency(out),
    getTrackLevel: (i) => engineRef.current?.getTrackLevel(i) ?? [0, 0],
    getCompGR: () => engineRef.current?.getCompGR() ?? 0,
    getLimiterGR: () => engineRef.current?.getLimiterGR() ?? 0,
    midiAvailable: midiRef.current.available(),
    midiDevices,
    midiActiveId,
    initMidi: async () => {
      await midiRef.current.init()
      setMidiDevices(midiRef.current.list())
      midiRef.current.onNote((e) => {
        const eng = engineRef.current
        if (!eng) return
        const pattern = findPattern(projectRef.current, projectRef.current.activePattern)
        const armed = pattern.tracks.findIndex((t) => t.armed)
        if (armed < 0) return
        if (e.kind === 'on') {
          eng.triggerManual(armed, e.note, Math.max(0.05, e.velocity / 127), 0.4)
        }
      })
    },
    selectMidi: (id) => {
      midiRef.current.select(id)
      setMidiActiveId(id)
    },
  }), [rev, ready, playing, step, bump, mutTrack, snapshot, replaceProject, midiDevices, midiActiveId])

  if (audioError) {
    return (
      <div className="mx-auto grid max-w-[520px] place-items-center gap-3 p-10 text-center text-[13px] text-[var(--color-dim)]">
        <div className="text-[16px] text-[var(--color-fg)]">audio unavailable</div>
        <div>
          this browser blocked the audio context ({audioError}). try a fresh tab
          or a non-embedded view — waves needs web audio to boot.
        </div>
      </div>
    )
  }

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

export function useStudio(): StudioAPI {
  const v = useContext(Ctx)
  if (!v) throw new Error('useStudio outside StudioProvider')
  return v
}
