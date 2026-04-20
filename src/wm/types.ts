export type PaneId = string
export type Dir = 'h' | 'v'

export type LeafNode = { kind: 'leaf'; id: PaneId; route: string }
export type SplitNode = { kind: 'split'; id: string; dir: Dir; ratio: number; a: Node; b: Node }
export type Node = LeafNode | SplitNode

export type Workspace = {
  id: number
  root: Node | null
  focus: PaneId | null
}

export type WMState = {
  workspaces: Workspace[]
  current: number
}
