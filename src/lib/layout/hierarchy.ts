import type { Node, Edge } from "@xyflow/react";
import { getNodeRect } from "./geometry";

export interface HierarchyNode {
  id: string;
  parentId: string | null;
  childIds: string[];
  depth: number;
  siblingIndex: number;
}

export type Hierarchy = Map<string, HierarchyNode>;

type XY = { x: number; y: number };

function centerOf(n: Node): XY {
  const rect = getNodeRect(n);
  return { x: rect.centerX, y: rect.centerY };
}

/**
 * Build a cycle-safe parent→child hierarchy from directed edges.
 *
 * Persisted `data.parentId` is the primary source of truth. Directed edges
 * (`source` = parent, `target` = child) fill in hierarchy only for nodes that
 * do not yet have persisted metadata. This prevents a cross-link or a changed
 * edge-array order from silently changing the outline structure.
 */
export function buildHierarchy(nodes: Node[], edges: Edge[]): Hierarchy {
  const byId = new Map<string, Node>();
  for (const n of nodes) byId.set(n.id, n);

  const parentOf = new Map<string, string>();
  const rawChildren = new Map<string, string[]>();
  for (const n of nodes) rawChildren.set(n.id, []);

  for (const node of nodes) {
    const parentId = (node.data as { parentId?: unknown } | undefined)?.parentId;
    if (
      typeof parentId === "string" &&
      parentId !== node.id &&
      byId.has(parentId)
    ) {
      parentOf.set(node.id, parentId);
    }
  }

  // First valid incoming edge wins only when no persisted parent is available.
  for (const e of edges) {
    if (!byId.has(e.source) || !byId.has(e.target)) continue;
    if (e.source === e.target) continue;
    if (!parentOf.has(e.target)) {
      parentOf.set(e.target, e.source);
    }
  }

  for (const [childId, parentId] of parentOf) {
    rawChildren.get(parentId)?.push(childId);
  }

  // Break cycles: if following parents from a node loops back, detach it to root.
  for (const n of nodes) {
    const seen = new Set<string>();
    let cur: string | undefined = n.id;
    while (cur !== undefined) {
      if (seen.has(cur)) {
        // cycle detected — sever this node's parent link
        const p = parentOf.get(n.id);
        if (p) {
          parentOf.delete(n.id);
          rawChildren.set(p, (rawChildren.get(p) ?? []).filter((c) => c !== n.id));
        }
        if (process.env.NODE_ENV !== "production") {
          console.warn(`[hierarchy] cycle detected at node ${n.id}; detaching to root.`);
        }
        break;
      }
      seen.add(cur);
      cur = parentOf.get(cur);
    }
  }

  // Order siblings: stored childOrder first, then remaining by geometry.
  const orderedChildren = new Map<string, string[]>();
  for (const [pid, kids] of rawChildren) {
    const parentNode = byId.get(pid);
    const stored = (parentNode?.data as { childOrder?: string[] } | undefined)?.childOrder ?? [];
    const present = new Set(kids);
    const ordered: string[] = [];
    for (const id of stored) if (present.has(id) && !ordered.includes(id)) ordered.push(id);
    const remaining = kids.filter((id) => !ordered.includes(id));
    // Sort remaining by position (row-major: y then x) — good default for all layouts.
    remaining.sort((a, b) => {
      const ca = centerOf(byId.get(a)!);
      const cb = centerOf(byId.get(b)!);
      return ca.y - cb.y || ca.x - cb.x;
    });
    orderedChildren.set(pid, [...ordered, ...remaining]);
  }

  // Compute depth via BFS from roots (nodes with no parent).
  const hierarchy: Hierarchy = new Map();
  for (const n of nodes) {
    hierarchy.set(n.id, {
      id: n.id,
      parentId: parentOf.get(n.id) ?? null,
      childIds: orderedChildren.get(n.id) ?? [],
      depth: 0,
      siblingIndex: 0,
    });
  }
  for (const [pid, kids] of orderedChildren) {
    kids.forEach((cid, i) => {
      const h = hierarchy.get(cid);
      if (h) h.siblingIndex = i;
      void pid;
    });
  }

  const roots = nodes.filter((n) => !parentOf.has(n.id)).map((n) => n.id);
  const queue: Array<{ id: string; depth: number }> = roots.map((id) => ({ id, depth: 0 }));
  const visited = new Set<string>();
  while (queue.length) {
    const { id, depth } = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const h = hierarchy.get(id)!;
    h.depth = depth;
    for (const c of h.childIds) queue.push({ id: c, depth: depth + 1 });
  }

  return hierarchy;
}

/** All descendant ids of root (inclusive), depth-first, cycle-safe. */
export function getSubtree(rootId: string, hierarchy: Hierarchy): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const walk = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    out.push(id);
    const h = hierarchy.get(id);
    if (h) for (const c of h.childIds) walk(c);
  };
  walk(rootId);
  return out;
}

export function getDirectChildren(parentId: string, hierarchy: Hierarchy): string[] {
  return hierarchy.get(parentId)?.childIds ?? [];
}

export function getDepthMap(rootId: string, hierarchy: Hierarchy): Map<string, number> {
  const map = new Map<string, number>();
  const rootDepth = hierarchy.get(rootId)?.depth ?? 0;
  for (const id of getSubtree(rootId, hierarchy)) {
    map.set(id, (hierarchy.get(id)?.depth ?? rootDepth) - rootDepth);
  }
  return map;
}

export function getSiblingOrder(parentId: string, hierarchy: Hierarchy): string[] {
  return getDirectChildren(parentId, hierarchy);
}

export function isDescendant(rootId: string, nodeId: string, hierarchy: Hierarchy): boolean {
  if (rootId === nodeId) return true;
  let cur = hierarchy.get(nodeId)?.parentId ?? null;
  const seen = new Set<string>();
  while (cur) {
    if (cur === rootId) return true;
    if (seen.has(cur)) break;
    seen.add(cur);
    cur = hierarchy.get(cur)?.parentId ?? null;
  }
  return false;
}

/** Roots of the whole forest (nodes without a parent). */
export function getRoots(hierarchy: Hierarchy): string[] {
  const roots: string[] = [];
  for (const [id, h] of hierarchy) if (h.parentId === null) roots.push(id);
  return roots;
}
