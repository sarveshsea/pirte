export type Shortcut = { keys: string; label: string }
export type Group = { heading: string; items: Shortcut[] }

export const GLOBAL: Group = {
  heading: 'global',
  items: [
    { keys: '⌘ k',      label: 'command palette — jump to any module' },
    { keys: '?',        label: 'this overlay' },
    { keys: 'alt space', label: 'toggle tiling window manager' },
    { keys: 'esc',      label: 'dismiss any overlay' },
    { keys: '[ / ]',    label: 'prev / next module' },
    { keys: 'h',        label: 'back to index' },
  ],
}

export const WM_GROUP: Group = {
  heading: 'window manager',
  items: [
    { keys: 'alt enter',   label: 'split focused pane horizontally (opens launcher)' },
    { keys: 'alt ⇧ enter', label: 'split focused pane vertically' },
    { keys: 'alt d',       label: 'swap module in focused pane' },
    { keys: 'alt q',       label: 'close focused pane' },
    { keys: 'alt 1–4',     label: 'switch workspace' },
    { keys: 'alt h j k l', label: 'focus neighbour (← ↓ ↑ →)' },
    { keys: 'alt ⇧ h/l',   label: 'resize split (shrink / grow horizontally)' },
    { keys: 'alt space',   label: 'exit window manager' },
  ],
}

export const ROUTE_SHORTCUTS: Record<string, Group> = {
  '/fractals': {
    heading: 'fractals',
    items: [
      { keys: 'drag',  label: 'pan' },
      { keys: 'wheel', label: 'zoom toward cursor' },
      { keys: 'm',     label: 'mandelbrot' },
      { keys: 'j',     label: 'julia · c follows cursor' },
      { keys: 'r',     label: 'reset camera' },
    ],
  },
  '/attractors': {
    heading: 'attractors',
    items: [
      { keys: 'space', label: 'randomize params (clifford / dejong)' },
    ],
  },
  '/terminal': {
    heading: 'terminal',
    items: [
      { keys: '← / →', label: 'cycle scenes' },
      { keys: 'space', label: 'pause / resume' },
    ],
  },
  '/kaleidoscope': {
    heading: 'kaleidoscope',
    items: [
      { keys: 'space', label: 'freeze / resume' },
    ],
  },
  '/sprites': {
    heading: 'sprites',
    items: [
      { keys: 'a',     label: 'attract · agents follow cursor' },
      { keys: 'f',     label: 'flee · agents run from cursor' },
      { keys: 'v',     label: 'vortex · tangential field' },
      { keys: 'i',     label: 'idle · ambient flow only' },
      { keys: 'click', label: 'spawn radial pulse' },
      { keys: 'r',     label: 'reset field' },
      { keys: 'space', label: 'pause / resume' },
    ],
  },
  '/waves': {
    heading: 'waves',
    items: [
      { keys: 'space', label: 'play / stop transport' },
      { keys: 'c',     label: 'clear pattern' },
      { keys: 'r',     label: 'randomize pattern' },
      { keys: 'a — ;', label: 'play synth notes (a = a3, semitones up)' },
      { keys: 'click', label: 'toggle step in sequencer' },
    ],
  },
  '/doom': {
    heading: 'doom · e1m1',
    items: [
      { keys: 'w a s d', label: 'move / strafe' },
      { keys: '← / →',    label: 'turn' },
      { keys: 'space',    label: 'fire' },
      { keys: 'e',        label: 'open door / interact' },
      { keys: 'p',        label: 'pause' },
      { keys: 'r',        label: 'restart level' },
    ],
  },
  '/breathe': {
    heading: 'breathe',
    items: [
      { keys: 'space', label: 'pause / resume cycle' },
      { keys: 'r',     label: 'reset cycle counter' },
    ],
  },
  '/starfield': {
    heading: 'starfield',
    items: [
      { keys: 'mouse',   label: 'steer' },
      { keys: '↑ / ↓',   label: 'speed up / down' },
      { keys: 'space',   label: 'warp 3.5×' },
      { keys: 'r',       label: 'reset stars' },
    ],
  },
  '/tarot': {
    heading: 'tarot',
    items: [
      { keys: 'space',       label: 'redraw spread' },
      { keys: '1 / 3 / 5',   label: 'switch spread size' },
    ],
  },
  '/particles': {
    heading: 'particles',
    items: [
      { keys: 'click empty',  label: 'drop point' },
      { keys: 'click → click', label: 'connect two points' },
      { keys: 'drag',          label: 'fling selected point' },
      { keys: 'shift-click',   label: 'pin / unpin point' },
      { keys: 'g',             label: 'toggle gravity' },
      { keys: 'c',             label: 'clear world' },
      { keys: 'r',             label: 'rope preset' },
      { keys: 't',             label: 'cloth preset' },
      { keys: 'space',         label: 'pause / resume' },
    ],
  },
  '/pixels': {
    heading: 'pixels',
    items: [
      { keys: 'click',  label: 'fill cell with selected color · wrong flashes' },
    ],
  },
  '/ascii': {
    heading: 'ascii',
    items: [
      { keys: 'drop / browse', label: 'load image' },
      { keys: 'copy',          label: 'copy ascii as text' },
      { keys: 'export',        label: 'download .txt or .png' },
    ],
  },
  '/folds': {
    heading: 'folds',
    items: [
      { keys: 'tabs',   label: 'filter by medium' },
      { keys: 'search', label: 'filter by title / medium' },
      { keys: '+ new fold', label: 're-seed every piece' },
    ],
  },
  '/cyber': {
    heading: 'cyber',
    items: [
      { keys: 'ambient', label: 'no input · watch the feed' },
    ],
  },
  '/orbit': {
    heading: 'orbit',
    items: [
      { keys: 'stream tabs', label: 'switch nasa live stream' },
    ],
  },
  '/': {
    heading: 'index',
    items: [
      { keys: 'click tile', label: 'enter module' },
      { keys: 'hover',      label: 'tile tilts toward cursor; spotlight follows' },
    ],
  },
  '/time': {
    heading: 'time',
    items: [
      { keys: 'reset session', label: 'clear local session timer' },
    ],
  },
}
