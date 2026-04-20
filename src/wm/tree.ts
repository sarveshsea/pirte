import type { Node, LeafNode, PaneId, Dir } from './types'

let _id = 0
export const uid = () => `p${(++_id).toString(36)}${Date.now().toString(36).slice(-3)}`

export function leaf(route: string): LeafNode {
  return { kind: 'leaf', id: uid(), route }
}

export function findLeaf(node: Node | null, id: PaneId): LeafNode | null {
  if (!node) return null
  if (node.kind === 'leaf') return node.id === id ? node : null
  return findLeaf(node.a, id) || findLeaf(node.b, id)
}

export function allLeaves(node: Node | null): LeafNode[] {
  if (!node) return []
  if (node.kind === 'leaf') return [node]
  return [...allLeaves(node.a), ...allLeaves(node.b)]
}

export function firstLeaf(node: Node | null): LeafNode | null {
  if (!node) return null
  if (node.kind === 'leaf') return node
  return firstLeaf(node.a)
}

// replace leaf `focusId` with a split; new leaf sits on side `side` (a=first, b=second)
export function splitAt(root: Node, focusId: PaneId, newRoute: string, dir: Dir, side: 'after' | 'before' = 'after'): { root: Node; newId: PaneId } {
  const newLeaf = leaf(newRoute)
  const go = (n: Node): Node => {
    if (n.kind === 'leaf') {
      if (n.id !== focusId) return n
      const a = side === 'after' ? n : newLeaf
      const b = side === 'after' ? newLeaf : n
      return { kind: 'split', id: uid(), dir, ratio: 0.5, a, b }
    }
    return { ...n, a: go(n.a), b: go(n.b) }
  }
  return { root: go(root), newId: newLeaf.id }
}

// remove a leaf, collapsing its parent split
export function closeAt(root: Node, focusId: PaneId): Node | null {
  const go = (n: Node): Node | null => {
    if (n.kind === 'leaf') return n.id === focusId ? null : n
    const a = go(n.a)
    const b = go(n.b)
    if (!a && !b) return null
    if (!a) return b
    if (!b) return a
    return { ...n, a, b }
  }
  return go(root)
}

// replace a leaf's route in place
export function setRoute(root: Node, focusId: PaneId, newRoute: string): Node {
  const go = (n: Node): Node => {
    if (n.kind === 'leaf') return n.id === focusId ? { ...n, route: newRoute } : n
    return { ...n, a: go(n.a), b: go(n.b) }
  }
  return go(root)
}

// adjust the ratio of the split whose direct parent contains `focusId`
export function resizeSplit(root: Node, focusId: PaneId, delta: number): Node {
  // find the nearest ancestor split of focusId
  const path: string[] = []
  const find = (n: Node): boolean => {
    if (n.kind === 'leaf') return n.id === focusId
    if (find(n.a)) { path.push(n.id); return true }
    if (find(n.b)) { path.push(n.id); return true }
    return false
  }
  find(root)
  const target = path[0]
  if (!target) return root
  const go = (n: Node): Node => {
    if (n.kind === 'leaf') return n
    if (n.id === target) return { ...n, ratio: Math.max(0.1, Math.min(0.9, n.ratio + delta)) }
    return { ...n, a: go(n.a), b: go(n.b) }
  }
  return go(root)
}

export function otherId(node: Node | null, focusId: PaneId): PaneId | null {
  // after closing focusId, pick any remaining leaf to focus
  const leaves = allLeaves(node).filter((l) => l.id !== focusId)
  return leaves[0]?.id ?? null
}
