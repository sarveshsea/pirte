import { useCallback, useEffect, useRef, useState } from 'react'

// copy text to clipboard with a graceful fallback for restricted contexts
// (file:// pages, older embeds), and expose a short-lived `lastCopied` value
// that downstream components can pulse + show in a toast.
const FADE_MS = 900

async function writeViaClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function writeViaTextarea(text: string): boolean {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.top = '0'
  ta.style.left = '-9999px'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  let ok = false
  try { ok = document.execCommand('copy') } catch { ok = false }
  document.body.removeChild(ta)
  return ok
}

export type UseCopy = {
  /** copies text; returns true on success, false on failure. */
  copy: (text: string) => Promise<boolean>
  /** the most recently-copied string; clears itself after ~900ms. */
  lastCopied: string | null
}

export function useCopy(): UseCopy {
  const [lastCopied, setLastCopied] = useState<string | null>(null)
  const timer = useRef<number | null>(null)

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const copy = useCallback(async (text: string): Promise<boolean> => {
    const ok = (await writeViaClipboard(text)) || writeViaTextarea(text)
    if (!ok) return false
    setLastCopied(text)
    if (timer.current) clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setLastCopied(null), FADE_MS)
    return true
  }, [])

  return { copy, lastCopied }
}
