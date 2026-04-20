import type { Phase } from './colors'

// one lazy audio context; created the first time sound is enabled.
let ctx: AudioContext | null = null
let enabled = false

// pitches chosen to arc low → high on the top of the inhale and settle on release.
const FREQ: Record<Phase, number> = {
  inhale: 523.25, // c5
  hold1:  659.25, // e5
  exhale: 440.00, // a4
  hold2:  349.23, // f4
}

export function setSound(on: boolean) {
  enabled = on
  if (on && !ctx) {
    try { ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)() }
    catch { ctx = null }
  }
}

export function isSoundOn(): boolean {
  return enabled
}

export function tick(phase: Phase) {
  if (!enabled || !ctx) return
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  const now = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = FREQ[phase]
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.12, now + 0.015)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28)
  osc.connect(gain).connect(ctx.destination)
  osc.start(now)
  osc.stop(now + 0.32)
}
