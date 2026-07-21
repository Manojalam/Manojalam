import type { Node } from "@xyflow/react";
import type { Hierarchy } from "./hierarchy";
import { getSubtree } from "./hierarchy";
import { createNodeRect, getNodeDimensions, type NodeRect } from "./geometry";

export type ChildGroupFlow = "horizontal" | "vertical";

export interface WrappablePlacement {
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export type WrappablePlacements<T extends WrappablePlacement = WrappablePlacement> = Record<string, T>;

function normalizedPositiveInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const size = Math.floor(value);
  return size >= 1 ? Math.min(100, size) : null;
}

/** Resolve the requested number of visual sections, including legacy Fold-after boards. */
export function resolvedFoldSectionCount(
  data: Record<string, unknown>,
  childCount: number
): number {
  if (childCount < 2) return 1;
  const requestedSections = normalizedPositiveInteger(data.layoutFoldCount);
  if (requestedSections) return Math.min(childCount, requestedSections);
  const legacyGroupSize = normalizedPositiveInteger(data.layoutWrapAfter);
  return legacyGroupSize ? Math.max(1, Math.ceil(childCount / legacyGroupSize)) : 1;
}

/** True when at least one parent in the set is rendered in multiple Fold sections. */
export function hasFoldedChildSections(nodes: Node[]): boolean {
  const childCounts = new Map<string, number>();
  for (const node of nodes) {
    const parentId = (node.data as { parentId?: unknown } | undefined)?.parentId;
    if (typeof parentId === "string") childCounts.set(parentId, (childCounts.get(parentId) ?? 0) + 1);
  }
  return nodes.some((node) => {
    const data = (node.data ?? {}) as Record<string, unknown>;
    const storedOrderCount = Array.isArray(data.childOrder) ? data.childOrder.length : 0;
    const childCount = Math.max(storedOrderCount, childCounts.get(node.id) ?? 0);
    return resolvedFoldSectionCount(data, childCount) > 1;
  });
}

function balancedChildSections(children: string[], sectionCount: number): string[][] {
  const baseSize = Math.floor(children.length / sectionCount);
  const largerSectionCount = children.length % sectionCount;
  const sections: string[][] = [];
  let start = 0;
  for (let index = 0; index < sectionCount; index += 1) {
    const size = baseSize + (index < largerSectionCount ? 1 : 0);
    sections.push(children.slice(start, start + size));
    start += size;
  }
  return sections;
}

function placementRect(node: Node, placement: WrappablePlacement): NodeRect {
  const measured = getNodeDimensions(node);
  const width = placement.width ?? measured.width;
  const height = placement.height ?? measured.height;
  const origin = node.origin ?? [0, 0];
  return createNodeRect(
    node.id,
    placement.x - width * origin[0],
    placement.y - height * origin[1],
    width,
    height
  );
}

function combinedBounds(
  nodeIds: string[],
  placements: WrappablePlacements,
  byId: Map<string, Node>
): NodeRect | null {
  const rects = nodeIds.flatMap((nodeId) => {
    const node = byId.get(nodeId);
    const placement = placements[nodeId];
    return node && placement ? [placementRect(node, placement)] : [];
  });
  if (!rects.length) return null;
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  return createNodeRect("wrapped-group", left, top, right - left, bottom - top);
}

/**
 * Splits direct children into adjacent visual groups while moving every child's
 * complete subtree with it. Hierarchy metadata and edges remain unchanged.
 */
export function wrapChildGroups<T extends WrappablePlacement>(
  placements: WrappablePlacements<T>,
  hierarchy: Hierarchy,
  byId: Map<string, Node>,
  flowForParent: (parentId: string) => ChildGroupFlow,
  groupGap = 72
): WrappablePlacements<T> {
  const next = Object.fromEntries(
    Object.entries(placements).map(([nodeId, placement]) => [nodeId, { ...placement }])
  ) as WrappablePlacements<T>;
  const parents = [...hierarchy.values()]
    .filter((entry) => {
      const data = (byId.get(entry.id)?.data ?? {}) as Record<string, unknown>;
      const childCount = entry.childIds.filter((childId) => !!next[childId]).length;
      return resolvedFoldSectionCount(data, childCount) > 1;
    })
    .sort((a, b) => b.depth - a.depth);

  for (const parentEntry of parents) {
    const parent = byId.get(parentEntry.id);
    const parentPlacement = next[parentEntry.id];
    if (!parent || !parentPlacement) continue;
    const data = (parent.data ?? {}) as Record<string, unknown>;
    const children = parentEntry.childIds.filter((childId) => !!next[childId]);
    const sectionCount = resolvedFoldSectionCount(data, children.length);
    const chunks = balancedChildSections(children, sectionCount);
    if (chunks.length < 2) continue;

    const chunkNodes = chunks.map((chunk) => [...new Set(chunk.flatMap((childId) => getSubtree(childId, hierarchy)))])
      .map((nodeIds) => nodeIds.filter((nodeId) => !!next[nodeId]));
    const chunkBounds = chunkNodes.map((nodeIds) => combinedBounds(nodeIds, next, byId));
    if (chunkBounds.some((bounds) => !bounds)) continue;

    const flow = flowForParent(parentEntry.id);
    const firstBounds = chunkBounds[0]!;
    let nextMainStart = flow === "horizontal" ? firstBounds.left : firstBounds.top;
    const groupCrossStart = flow === "horizontal" ? firstBounds.top : firstBounds.left;

    chunkNodes.forEach((nodeIds, index) => {
      const bounds = combinedBounds(nodeIds, next, byId);
      if (!bounds) return;
      const delta = flow === "horizontal"
        ? {
            x: nextMainStart - bounds.left,
            y: groupCrossStart - bounds.top,
          }
        : {
            x: groupCrossStart - bounds.left,
            y: nextMainStart - bounds.top,
          };
      for (const nodeId of nodeIds) {
        next[nodeId] = {
          ...next[nodeId],
          x: next[nodeId].x + delta.x,
          y: next[nodeId].y + delta.y,
        };
      }
      const movedBounds = combinedBounds(nodeIds, next, byId)!;
      nextMainStart = (flow === "horizontal" ? movedBounds.right : movedBounds.bottom) + groupGap;
      void index;
    });
  }

  return next;
}
