// lightweight webmidi input wrapper. pirte only uses note-on/note-off events;
// clock, cc, and pitch-bend are punted to phase d.

export type MidiDevice = { id: string; name: string; manufacturer?: string }
export type MidiHandler = (event: {
  kind: 'on' | 'off'
  note: number
  velocity: number
  channel: number
  time: number
}) => void

const MIDI_NOTE_ON = 0x90
const MIDI_NOTE_OFF = 0x80

export class MidiInput {
  private access: MIDIAccess | null = null
  private handler: MidiHandler | null = null
  private activeInputId: string | null = null

  available(): boolean {
    return typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator
  }

  async init(): Promise<void> {
    if (!this.available()) throw new Error('webmidi unavailable')
    this.access = await navigator.requestMIDIAccess({ sysex: false })
  }

  list(): MidiDevice[] {
    if (!this.access) return []
    const out: MidiDevice[] = []
    for (const input of this.access.inputs.values()) {
      out.push({
        id: input.id,
        name: input.name ?? 'midi input',
        manufacturer: input.manufacturer ?? undefined,
      })
    }
    return out
  }

  select(id: string | null) {
    if (!this.access) return
    // disconnect everything first
    for (const input of this.access.inputs.values()) input.onmidimessage = null
    this.activeInputId = id
    if (!id) return
    const input = this.access.inputs.get(id)
    if (!input) return
    input.onmidimessage = (e) => {
      if (!this.handler) return
      const data = e.data
      if (!data || data.length < 3) return
      const status = data[0] & 0xf0
      const channel = data[0] & 0x0f
      const note = data[1]
      const velocity = data[2]
      if (status === MIDI_NOTE_ON && velocity > 0) {
        this.handler({ kind: 'on', note, velocity, channel, time: e.timeStamp })
      } else if (status === MIDI_NOTE_OFF || (status === MIDI_NOTE_ON && velocity === 0)) {
        this.handler({ kind: 'off', note, velocity, channel, time: e.timeStamp })
      }
    }
  }

  onNote(cb: MidiHandler | null) { this.handler = cb }

  get activeId(): string | null { return this.activeInputId }

  dispose() { this.select(null); this.handler = null }
}
