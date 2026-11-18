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
    const first = positions.get(a)!, second = positions.get(b)!;
    return (first.y - second.y) || (first.x - second.x) || a.localeCompare(b);
  });
}
