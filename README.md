# pirte

etrip reversed. a small site of abstractions for the wandering mind — fractals, strange attractors, ascii, kaleidoscope, games, audio, meditations, and live telemetry.

terminal ui, pure black, one accent per page. bento grid, nothing superfluous.

```bash
pnpm install
pnpm dev        # vite, http://localhost:5173
pnpm build      # tsc + vite build → dist/
pnpm lint       # eslint
```

## modules

18 routes, split by theme. every page is a standalone react-router route and ships as its own code-split chunk (`react.lazy` + `suspense`).

### visual

- `/fractals` — mandelbrot + julia via webgl. pan + zoom.
- `/attractors` — lorenz / clifford / dejong strange attractors.
- `/terminal` — matrix rain · donut · life · flow · rule-30. `←`/`→` cycle, `space` pause.
- `/kaleidoscope` — n-fold mirror over a perlin field.
- `/folds` — generative gallery of deterministic compositions.
- `/cyber` — night-city dashboard: neon, glitch, katakana.
- `/starfield` — 3d ascii flythrough. mouse steers, `↑`/`↓` speed, `space` warp.

### interactive

- `/ascii` — image → text converter with ramp, bias, pixelate, mix controls.
- `/pixels` — upload an image, get a paint-by-number puzzle. drag-drop / url paste / surprise-me all supported. size + colors sliders tune pixelation.
- `/sprites` — particle sandbox. `a`/`f`/`v`/`i` for attract / repel / vortex / idle, click to spawn pulses.
- `/particles` — verlet physics ropes + cloth.

### audio

- `/waves` — edm step sequencer + live oscilloscope + spectrum. `space` play/stop, `c` clear, `r` randomize, `a`–`;` play synth notes.

### meditative

- `/breathe` — box-breathing guide with phase colors, sine-tick audio on phase change, and a waveform visualization mode. `space` pause, `v` mode, `m` sound, `r` reset. query string persists pattern: `?p=4-4-4-4&mode=circle`.
- `/tarot` — major arcana draw. 1 / 3 / 5 card spreads with reversed readings.

### game

- `/doom` — ascii raycast homage to e1m1 with imps, fireballs, a pistol, and a doom-style hud. `wasd` move, `←`/`→` turn, `space` fire, `e` open doors, `p` pause, `r` restart.

### live

- `/time` — global clocks across six cities + session timer.
- `/orbit` — iss telemetry, live altitude/velocity, ground-track overlay.

### meta

- `/docs` — this document, as a page.

## global keys

| key             | action                                     |
| --------------- | ------------------------------------------ |
| `⌘k` / `ctrl+k` | command palette — jump to any module       |
| `?`             | shortcuts overlay                          |
| `alt+space`     | tiling window manager overlay (i3-style)   |
| `[` / `]`       | previous / next module                     |
| `h`             | home                                       |

## architecture

- `src/routes/` — one `.tsx` per page, each a default export.
- `src/modules/` — per-page helpers (raycaster, synth, sprites, colors, etc.).
- `src/components/` — shared ui primitives: `Tile`, `Slider`, `CommandPalette`, `PageNav`, etc.
- `src/lib/` — cross-cutting utilities: `canvas`, `clock`, `perlin`, `rng`, `session`.
- `src/wm/` — alt+space tiling window manager overlay (tree ops, registry, pane chrome).

route chunks are loaded on demand — the initial bundle is ~110 KB gzipped, and each page is 1-50 KB on top.

## conventions

- all user-visible text is lowercase.
- colors resolve through css variables (`--color-fg`, `--color-dim`, `--color-line`, `--color-surface`, `--color-bg`) + per-page palettes in `src/modules/<page>/colors.ts`.
- ascii scenes use the `Scene { reset(cols, rows), frame(t) → string }` pattern and measure char cells with a hidden probe span on mount + resize.
- `prefersReducedMotion()` short-circuits animation loops.
