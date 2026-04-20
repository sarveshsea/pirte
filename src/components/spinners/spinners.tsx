import { makeSpinner } from './base'

// frames ported verbatim from github.com/Eronred/expo-agent-spinners
// (braille + ascii + arrow + emoji families, intervals preserved)

export const DotsSpinner                = makeSpinner('DotsSpinner',                ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'], 80)
export const Dots2Spinner               = makeSpinner('Dots2Spinner',               ['⣾','⣽','⣻','⢿','⡿','⣟','⣯','⣷'], 80)
export const Dots3Spinner               = makeSpinner('Dots3Spinner',               ['⠋','⠙','⠚','⠞','⠖','⠦','⠴','⠲','⠳','⠓'], 80)
export const Dots4Spinner               = makeSpinner('Dots4Spinner',               ['⠄','⠆','⠇','⠋','⠙','⠸','⠰','⠠','⠰','⠸','⠙','⠋','⠇','⠆'], 80)
export const Dots5Spinner               = makeSpinner('Dots5Spinner',               ['⠋','⠙','⠚','⠒','⠂','⠂','⠒','⠲','⠴','⠦','⠖','⠒','⠐','⠐','⠒','⠓','⠋'], 80)
export const Dots6Spinner               = makeSpinner('Dots6Spinner',               ['⠁','⠉','⠙','⠚','⠒','⠂','⠂','⠒','⠲','⠴','⠤','⠄','⠄','⠤','⠴','⠲','⠒','⠂','⠂','⠒','⠚','⠙','⠉','⠁'], 80)
export const Dots7Spinner               = makeSpinner('Dots7Spinner',               ['⠈','⠉','⠋','⠓','⠒','⠐','⠐','⠒','⠖','⠦','⠤','⠠','⠠','⠤','⠦','⠖','⠒','⠐','⠐','⠒','⠓','⠋','⠉','⠈'], 80)
export const Dots8Spinner               = makeSpinner('Dots8Spinner',               ['⠁','⠁','⠉','⠙','⠚','⠒','⠂','⠂','⠒','⠲','⠴','⠤','⠄','⠄','⠤','⠠','⠠','⠤','⠦','⠖','⠒','⠐','⠐','⠒','⠓','⠋','⠉','⠈','⠈'], 80)
export const Dots9Spinner               = makeSpinner('Dots9Spinner',               ['⢹','⢺','⢼','⣸','⣇','⡧','⡗','⡏'], 80)
export const Dots10Spinner              = makeSpinner('Dots10Spinner',              ['⢄','⢂','⢁','⡁','⡈','⡐','⡠'], 80)
export const Dots11Spinner              = makeSpinner('Dots11Spinner',              ['⠁','⠂','⠄','⡀','⢀','⠠','⠐','⠈'], 100)
export const Dots12Spinner              = makeSpinner('Dots12Spinner',              ['⢀⠀','⡀⠀','⠄⠀','⢂⠀','⡂⠀','⠅⠀','⢃⠀','⡃⠀','⠍⠀','⢋⠀','⡋⠀','⠍⠁','⢋⠁','⡋⠁','⠍⠉','⠋⠉','⠋⠉','⠉⠙','⠉⠙','⠉⠩','⠈⢙','⠈⡙','⢈⠩','⡀⢙','⠄⡙','⢂⠩','⡂⢘','⠅⡘','⢃⠨','⡃⢐','⠍⡐','⢋⠠','⡋⢀','⠍⡁','⢋⠁','⡋⠁','⠍⠉','⠋⠉','⠋⠉','⠉⠙','⠉⠙','⠉⠩','⠈⢙','⠈⡙','⠈⠩','⠀⢙','⠀⡙','⠀⠩','⠀⢘','⠀⡘','⠀⠨','⠀⢐','⠀⡐','⠀⠠','⠀⢀','⠀⡀'], 80)
export const Dots13Spinner              = makeSpinner('Dots13Spinner',              ['⣼','⣹','⢻','⠿','⡟','⣏','⣧','⣶'], 80)
export const Dots14Spinner              = makeSpinner('Dots14Spinner',              ['⠉⠉','⠈⠙','⠀⠹','⠀⢸','⠀⣰','⢀⣠','⣀⣀','⣄⡀','⣆⠀','⡇⠀','⠏⠀','⠋⠁'], 80)
export const SandSpinner                = makeSpinner('SandSpinner',                ['⠁','⠂','⠄','⡀','⡈','⡐','⡠','⣀','⣁','⣂','⣄','⣌','⣔','⣤','⣥','⣦','⣮','⣶','⣷','⣿','⡿','⠿','⢟','⠟','⡛','⠛','⠫','⢋','⠋','⠍','⡉','⠉','⠑','⠡','⢁'], 80)
export const BounceSpinner              = makeSpinner('BounceSpinner',              ['⠁','⠂','⠄','⡀','⠄','⠂'], 120)
export const DotsCircleSpinner          = makeSpinner('DotsCircleSpinner',          ['⢎⠀','⠎⠁','⠊⠑','⠈⠱','⠀⡱','⢀⡰','⢄⡠','⢆⡀'], 80)
export const WaveSpinner                = makeSpinner('WaveSpinner',                ['⠁⠂⠄⡀','⠂⠄⡀⢀','⠄⡀⢀⠠','⡀⢀⠠⠐','⢀⠠⠐⠈','⠠⠐⠈⠁','⠐⠈⠁⠂','⠈⠁⠂⠄'], 100)
export const ScanSpinner                = makeSpinner('ScanSpinner',                ['⠀⠀⠀⠀','⡇⠀⠀⠀','⣿⠀⠀⠀','⢸⡇⠀⠀','⠀⣿⠀⠀','⠀⢸⡇⠀','⠀⠀⣿⠀','⠀⠀⢸⡇','⠀⠀⠀⣿','⠀⠀⠀⢸'], 70)
export const RainSpinner                = makeSpinner('RainSpinner',                ['⢁⠂⠔⠈','⠂⠌⡠⠐','⠄⡐⢀⠡','⡈⠠⠀⢂','⠐⢀⠁⠄','⠠⠁⠊⡀','⢁⠂⠔⠈','⠂⠌⡠⠐','⠄⡐⢀⠡','⡈⠠⠀⢂','⠐⢀⠁⠄','⠠⠁⠊⡀'], 100)
export const PulseSpinner               = makeSpinner('PulseSpinner',               ['⠀⠶⠀','⠰⣿⠆','⢾⣉⡷','⣏⠀⣹','⡁⠀⢈'], 180)
export const SnakeSpinner               = makeSpinner('SnakeSpinner',               ['⣁⡀','⣉⠀','⡉⠁','⠉⠉','⠈⠙','⠀⠛','⠐⠚','⠒⠒','⠖⠂','⠶⠀','⠦⠄','⠤⠤','⠠⢤','⠀⣤','⢀⣠','⣀⣀'], 80)
export const SparkleSpinner             = makeSpinner('SparkleSpinner',             ['⡡⠊⢔⠡','⠊⡰⡡⡘','⢔⢅⠈⢢','⡁⢂⠆⡍','⢔⠨⢑⢐','⠨⡑⡠⠊'], 150)
export const CascadeSpinner              = makeSpinner('CascadeSpinner',              ['⠀⠀⠀⠀','⠀⠀⠀⠀','⠁⠀⠀⠀','⠋⠀⠀⠀','⠞⠁⠀⠀','⡴⠋⠀⠀','⣠⠞⠁⠀','⢀⡴⠋⠀','⠀⣠⠞⠁','⠀⢀⡴⠋','⠀⠀⣠⠞','⠀⠀⢀⡴','⠀⠀⠀⣠','⠀⠀⠀⢀'], 60)
export const ColumnsSpinner              = makeSpinner('ColumnsSpinner',              ['⡀⠀⠀','⡄⠀⠀','⡆⠀⠀','⡇⠀⠀','⣇⠀⠀','⣧⠀⠀','⣷⠀⠀','⣿⠀⠀','⣿⡀⠀','⣿⡄⠀','⣿⡆⠀','⣿⡇⠀','⣿⣇⠀','⣿⣧⠀','⣿⣷⠀','⣿⣿⠀','⣿⣿⡀','⣿⣿⡄','⣿⣿⡆','⣿⣿⡇','⣿⣿⣇','⣿⣿⣧','⣿⣿⣷','⣿⣿⣿','⣿⣿⣿','⠀⠀⠀'], 60)
export const OrbitSpinner                = makeSpinner('OrbitSpinner',                ['⠃','⠉','⠘','⠰','⢠','⣀','⡄','⠆'], 100)
export const BreatheSpinner               = makeSpinner('BreatheSpinner',              ['⠀','⠂','⠌','⡑','⢕','⢝','⣫','⣟','⣿','⣟','⣫','⢝','⢕','⡑','⠌','⠂','⠀'], 100)
export const WaveRowsSpinner              = makeSpinner('WaveRowsSpinner',              ['⠖⠉⠉⠑','⡠⠖⠉⠉','⣠⡠⠖⠉','⣄⣠⡠⠖','⠢⣄⣠⡠','⠙⠢⣄⣠','⠉⠙⠢⣄','⠊⠉⠙⠢','⠜⠊⠉⠙','⡤⠜⠊⠉','⣀⡤⠜⠊','⢤⣀⡤⠜','⠣⢤⣀⡤','⠑⠣⢤⣀','⠉⠑⠣⢤','⠋⠉⠑⠣'], 90)
export const CheckerboardSpinner         = makeSpinner('CheckerboardSpinner',          ['⢕⢕⢕','⡪⡪⡪','⢊⠔⡡','⡡⢊⠔'], 250)
export const HelixSpinner                = makeSpinner('HelixSpinner',                ['⢌⣉⢎⣉','⣉⡱⣉⡱','⣉⢎⣉⢎','⡱⣉⡱⣉','⢎⣉⢎⣉','⣉⡱⣉⡱','⣉⢎⣉⢎','⡱⣉⡱⣉','⢎⣉⢎⣉','⣉⡱⣉⡱','⣉⢎⣉⢎','⡱⣉⡱⣉','⢎⣉⢎⣉','⣉⡱⣉⡱','⣉⢎⣉⢎','⡱⣉⡱⣉'], 80)
export const FillSweepSpinner            = makeSpinner('FillSweepSpinner',            ['⣀⣀','⣤⣤','⣶⣶','⣿⣿','⣿⣿','⣿⣿','⣶⣶','⣤⣤','⣀⣀','⠀⠀','⠀⠀'], 100)
export const DiagSwipeSpinner             = makeSpinner('DiagSwipeSpinner',             ['⠁⠀','⠋⠀','⠟⠁','⡿⠋','⣿⠟','⣿⡿','⣿⣿','⣿⣿','⣾⣿','⣴⣿','⣠⣾','⢀⣴','⠀⣠','⠀⢀','⠀⠀','⠀⠀'], 60)
export const DqpbSpinner                 = makeSpinner('DqpbSpinner',                 ['d','q','p','b'], 100)
export const RollingLineSpinner          = makeSpinner('RollingLineSpinner',          ['/','-','\\','|','\\','-'], 80)
export const SimpleDotsSpinner           = makeSpinner('SimpleDotsSpinner',           ['.  ','.. ','...','   '], 400)
export const SimpleDotsScrollingSpinner  = makeSpinner('SimpleDotsScrollingSpinner',  ['.  ','.. ','...',' ..','  .','   '], 200)
export const ArcSpinner                  = makeSpinner('ArcSpinner',                  ['◜','◠','◝','◞','◡','◟'], 100)
export const BalloonSpinner              = makeSpinner('BalloonSpinner',              ['.','o','O','o','.'], 120)
export const CircleHalvesSpinner         = makeSpinner('CircleHalvesSpinner',         ['◐','◓','◑','◒'], 50)
export const CircleQuartersSpinner       = makeSpinner('CircleQuartersSpinner',       ['◴','◷','◶','◵'], 120)
export const PointSpinner                = makeSpinner('PointSpinner',                ['···','•··','·•·','··•','···'], 200)
export const SquareCornersSpinner        = makeSpinner('SquareCornersSpinner',        ['◰','◳','◲','◱'], 180)
export const ToggleSpinner               = makeSpinner('ToggleSpinner',               ['⊶','⊷'], 250)
export const TriangleSpinner             = makeSpinner('TriangleSpinner',             ['◢','◣','◤','◥'], 50)
export const GrowHorizontalSpinner       = makeSpinner('GrowHorizontalSpinner',       ['▏','▎','▍','▌','▋','▊','▉','▊','▋','▌','▍','▎'], 120)
export const GrowVerticalSpinner         = makeSpinner('GrowVerticalSpinner',         ['▁','▃','▄','▅','▆','▇','▆','▅','▄','▃'], 120)
export const NoiseSpinner                = makeSpinner('NoiseSpinner',                ['▓','▒','░',' ','░','▒'], 100)
export const ArrowSpinner                = makeSpinner('ArrowSpinner',                ['←','↖','↑','↗','→','↘','↓','↙'], 100)
export const DoubleArrowSpinner          = makeSpinner('DoubleArrowSpinner',          ['⇐','⇖','⇑','⇗','⇒','⇘','⇓','⇙'], 100)
export const HeartsSpinner               = makeSpinner('HeartsSpinner',               ['🩷','🧡','💛','💚','💙','🩵','💜','🤎','🖤','🩶','🤍'], 120)
export const ClockSpinner                = makeSpinner('ClockSpinner',                ['🕛','🕐','🕑','🕒','🕓','🕔','🕕','🕖','🕗','🕘','🕙','🕚'], 100)
export const EarthSpinner                = makeSpinner('EarthSpinner',                ['🌍','🌎','🌏'], 180)
export const MoonSpinner                 = makeSpinner('MoonSpinner',                 ['🌑','🌒','🌓','🌔','🌕','🌖','🌗','🌘'], 80)
export const SpeakerSpinner              = makeSpinner('SpeakerSpinner',              ['🔈','🔉','🔊','🔉'], 160)
export const WeatherSpinner              = makeSpinner('WeatherSpinner',              ['☀️','🌤','⛅️','🌥','☁️','🌧','🌨','⛈'], 100)

// registry — used by the /spinners gallery to enumerate every spinner
export type SpinnerFamily = 'braille' | 'ascii' | 'arrow' | 'emoji'
export interface SpinnerEntry {
  id: string
  name: string
  family: SpinnerFamily
  Component: ReturnType<typeof makeSpinner>
}

export const SPINNERS: SpinnerEntry[] = [
  { id: 'dots',                  name: 'dots',                  family: 'braille', Component: DotsSpinner },
  { id: 'dots2',                 name: 'dots2',                 family: 'braille', Component: Dots2Spinner },
  { id: 'dots3',                 name: 'dots3',                 family: 'braille', Component: Dots3Spinner },
  { id: 'dots4',                 name: 'dots4',                 family: 'braille', Component: Dots4Spinner },
  { id: 'dots5',                 name: 'dots5',                 family: 'braille', Component: Dots5Spinner },
  { id: 'dots6',                 name: 'dots6',                 family: 'braille', Component: Dots6Spinner },
  { id: 'dots7',                 name: 'dots7',                 family: 'braille', Component: Dots7Spinner },
  { id: 'dots8',                 name: 'dots8',                 family: 'braille', Component: Dots8Spinner },
  { id: 'dots9',                 name: 'dots9',                 family: 'braille', Component: Dots9Spinner },
  { id: 'dots10',                name: 'dots10',                family: 'braille', Component: Dots10Spinner },
  { id: 'dots11',                name: 'dots11',                family: 'braille', Component: Dots11Spinner },
  { id: 'dots12',                name: 'dots12',                family: 'braille', Component: Dots12Spinner },
  { id: 'dots13',                name: 'dots13',                family: 'braille', Component: Dots13Spinner },
  { id: 'dots14',                name: 'dots14',                family: 'braille', Component: Dots14Spinner },
  { id: 'sand',                  name: 'sand',                  family: 'braille', Component: SandSpinner },
  { id: 'bounce',                name: 'bounce',                family: 'braille', Component: BounceSpinner },
  { id: 'dots-circle',           name: 'dots circle',           family: 'braille', Component: DotsCircleSpinner },
  { id: 'wave',                  name: 'wave',                  family: 'braille', Component: WaveSpinner },
  { id: 'scan',                  name: 'scan',                  family: 'braille', Component: ScanSpinner },
  { id: 'rain',                  name: 'rain',                  family: 'braille', Component: RainSpinner },
  { id: 'pulse',                 name: 'pulse',                 family: 'braille', Component: PulseSpinner },
  { id: 'snake',                 name: 'snake',                 family: 'braille', Component: SnakeSpinner },
  { id: 'sparkle',               name: 'sparkle',               family: 'braille', Component: SparkleSpinner },
  { id: 'cascade',               name: 'cascade',               family: 'braille', Component: CascadeSpinner },
  { id: 'columns',               name: 'columns',               family: 'braille', Component: ColumnsSpinner },
  { id: 'orbit',                 name: 'orbit',                 family: 'braille', Component: OrbitSpinner },
  { id: 'breathe',               name: 'breathe',               family: 'braille', Component: BreatheSpinner },
  { id: 'waverows',              name: 'waverows',              family: 'braille', Component: WaveRowsSpinner },
  { id: 'checkerboard',          name: 'checkerboard',          family: 'braille', Component: CheckerboardSpinner },
  { id: 'helix',                 name: 'helix',                 family: 'braille', Component: HelixSpinner },
  { id: 'fillsweep',             name: 'fillsweep',             family: 'braille', Component: FillSweepSpinner },
  { id: 'diagswipe',             name: 'diagswipe',             family: 'braille', Component: DiagSwipeSpinner },
  { id: 'dqpb',                  name: 'dqpb',                  family: 'ascii',   Component: DqpbSpinner },
  { id: 'rolling-line',          name: 'rolling line',          family: 'ascii',   Component: RollingLineSpinner },
  { id: 'simple-dots',           name: 'simple dots',           family: 'ascii',   Component: SimpleDotsSpinner },
  { id: 'simple-dots-scrolling', name: 'simple dots scrolling', family: 'ascii',   Component: SimpleDotsScrollingSpinner },
  { id: 'arc',                   name: 'arc',                   family: 'ascii',   Component: ArcSpinner },
  { id: 'balloon',               name: 'balloon',               family: 'ascii',   Component: BalloonSpinner },
  { id: 'circle-halves',         name: 'circle halves',         family: 'ascii',   Component: CircleHalvesSpinner },
  { id: 'circle-quarters',       name: 'circle quarters',       family: 'ascii',   Component: CircleQuartersSpinner },
  { id: 'point',                 name: 'point',                 family: 'ascii',   Component: PointSpinner },
  { id: 'square-corners',        name: 'square corners',        family: 'ascii',   Component: SquareCornersSpinner },
  { id: 'toggle',                name: 'toggle',                family: 'ascii',   Component: ToggleSpinner },
  { id: 'triangle',              name: 'triangle',              family: 'ascii',   Component: TriangleSpinner },
  { id: 'grow-horizontal',       name: 'grow horizontal',       family: 'ascii',   Component: GrowHorizontalSpinner },
  { id: 'grow-vertical',         name: 'grow vertical',         family: 'ascii',   Component: GrowVerticalSpinner },
  { id: 'noise',                 name: 'noise',                 family: 'ascii',   Component: NoiseSpinner },
  { id: 'arrow',                 name: 'arrow',                 family: 'arrow',   Component: ArrowSpinner },
  { id: 'double-arrow',          name: 'double arrow',          family: 'arrow',   Component: DoubleArrowSpinner },
  { id: 'hearts',                name: 'hearts',                family: 'emoji',   Component: HeartsSpinner },
  { id: 'clock',                 name: 'clock',                 family: 'emoji',   Component: ClockSpinner },
  { id: 'earth',                 name: 'earth',                 family: 'emoji',   Component: EarthSpinner },
  { id: 'moon',                  name: 'moon',                  family: 'emoji',   Component: MoonSpinner },
  { id: 'speaker',               name: 'speaker',               family: 'emoji',   Component: SpeakerSpinner },
  { id: 'weather',               name: 'weather',               family: 'emoji',   Component: WeatherSpinner },
]
