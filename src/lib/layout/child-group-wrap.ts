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

/** Default custom break points use the same stable count distribution as older Fold boards. */
export function defaultFoldBreakAfter(children: string[], sectionCount: number): string[] {
  const sections = balancedChildSections(children, Math.max(1, Math.min(children.length, sectionCount)));
  return sections.slice(0, -1).flatMap((section) => section[section.length - 1] ?? []);
}

/** Resolve valid user-authored break points. Invalid or stale points fall back to automatic balancing. */
export function resolvedManualFoldBreakAfter(
  data: Record<string, unknown>,
  children: string[],
  sectionCount: number
): string[] | null {
  if (sectionCount < 2 || !Array.isArray(data.layoutFoldBreakAfter)) return null;
  const requested = data.layoutFoldBreakAfter.filter(
    (childId): childId is string => typeof childId === "string"
  );
  if (requested.length !== sectionCount - 1) return null;
  const indexes = requested.map((childId) => children.indexOf(childId));
  if (indexes.some((index) => index < 0 || index >= children.length - 1)) return null;
  if (indexes.some((index, position) => position > 0 && index <= indexes[position - 1])) return null;
  return requested;
}

interface FoldPartitionCandidate {
  breaks: number[];
  extents: number[];
}

const FOLD_VISUAL_TIE_RATIO = 0.04;

function betterFoldPartition(
  candidate: FoldPartitionCandidate,
  current: FoldPartitionCandidate | null
): boolean {
  if (!current) return true;
  const candidateMax = Math.max(...candidate.extents);
  const currentMax = Math.max(...current.extents);
  // Tiny mathematical improvements are not perceptible and tend to leave the
  // first section looking prematurely cut. Treat them as visual ties so the
  // stable reading-order preference below can fill earlier sections first.
  const visualTolerance = Math.max(
    1,
    Math.min(candidateMax, currentMax) * FOLD_VISUAL_TIE_RATIO
  );
  if (Math.abs(candidateMax - currentMax) > visualTolerance) return candidateMax < currentMax;

  const candidateRange = candidateMax - Math.min(...candidate.extents);
  const currentRange = currentMax - Math.min(...current.extents);
  if (Math.abs(candidateRange - currentRange) > visualTolerance) return candidateRange < currentRange;

  // Prefer later break points when the alternatives are visually equivalent.
  for (let index = 0; index < candidate.breaks.length; index += 1) {
    if (candidate.breaks[index] !== current.breaks[index]) {
      return candidate.breaks[index] > current.breaks[index];
    }
  }
  return false;
}

export function balancedFoldSectionsByExtent(
  children: string[],
  sectionCount: number,
  segmentExtents: number[][] | null
): string[][] {
  if (!segmentExtents) return balancedChildSections(children, sectionCount);
  const states: Array<Array<FoldPartitionCandidate | null>> = Array.from(
    { length: sectionCount + 1 },
    () => Array.from({ length: children.length + 1 }, () => null)
  );

  for (let end = 1; end <= children.length; end += 1) {
    states[1][end] = { breaks: [], extents: [segmentExtents[0][end]] };
  }
  for (let section = 2; section <= sectionCount; section += 1) {
    for (let end = section; end <= children.length; end += 1) {
      let best: FoldPartitionCandidate | null = null;
      for (let start = section - 1; start < end; start += 1) {
        const previous = states[section - 1][start];
        if (!previous) continue;
        const candidate = {
          breaks: [...previous.breaks, start],
          extents: [...previous.extents, segmentExtents[start][end]],
        };
        if (betterFoldPartition(candidate, best)) best = candidate;
      }
      states[section][end] = best;
    }
  }

  const result = states[sectionCount][children.length];
  if (!result) return balancedChildSections(children, sectionCount);
  const boundaries = [0, ...result.breaks, children.length];
  return boundaries.slice(0, -1).map((start, index) => children.slice(start, boundaries[index + 1]));
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

function childSegmentExtents(
  children: string[],
  hierarchy: Hierarchy,
  placements: WrappablePlacements,
  byId: Map<string, Node>,
  flow: ChildGroupFlow
): number[][] | null {
  const childBounds = children.map((childId) => {
    const subtreeIds = [...new Set(getSubtree(childId, hierarchy))].filter((nodeId) => !!placements[nodeId]);
    return combinedBounds(subtreeIds, placements, byId);
  });
  if (childBounds.some((bounds) => !bounds)) return null;

  const extents = Array.from(
    { length: children.length },
    () => Array.from({ length: children.length + 1 }, () => 0)
  );
  for (let start = 0; start < childBounds.length; start += 1) {
    let left = Number.POSITIVE_INFINITY;
    let top = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    let bottom = Number.NEGATIVE_INFINITY;
    for (let end = start; end < childBounds.length; end += 1) {
      const bounds = childBounds[end]!;
      left = Math.min(left, bounds.left);
      top = Math.min(top, bounds.top);
      right = Math.max(right, bounds.right);
      bottom = Math.max(bottom, bounds.bottom);
      extents[start][end + 1] = flow === "horizontal" ? bottom - top : right - left;
    }
  }
  return extents;
}

function sectionsFromBreakAfter(children: string[], breakAfter: string[]): string[][] {
  const breakIndexes = new Set(breakAfter.map((childId) => children.indexOf(childId)));
  const sections: string[][] = [];
  let start = 0;
  children.forEach((_, index) => {
    if (!breakIndexes.has(index)) return;
    sections.push(children.slice(start, index + 1));
    start = index + 1;
  });
  sections.push(children.slice(start));
  return sections;
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
    const flow = flowForParent(parentEntry.id);
    const manualBreakAfter = resolvedManualFoldBreakAfter(data, children, sectionCount);
    const chunks = manualBreakAfter
      ? sectionsFromBreakAfter(children, manualBreakAfter)
      : balancedFoldSectionsByExtent(
          children,
          sectionCount,
          childSegmentExtents(children, hierarchy, next, byId, flow)
        );
    if (chunks.length < 2) continue;

    const chunkNodes = chunks.map((chunk) => [...new Set(chunk.flatMap((childId) => getSubtree(childId, hierarchy)))])
      .map((nodeIds) => nodeIds.filter((nodeId) => !!next[nodeId]));
    const chunkBounds = chunkNodes.map((nodeIds) => combinedBounds(nodeIds, next, byId));
    if (chunkBounds.some((bounds) => !bounds)) continue;

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
