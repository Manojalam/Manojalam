import type { Node, Edge } from "@xyflow/react";
import { getNodeRect } from "../layout/geometry";
import { nodePlainText } from "./node-text";
import { normalizeTable, tablePlainText } from "./table";

/** Count displayed content once, rather than both rich text and its plain-text cache. */
export function searchOccurrenceText(data: Record<string, unknown>): string {
  return data.table ? tablePlainText(normalizeTable(data.table)) : nodePlainText(data);
}

export function nextSearchIndex(index: number, direction: number, total: number): number {
  return total > 0 ? ((index + direction) % total + total) % total : -1;
}

/** Persisted ownership, not arbitrary connectors between separate sections. */
function searchParentId(node: Node): string | undefined {
  const value = node.parentId ?? node.data.parentId ?? node.data.noteForNodeId;
  return typeof value === "string" ? value : undefined;
}

export function searchScopeIds(selected: readonly string[], nodes: readonly Node[]): Set<string> {
  const children = new Map<string, string[]>();
  for (const node of nodes) {
    const parent = searchParentId(node);
    if (parent) children.set(parent, [...(children.get(parent) ?? []), node.id]);
  }
  const scope = new Set<string>();
  const pending = [...selected];
  while (pending.length) {
    const id = pending.pop()!;
    if (scope.has(id)) continue;
    scope.add(id);
    pending.push(...(children.get(id) ?? []));
  }
  return scope;
}

/** Board reading order, independent of creation, import, or stacking order. */
export function orderSearchResults(ids: readonly string[], nodes: readonly Node[], edges: readonly Edge[]): string[] {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const edgeById = new Map(edges.map(edge => [edge.id, edge]));
  const point = (id: string) => {
    const node = byId.get(id);
    if (!node) return null;
    const rect = getNodeRect(node);
    let x = rect.x, y = rect.y, parentId = node.parentId;
    const seen = new Set([id]);
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId);
      const parent = byId.get(parentId);
      if (!parent) break;
      const parentRect = getNodeRect(parent);
      x += parentRect.x; y += parentRect.y; parentId = parent.parentId;
    }
    return { x, y };
  };
  const sectionId = (id: string): string => {
    let current = byId.get(id);
    if (!current) return id;
    const seen = new Set<string>();
    while (current) {
      if (seen.has(current.id)) return [...seen].sort()[0];
      seen.add(current.id);
      const parentId = searchParentId(current);
      const parent = parentId ? byId.get(parentId) : undefined;
      if (!parent) return current.id;
      current = parent;
    }
    return id;
  };
  const positions = new Map(ids.map(id => {
    let position = point(id);
    const edge = edgeById.get(id);
    if (!position && edge) {
      const source = point(edge.source), target = point(edge.target);
      position = source && target ? { x: (source.x + target.x) / 2, y: (source.y + target.y) / 2 } : source ?? target;
    }
    return [id, position ?? { x: Infinity, y: Infinity }] as const;
  }));
  return [...ids].sort((a, b) => {
    const firstSection = sectionId(a), secondSection = sectionId(b);
    if (firstSection !== secondSection) {
      const first = point(firstSection) ?? positions.get(a)!;
      const second = point(secondSection) ?? positions.get(b)!;
      return (first.y - second.y) || (first.x - second.x) || firstSection.localeCompare(secondSection);
    }
    const first = positions.get(a)!, second = positions.get(b)!;
    return (first.y - second.y) || (first.x - second.x) || a.localeCompare(b);
  });
}
