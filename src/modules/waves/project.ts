// project persistence: localStorage autosave + json export/import.
// the schema is just the Project type serialized as JSON. version gate lets
// future breaking changes migrate gracefully.

import { PROJECT_VERSION, type Project } from './types'
import { makeProject } from './pattern'

const AUTOSAVE_KEY = 'pirte:waves:autosave'

export function saveAutosave(p: Project): void {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(p))
  } catch { /* quota hit — ignore */ }
}

export function loadAutosave(): Project | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Project
    return migrate(parsed)
  } catch { return null }
}

export function clearAutosave(): void {
  try { localStorage.removeItem(AUTOSAVE_KEY) } catch { /* */ }
}

export function exportProject(p: Project, filename = 'waves-project.json'): void {
  const json = JSON.stringify(p, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export async function importProject(file: File): Promise<Project> {
  const text = await file.text()
  const parsed = JSON.parse(text) as Project
  return migrate(parsed)
}

function migrate(p: Project): Project {
  // future: if (p.version < 2) ... — for now just fall back to a fresh
  // project if the version is missing/wrong.
  if (p.version !== PROJECT_VERSION) return makeProject()
  return p
}

/* ---------------- history (undo/redo) ---------------- */

export class History {
  private stack: string[] = []
  private index = -1                 // points at the current state
  private max = 50

  push(p: Project) {
    const snap = JSON.stringify(p)
    // drop redo future
    this.stack = this.stack.slice(0, this.index + 1)
    // avoid trivial dupes
    if (this.stack.length > 0 && this.stack[this.stack.length - 1] === snap) return
    this.stack.push(snap)
    if (this.stack.length > this.max) this.stack.shift()
    else this.index++
    if (this.stack.length === 1) this.index = 0
  }

  undo(): Project | null {
    if (this.index <= 0) return null
    this.index--
    return JSON.parse(this.stack[this.index]) as Project
  }

  redo(): Project | null {
    if (this.index >= this.stack.length - 1) return null
    this.index++
    return JSON.parse(this.stack[this.index]) as Project
  }

  canUndo() { return this.index > 0 }
  canRedo() { return this.index < this.stack.length - 1 }
  clear() { this.stack = []; this.index = -1 }
}
