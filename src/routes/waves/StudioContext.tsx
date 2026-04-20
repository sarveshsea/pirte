// studio context — single owner of the engine + project state.
//
// the project object is mutated in place (to keep 12x64 step arrays cheap)
// and we bump a `rev` counter to trigger re-renders. every dispatcher
// mutates the project and calls bump(). callers read project via useStudio().

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { WavesEngine } from '../../modules/waves/engine'
import { makeProject, findPattern } from '../../modules/waves/pattern'
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
  triggerTrack: (i: number, note?: number) => void
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
  const projectRef = useRef<Project>(makeProject())
  const engineRef = useRef<WavesEngine | null>(null)
  const [rev, setRev] = useState(0)
  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [step, setStep] = useState(0)

  const bump = useCallback(() => setRev((r) => r + 1), [])

  useEffect(() => {
    const eng = new WavesEngine(projectRef.current)
    eng.setCallbacks({
      onStep: (s) => setStep(s),
    })
    engineRef.current = eng
    setReady(true)
    return () => {
      eng.stop()
      eng.dispose()
      engineRef.current = null
    }
  }, [])

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
    triggerTrack: (i, note = 60) => { engineRef.current?.triggerManual(i, note) },
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
    readTimeDomain: (out) => engineRef.current?.readTimeDomain(out),
    readFrequency: (out) => engineRef.current?.readFrequency(out),
    getTrackLevel: (i) => engineRef.current?.getTrackLevel(i) ?? [0, 0],
    getCompGR: () => engineRef.current?.getCompGR() ?? 0,
    getLimiterGR: () => engineRef.current?.getLimiterGR() ?? 0,
  }), [rev, ready, playing, step, bump, mutTrack])

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

export function useStudio(): StudioAPI {
  const v = useContext(Ctx)
  if (!v) throw new Error('useStudio outside StudioProvider')
  return v
}
