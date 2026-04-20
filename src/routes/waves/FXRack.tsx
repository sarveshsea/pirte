import { CompMeter, Knob } from '../../components/waves/primitives'
import { useStudio } from './StudioContext'

export default function FXRack() {
  const s = useStudio()
  const m = s.project.master

  return (
    <div className="flex flex-wrap gap-6 p-3">
      {/* bitcrush */}
      <Section title="bitcrush">
        <Knob
          label="bits" min={3} max={16} step={1}
          value={m.bitcrush.bits}
          defaultValue={16}
          onChange={(v) => s.setMasterBitcrush({ bits: v })}
          format={(v) => String(v)}
          accent="#ffb86a"
        />
        <Knob
          label="decim" min={1} max={16} step={1}
          value={m.bitcrush.downsample}
          defaultValue={1}
          onChange={(v) => s.setMasterBitcrush({ downsample: v })}
          format={(v) => String(v)}
          accent="#ffb86a"
        />
        <Knob
          label="mix" min={0} max={1} step={0.01}
          value={m.bitcrush.mix}
          defaultValue={0}
          onChange={(v) => s.setMasterBitcrush({ mix: v })}
          format={(v) => `${Math.round(v * 100)}`}
          accent="#ffb86a"
        />
      </Section>

      {/* compressor */}
      <Section title="compressor">
        <Knob
          label="thr" min={-60} max={0} step={1}
          value={m.comp.threshold} defaultValue={-14}
          onChange={(v) => s.setMasterComp({ threshold: v })}
          format={(v) => `${v}`}
          accent="#ffb86a"
        />
        <Knob
          label="ratio" min={1} max={20} step={0.5}
          value={m.comp.ratio} defaultValue={4}
          onChange={(v) => s.setMasterComp({ ratio: v })}
          format={(v) => `${v}:1`}
          accent="#ffb86a"
        />
        <Knob
          label="atk" min={0.0005} max={0.1} step={0.0005}
          value={m.comp.attack} defaultValue={0.005}
          onChange={(v) => s.setMasterComp({ attack: v })}
          format={(v) => `${(v * 1000).toFixed(1)}ms`}
          accent="#ffb86a"
        />
        <Knob
          label="rel" min={0.02} max={1} step={0.01}
          value={m.comp.release} defaultValue={0.15}
          onChange={(v) => s.setMasterComp({ release: v })}
          format={(v) => `${(v * 1000).toFixed(0)}ms`}
          accent="#ffb86a"
        />
        <div className="flex flex-col items-center gap-1">
          <button
            data-interactive
            onClick={() => s.setMasterComp({ sidechain: !m.comp.sidechain })}
            className={`!px-2 !py-1 !text-[11px] ${m.comp.sidechain ? '!border-[#ffb86a] !text-[#ffb86a]' : '!border-[var(--color-line)] !text-[var(--color-dim)]'}`}
          >
            sidechain
          </button>
          <CompMeter getGR={() => s.getCompGR()} accent="#ffb86a" />
        </div>
      </Section>

      {/* delay */}
      <Section title="delay">
        <Knob
          label="time" min={0.05} max={1.5} step={0.01}
          value={m.delay.time} defaultValue={0.375}
          onChange={(v) => s.setMasterDelay({ time: v })}
          format={(v) => `${(v * 1000).toFixed(0)}ms`}
          accent="#6ab8ff"
        />
        <Knob
          label="fdbk" min={0} max={0.95} step={0.01}
          value={m.delay.feedback} defaultValue={0.35}
          onChange={(v) => s.setMasterDelay({ feedback: v })}
          format={(v) => `${Math.round(v * 100)}`}
          accent="#6ab8ff"
        />
        <Knob
          label="tone" min={0} max={1} step={0.01}
          value={m.delay.tone} defaultValue={0.5}
          onChange={(v) => s.setMasterDelay({ tone: v })}
          format={(v) => `${Math.round(v * 100)}`}
          accent="#6ab8ff"
        />
        <Knob
          label="mix" min={0} max={1} step={0.01}
          value={m.delay.mix} defaultValue={0}
          onChange={(v) => s.setMasterDelay({ mix: v })}
          format={(v) => `${Math.round(v * 100)}`}
          accent="#6ab8ff"
        />
      </Section>

      {/* reverb */}
      <Section title="reverb">
        <Knob
          label="size" min={0} max={1} step={0.01}
          value={m.reverb.size} defaultValue={0.6}
          onChange={(v) => s.setMasterReverb({ size: v })}
          format={(v) => `${Math.round(v * 100)}`}
          accent="#d46cff"
        />
        <Knob
          label="damp" min={0} max={1} step={0.01}
          value={m.reverb.damp} defaultValue={0.4}
          onChange={(v) => s.setMasterReverb({ damp: v })}
          format={(v) => `${Math.round(v * 100)}`}
          accent="#d46cff"
        />
        <Knob
          label="width" min={0} max={1} step={0.01}
          value={m.reverb.width} defaultValue={1}
          onChange={(v) => s.setMasterReverb({ width: v })}
          format={(v) => `${Math.round(v * 100)}`}
          accent="#d46cff"
        />
        <Knob
          label="mix" min={0} max={1} step={0.01}
          value={m.reverb.mix} defaultValue={0}
          onChange={(v) => s.setMasterReverb({ mix: v })}
          format={(v) => `${Math.round(v * 100)}`}
          accent="#d46cff"
        />
      </Section>

      {/* limiter */}
      <Section title="limiter">
        <Knob
          label="ceil" min={-6} max={0} step={0.1}
          value={m.limiter.ceiling} defaultValue={-1}
          onChange={(v) => s.setMasterLimiter({ ceiling: v })}
          format={(v) => `${v.toFixed(1)}db`}
          accent="#ff7a7a"
        />
        <Knob
          label="rel" min={0.01} max={0.4} step={0.01}
          value={m.limiter.release} defaultValue={0.05}
          onChange={(v) => s.setMasterLimiter({ release: v })}
          format={(v) => `${(v * 1000).toFixed(0)}ms`}
          accent="#ff7a7a"
        />
        <CompMeter getGR={() => s.getLimiterGR()} accent="#ff7a7a" />
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[11px] tracking-[0.1em] text-[var(--color-dim)]">{title}</div>
      <div className="flex items-end gap-3">
        {children}
      </div>
    </div>
  )
}
