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
      { keys: 'scroll',         label: 'generate more fractals' },
      { keys: 'click tile',     label: 'regenerate just that one' },
      { keys: '+ new seed',     label: 'start a fresh feed (shareable via ?seed=)' },
    ],
  },
  '/attractors': {
    heading: 'attractors',
    items: [
      { keys: 'space', label: 'randomize params (clifford / dejong)' },
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
    heading: 'waves · studio',
    items: [
      { keys: 'space',         label: 'play / stop transport' },
      { keys: '1 – 8',         label: 'switch active pattern (A – H)' },
      { keys: 'c',             label: 'clear active pattern' },
      { keys: 'z',             label: 'undo' },
      { keys: '⇧ z',           label: 'redo' },
      { keys: ', / .',         label: 'bpm nudge −1 / +1' },
      { keys: 'numpad 1–9',    label: 'trigger tracks 1–9 manually' },
      { keys: 'click',         label: 'toggle step' },
      { keys: 'drag vertical', label: 'adjust vel / prob / gate on a step (pick w/ mode switcher)' },
      { keys: 'right-click',   label: 'pick note (melodic tracks)' },
      { keys: 'drop .wav',     label: 'load sample into drum track' },
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
  '/orbit': {
    heading: 'orbit',
    items: [
      { keys: 'stream tabs', label: 'switch nasa live stream' },
    ],
  },
  '/radio': {
    heading: 'radio',
    items: [
      { keys: 'click cell',  label: 'tune to the most-voted station in that map cell' },
      { keys: 'space',       label: 'play / pause current station' },
      { keys: 'n / →',       label: 'next station in current filter' },
      { keys: 'p / ←',       label: 'previous station in current filter' },
      { keys: 's',           label: 'shuffle the filter' },
      { keys: 'chips',       label: 'filter by country / genre' },
      { keys: 'search',      label: 'filter by name, country, or tag' },
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
  '/microbes': {
    heading: 'microbes',
    items: [
      { keys: '← / →',  label: 'cycle sim (physarum · turing · chemotaxis · excitable)' },
      { keys: 'space',  label: 'pause / resume' },
      { keys: 'r',      label: 'reseed current sim' },
      { keys: '1 – 4',  label: 'pick gray-scott regime (spots · stripes · solitons · coral)' },
    ],
  },
  '/bloom': {
    heading: 'bloom',
    items: [
      { keys: 'drag',    label: 'paint a wet-on-wet brushstroke' },
      { keys: 'space',   label: 'freeze / unfreeze the sim' },
      { keys: 'c',       label: 'clear canvas (keeps params)' },
      { keys: 'r',       label: 'reseed paper grain' },
      { keys: 's',       label: 'save current canvas as png' },
      { keys: 'm',       label: 'toggle sumi monochrome override' },
      { keys: '[ / ]',   label: 'decrease / increase brush radius' },
      { keys: '1 – 8',   label: 'pick pigment (sumi · ultramarine · alizarin · sienna · sap · cadmium · payne · indigo)' },
    ],
  },
  '/faces': {
    heading: 'faces',
    items: [
      { keys: 'click',   label: 'copy kaomoji to clipboard' },
      { keys: '/',       label: 'focus the search box' },
      { keys: 'enter',   label: 'copy first visible face (and clear search)' },
      { keys: 'r',       label: 'copy a random currently-visible face' },
      { keys: 'esc',     label: 'clear search + blur the input' },
    ],
  },
}
