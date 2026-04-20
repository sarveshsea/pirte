import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Tile from '../components/Tile'
import Slider from '../components/Slider'
import { RAMPS, convert, type AsciiFrame } from '../modules/asciiConvert'

type Mix = 'mono' | 'original'

export default function Ascii() {
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [rampName, setRampName] = useState<keyof typeof RAMPS | 'Custom'>('Standard')
  const [customRamp, setCustomRamp] = useState('@%#*+=-:. ')
  const [densityBias, setDensityBias] = useState(1)
  const [invert, setInvert] = useState(false)
  const [width, setWidth] = useState(120)
  const [heightScale, setHeightScale] = useState(1)
  const [pixelate, setPixelate] = useState(0)
  const [brightness, setBrightness] = useState(0)
  const [contrast, setContrast] = useState(1)
  const [gamma, setGamma] = useState(1)
  const [mix, setMix] = useState<Mix>('mono')
  const [bg, setBg] = useState<'transparent' | 'solid'>('solid')
  const [bgColor, setBgColor] = useState('#000000')
  const [frame, setFrame] = useState<AsciiFrame | null>(null)
  const preRef = useRef<HTMLPreElement>(null)
  const drop = useRef<HTMLDivElement>(null)

  const ramp = rampName === 'Custom' ? customRamp : RAMPS[rampName]

  const recompute = useCallback(() => {
    if (!image) return
    const f = convert(image, {
      ramp,
      densityBias,
      invert,
      tone: { brightness, contrast, gamma },
      sampling: { width, heightScale, pixelate },
    }, mix === 'original')
    setFrame(f)
  }, [image, ramp, densityBias, invert, brightness, contrast, gamma, width, heightScale, pixelate, mix])

  useEffect(() => { recompute() }, [recompute])

  const loadFile = (file: File) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => { setImage(img); URL.revokeObjectURL(url) }
    img.src = url
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer.files?.[0]
    if (f) loadFile(f)
  }

  const copyText = async () => {
    if (!frame) return
    await navigator.clipboard.writeText(frame.chars)
  }

  const downloadText = () => {
    if (!frame) return
    const blob = new Blob([frame.chars], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'pirte-ascii.txt'
    a.click()
  }

  const downloadPng = () => {
    if (!frame || !preRef.current) return
    const scale = 2
    const cw = 7 * scale, ch = 11 * scale
    const canvas = document.createElement('canvas')
    canvas.width = frame.cols * cw
    canvas.height = frame.rows * ch
    const ctx = canvas.getContext('2d')!
    if (bg === 'solid') { ctx.fillStyle = bgColor; ctx.fillRect(0, 0, canvas.width, canvas.height) }
    ctx.font = `${10 * scale}px "JetBrains Mono Variable", monospace`
    ctx.textBaseline = 'top'
    const lines = frame.chars.split('\n')
    for (let y = 0; y < lines.length; y++) {
      for (let x = 0; x < lines[y].length; x++) {
        if (mix === 'original' && frame.colors) {
          const j = (y * frame.cols + x) * 4
          ctx.fillStyle = `rgb(${frame.colors[j]},${frame.colors[j + 1]},${frame.colors[j + 2]})`
        } else {
          ctx.fillStyle = '#e8e8e8'
        }
        ctx.fillText(lines[y][x], x * cw, y * ch)
      }
    }
    canvas.toBlob((blob) => {
      if (!blob) return
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'pirte-ascii.png'
      a.click()
    })
  }

  const previewSpans = useMemo(() => {
    if (!frame || mix !== 'original' || !frame.colors) return null
    const lines = frame.chars.split('\n')
    const out: React.ReactNode[] = []
    for (let y = 0; y < lines.length; y++) {
      for (let x = 0; x < lines[y].length; x++) {
        const j = (y * frame.cols + x) * 4
        const r = frame.colors[j], g = frame.colors[j + 1], b = frame.colors[j + 2]
        out.push(<span key={`${x},${y}`} style={{ color: `rgb(${r},${g},${b})` }}>{lines[y][x]}</span>)
      }
      out.push('\n')
    }
    return out
  }, [frame, mix])

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
      <Tile label="ascii · preview" code="03" footer={<span>{frame ? `${frame.cols}×${frame.rows}` : 'no image'}</span>}>
        <div
          ref={drop}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          className="relative h-[72vh] w-full overflow-auto"
          style={{ background: bg === 'solid' ? bgColor : 'transparent' }}
        >
          {!image && (
            <label data-interactive className="absolute inset-0 flex cursor-none flex-col items-center justify-center gap-2 text-[var(--color-dim)]">
              <span className="text-[32px]">+</span>
              <span className="text-[13px] tracking-[0.1em]">drop or browse · png jpg webp svg</span>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) loadFile(f) }} />
            </label>
          )}
          {frame && (
            <pre
              ref={preRef}
              className="m-0 whitespace-pre text-[12px] leading-[1.05]"
              style={{ color: mix === 'mono' ? 'var(--color-fg)' : undefined }}
            >
              {mix === 'original' ? previewSpans : frame.chars}
            </pre>
          )}
        </div>
      </Tile>

      <div className="flex flex-col gap-6">
        <Tile label="source">
          <div className="flex flex-col gap-2 p-3">
            <label data-interactive className="cursor-none border border-[var(--color-line)] px-2 py-2 text-[13px] tracking-[0.06em] text-[var(--color-dim)] hover:border-[var(--color-fg)] hover:text-[var(--color-fg)]">
              + upload image
              <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) loadFile(f) }} />
            </label>
          </div>
        </Tile>

        <Tile label="character ramp">
          <div className="flex flex-col gap-2 p-3">
            <div className="grid grid-cols-2 gap-1 text-[13px] tracking-[0.06em]">
              {(['Standard', 'Blocks', 'Detailed', 'Minimal', 'Custom'] as const).map((r) => (
                <button
                  key={r}
                  data-interactive
                  onClick={() => setRampName(r)}
                  className={`!px-2 !py-1 ${r === rampName ? 'border-[var(--color-fg)] text-[var(--color-fg)]' : 'text-[var(--color-dim)]'}`}
                >{r.toLowerCase()}</button>
              ))}
            </div>
            <input
              value={rampName === 'Custom' ? customRamp : ramp}
              onChange={(e) => { setRampName('Custom'); setCustomRamp(e.target.value) }}
              className="w-full border border-[var(--color-line)] bg-transparent px-2 py-1 font-mono text-[13px] text-[var(--color-fg)] outline-none"
            />
            <Slider label="density bias" min={0.3} max={2} step={0.01} value={densityBias} onChange={setDensityBias} format={(v) => v.toFixed(2)} />
            <label data-interactive className="flex cursor-none items-center gap-2 text-[13px] tracking-[0.06em] text-[var(--color-dim)]">
              <input type="checkbox" checked={invert} onChange={(e) => setInvert(e.target.checked)} /> invert
            </label>
          </div>
        </Tile>

        <Tile label="sampling">
          <div className="flex flex-col gap-2 p-3">
            <Slider label="width"        min={20}  max={300} step={1}    value={width}       onChange={setWidth} />
            <Slider label="height scale" min={0.5} max={2}   step={0.05} value={heightScale} onChange={setHeightScale} format={(v) => v.toFixed(2)} />
            <Slider label="pixelate"     min={0}   max={12}  step={1}    value={pixelate}    onChange={setPixelate} />
          </div>
        </Tile>

        <Tile label="tone">
          <div className="flex flex-col gap-2 p-3">
            <Slider label="brightness" min={-0.5} max={0.5} step={0.01} value={brightness} onChange={setBrightness} format={(v) => v.toFixed(2)} />
            <Slider label="contrast"   min={0.2}  max={3}   step={0.01} value={contrast}   onChange={setContrast}   format={(v) => v.toFixed(2)} />
            <Slider label="gamma"      min={0.3}  max={2.5} step={0.01} value={gamma}      onChange={setGamma}      format={(v) => v.toFixed(2)} />
          </div>
        </Tile>

        <Tile label="mix">
          <div className="flex flex-col gap-2 p-3">
            <div className="grid grid-cols-2 gap-1 text-[13px] tracking-[0.06em]">
              <button data-interactive onClick={() => setMix('mono')}     className={`!px-2 !py-1 ${mix === 'mono'     ? 'border-[var(--color-fg)] text-[var(--color-fg)]' : 'text-[var(--color-dim)]'}`}>mono</button>
              <button data-interactive onClick={() => setMix('original')} className={`!px-2 !py-1 ${mix === 'original' ? 'border-[var(--color-fg)] text-[var(--color-fg)]' : 'text-[var(--color-dim)]'}`}>original</button>
            </div>
            <div className="grid grid-cols-2 gap-1 text-[13px] tracking-[0.06em]">
              <button data-interactive onClick={() => setBg('transparent')} className={`!px-2 !py-1 ${bg === 'transparent' ? 'border-[var(--color-fg)] text-[var(--color-fg)]' : 'text-[var(--color-dim)]'}`}>transparent</button>
              <button data-interactive onClick={() => setBg('solid')}       className={`!px-2 !py-1 ${bg === 'solid'       ? 'border-[var(--color-fg)] text-[var(--color-fg)]' : 'text-[var(--color-dim)]'}`}>solid</button>
            </div>
            <label data-interactive className="flex cursor-none items-center justify-between text-[13px] tracking-[0.06em] text-[var(--color-dim)]">
              bg color <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="h-6 w-10 border border-[var(--color-line)] bg-transparent" />
            </label>
          </div>
        </Tile>

        <Tile label="export">
          <div className="flex flex-col gap-2 p-3 text-[13px] tracking-[0.06em]">
            <button data-interactive onClick={copyText}>copy text</button>
            <button data-interactive onClick={downloadText}>download .txt</button>
            <button data-interactive onClick={downloadPng}>download .png</button>
          </div>
        </Tile>
      </div>
    </div>
  )
}
