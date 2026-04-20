// unified voice interface. every synth/sample voice implements this shape so
// the engine can route triggers without caring what's underneath.

export type VoiceTriggerArgs = {
  time: number          // audiocontext scheduling time
  note: number          // midi note 0..127
  vel: number           // 0..1
  gate: number          // seconds the note stays open
  params?: Record<string, number>
}

export interface Voice {
  /** call audio graph disconnection. scheduler will call once the last scheduled note is past. */
  dispose(): void
  /** schedule a note at `time`. */
  trigger(args: VoiceTriggerArgs): void
  /** input node parameters accept modulation; output feeds into the track strip. */
  readonly output: AudioNode
}

// shared helpers used by most voices ---------------------------------

export function mtof(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12)
}

export function expDecay(
  param: AudioParam, from: number, to: number, time: number, duration: number,
) {
  const safeTo = Math.max(0.00001, to)
  param.cancelScheduledValues(time)
  param.setValueAtTime(from, time)
  param.exponentialRampToValueAtTime(safeTo, time + duration)
}

export function adsrGain(
  ctx: BaseAudioContext, time: number,
  attack: number, decay: number, sustain: number, release: number, peak = 1,
): GainNode {
  const g = ctx.createGain()
  const p = g.gain
  p.setValueAtTime(0, time)
  p.linearRampToValueAtTime(peak, time + attack)
  p.exponentialRampToValueAtTime(Math.max(0.00001, peak * sustain), time + attack + decay)
  // caller can schedule the release ramp once it knows when the note ends
  ;(g as unknown as { _release: number })._release = release
  return g
}

export function scheduleRelease(gate: GainNode, releaseStart: number) {
  const release = (gate as unknown as { _release: number })._release ?? 0.05
  gate.gain.cancelScheduledValues(releaseStart)
  gate.gain.setValueAtTime(gate.gain.value, releaseStart)
  gate.gain.exponentialRampToValueAtTime(0.00001, releaseStart + Math.max(0.005, release))
}
