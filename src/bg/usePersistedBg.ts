import { useEffect, useState } from 'react'
import { BG_NAMES, type BgName } from './registry'

const KEY = 'pirte:bg'

function read(): BgName {
  try {
    const v = localStorage.getItem(KEY)
    // rain was retired; any returning users land on ink
    if (v === 'rain') return 'ink'
    if (v && (BG_NAMES as string[]).includes(v)) return v as BgName
  } catch { /* ignore */ }
  return 'ink'
}

export function usePersistedBg(): [BgName, (n: BgName) => void] {
  const [name, setName] = useState<BgName>(read)
  useEffect(() => {
    try { localStorage.setItem(KEY, name) } catch { /* ignore */ }
  }, [name])
  return [name, setName]
}
