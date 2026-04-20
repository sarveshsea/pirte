import { findPattern } from '../../modules/waves/pattern'
import { useStudio } from './StudioContext'

export default function StepGrid() {
  const s = useStudio()
  const pattern = findPattern(s.project, s.project.activePattern)
  const cols = pattern.stepsPerBar

  return (
    <div className="flex flex-col gap-[2px] overflow-x-auto p-2">
      {pattern.tracks.map((t, ti) => (
        <div key={ti} className="flex items-center gap-2">
          <span className="w-[52px] shrink-0 truncate text-[11px] tracking-[0.04em] text-[var(--color-dim)]">
            {t.name}
          </span>
          <div
            className="grid gap-[2px]"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(12px, 1fr))` }}
          >
            {t.steps.map((cell, si) => {
              const isCurrent = s.playing && si === s.step
              const isBeat = si % 4 === 0
              const isBar = si % 16 === 0
              return (
                <button
                  key={si}
                  data-interactive
                  onClick={() => s.toggleCell(ti, si)}
                  className={[
                    '!p-0 aspect-square !min-h-[14px] !rounded-[2px] !border-[1px] !text-[9px]',
                    cell.on
                      ? '!border-[var(--color-fg)] !bg-[var(--color-fg)] !text-[var(--color-bg)]'
                      : isBar
                        ? '!border-[#3a3a3a] !bg-[#1c1c1c] !text-[#3a3a3a]'
                        : isBeat
                          ? '!border-[#2a2a2a] !bg-[#161616]'
                          : '!border-[#202020] !bg-[#141414]',
                    isCurrent ? '!ring-1 !ring-[#50ffd8]' : '',
                  ].join(' ')}
                  aria-pressed={cell.on}
                  aria-label={`${t.name} step ${si + 1}${cell.on ? ' on' : ''}`}
                />
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
