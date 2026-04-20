import Tile from '../components/Tile'
import { Link } from 'react-router-dom'

type Entry = {
  path: string
  code: string
  label: string
  desc: string
  keybinds?: string[]
}

type Section = { title: string; note?: string; items: Entry[] }

const SECTIONS: Section[] = [
  {
    title: 'visual',
    note: 'generative, procedural, or mathematical imagery.',
    items: [
      { path: '/fractals',     code: '01', label: 'fractals',     desc: 'mandelbrot + julia via webgl. pan/zoom with mouse.' },
      { path: '/attractors',   code: '02', label: 'attractors',   desc: 'lorenz · clifford · dejong strange attractors in canvas2d.' },
      { path: '/terminal',     code: '04', label: 'terminal',     desc: 'matrix rain · donut · life · flow · rule-30.', keybinds: ['← →  cycle scene', 'space  pause'] },
      { path: '/kaleidoscope', code: '07', label: 'kaleidoscope', desc: 'n-fold mirror over a perlin field.' },
      { path: '/folds',        code: '16', label: 'folds',        desc: 'generative gallery of deterministic compositions.' },
    ],
  },
  {
    title: 'interactive',
    note: 'playgrounds — your input drives the system.',
    items: [
      { path: '/ascii',      code: '03', label: 'ascii',     desc: 'image → text converter with ramp, bias, pixelate, mix controls.' },
      { path: '/pixels',     code: '05', label: 'pixels',    desc: 'upload an image, get a paint-by-number puzzle.', keybinds: ['click  fill a cell'] },
      { path: '/sprites',    code: '08', label: 'sprites',   desc: 'particle sandbox with attract/repel/vortex forces.', keybinds: ['a f v i  modes', 'click  pulse'] },
    ],
  },
  {
    title: 'audio',
    items: [
      { path: '/waves', code: '09', label: 'waves', desc: 'edm step sequencer + live oscilloscope + spectrum. keyboard synth overlay.', keybinds: ['space  play/stop', 'c  clear', 'r  randomize', 'a-;  play notes'] },
    ],
  },
  {
    title: 'meditative',
    items: [
      { path: '/breathe', code: '11', label: 'breathe', desc: 'box-breathing guide with phase colors, sine-tick audio, and a waveform mode.', keybinds: ['space  pause', 'v  mode (circle / waveform)', 'm  sound on/off', 'r  reset cycle'] },
    ],
  },
  {
    title: 'game',
    items: [
      { path: '/doom', code: '10', label: 'doom', desc: 'ascii raycast homage to e1m1 with imps, fireballs, a pistol, and a doom-style hud.', keybinds: ['wasd  move', '← →  turn', 'space  fire', 'e  open', 'p  pause', 'r  restart'] },
    ],
  },
  {
    title: 'live',
    note: 'pulls from real external data.',
    items: [
      { path: '/time',  code: '06', label: 'time',  desc: 'global clocks across six cities + session timer.' },
      { path: '/orbit', code: '17', label: 'orbit', desc: 'iss telemetry, live altitude/velocity, ground-track overlay.' },
      { path: '/radio', code: '18', label: 'radio', desc: 'curated global stations streamed directly · clickable pins on an ascii world map.' },
    ],
  },
  {
    title: 'future ascii',
    items: [
      { path: '/starfield', code: '12', label: 'starfield', desc: '3d ascii flythrough. mouse steers.', keybinds: ['mouse  steer', '↑ ↓  speed', 'space  warp', 'r  reset'] },
    ],
  },
  {
    title: 'science',
    note: 'real biological phenomena rendered as ascii data-art.',
    items: [
      { path: '/microbes', code: '20', label: 'microbes', desc: 'physarum (jones 2010) · gray-scott morphogenesis (pearson 1993) · e.coli run-and-tumble (berg 1972) · fitzhugh-nagumo spiral waves. live parameters, metrics, and sparklines.', keybinds: ['← →  cycle preset', 'r  reseed', 'space  pause', '1–4  gray-scott regime'] },
    ],
  },
]

const GLOBAL_KEYS: [string, string][] = [
  ['⌘k / ctrl+k', 'command palette — jump to any module'],
  ['?',           'toggle shortcuts overlay'],
  ['shift+space', 'tiling window manager overlay'],
  ['[ / ]',       'previous / next module'],
  ['h',           'home'],
]

export default function Docs() {
  const totalItems = SECTIONS.reduce((n, s) => n + s.items.length, 0)
  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-baseline justify-between gap-6 border-b border-[var(--color-line)] pb-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[24px] tracking-[-0.01em] text-[var(--color-fg)]">docs</h1>
          <span className="text-[13px] tracking-[0.12em] text-[var(--color-dim)]">{totalItems} modules · keybinds · how to navigate</span>
        </div>
        <Link to="/" data-interactive className="text-[13px] tracking-[0.1em] text-[var(--color-dim)] hover:text-[var(--color-fg)]">
          ← index
        </Link>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_260px]">
        <div className="flex flex-col gap-6">
          {SECTIONS.map((sec) => (
            <Tile key={sec.title} label={sec.title} footer={sec.note ? <span>{sec.note}</span> : undefined}>
              <ul className="flex flex-col divide-y divide-[var(--color-line)]">
                {sec.items.map((it) => (
                  <li key={it.path} className="p-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <Link to={it.path} data-interactive className="flex items-baseline gap-2 text-[var(--color-fg)] hover:underline">
                        <span className="text-[13px] tracking-[0.1em] text-[var(--color-dim)]">{it.code}</span>
                        <span className="text-[13px] tracking-[0.02em]">{it.label}</span>
                        <span className="text-[13px] text-[var(--color-dim)]">{it.path}</span>
                      </Link>
                    </div>
                    <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-dim)]">{it.desc}</p>
                    {it.keybinds && it.keybinds.length > 0 && (
                      <ul className="mt-2 flex flex-wrap gap-2 text-[13px]">
                        {it.keybinds.map((k) => (
                          <li
                            key={k}
                            className="rounded-[4px] border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-0.5 text-[var(--color-dim)]"
                          >
                            {k}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </Tile>
          ))}
        </div>

        <div className="flex flex-col gap-6">
          <Tile label="global keys">
            <ul className="flex flex-col divide-y divide-[var(--color-line)]">
              {GLOBAL_KEYS.map(([k, v]) => (
                <li key={k} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
                  <span className="rounded-[4px] border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-0.5 text-[var(--color-fg)]">{k}</span>
                  <span className="text-right text-[var(--color-dim)]">{v}</span>
                </li>
              ))}
            </ul>
          </Tile>

          <Tile label="about">
            <div className="flex flex-col gap-2 p-3 text-[13px] leading-relaxed text-[var(--color-dim)]">
              <p><span className="text-[var(--color-fg)]">pirte</span> — etrip reversed. a small site of abstractions for the wandering mind.</p>
              <p>terminal ui, pure black, one accent per page. bento grid, nothing superfluous.</p>
              <p className="mt-2">
                source · <a data-interactive href="https://github.com/sarveshsea/pirte" target="_blank" rel="noreferrer" className="text-[var(--color-fg)] hover:underline">github.com/sarveshsea/pirte</a>
              </p>
            </div>
          </Tile>
        </div>
      </div>
    </div>
  )
}
