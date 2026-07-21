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

export function normalizedChildGroupSize(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const size = Math.floor(value);
  return size >= 1 ? Math.min(100, size) : null;
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
      const groupSize = normalizedChildGroupSize(data.layoutWrapAfter);
      return groupSize !== null && entry.childIds.filter((childId) => !!next[childId]).length > groupSize;
    })
    .sort((a, b) => b.depth - a.depth);

  for (const parentEntry of parents) {
    const parent = byId.get(parentEntry.id);
    const parentPlacement = next[parentEntry.id];
    if (!parent || !parentPlacement) continue;
    const data = (parent.data ?? {}) as Record<string, unknown>;
    const groupSize = normalizedChildGroupSize(data.layoutWrapAfter);
    if (!groupSize) continue;

    const children = parentEntry.childIds.filter((childId) => !!next[childId]);
    const chunks = Array.from(
      { length: Math.ceil(children.length / groupSize) },
      (_, index) => children.slice(index * groupSize, (index + 1) * groupSize)
    );
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
