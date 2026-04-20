import type { BgFactory } from './program'
import { createRain } from './rain'
import { createFlow } from './flow'
import { createLife } from './life'

export type BgName = 'rain' | 'flow' | 'life' | 'off'

export const BG_NAMES: BgName[] = ['rain', 'flow', 'life', 'off']

export const BG_FACTORIES: Record<Exclude<BgName, 'off'>, BgFactory> = {
  rain: createRain,
  flow: createFlow,
  life: createLife,
}

export function nextBg(curr: BgName): BgName {
  const i = BG_NAMES.indexOf(curr)
  return BG_NAMES[(i + 1) % BG_NAMES.length]
}
