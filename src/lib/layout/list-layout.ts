import type { Edge, Node } from "@xyflow/react";
import type { Hierarchy } from "./hierarchy";
import { buildHierarchy } from "./hierarchy";
import {
  getNodeDimensions,
  getNodeRect,
  inflateRect,
  segmentIntersectsRect,
  type NodeRect,
  type OrthogonalSegment,
} from "./geometry";

export const LIST_ROW_GAP = 24;
export const LIST_ROOT_BRANCH_GAP = 48;
export const LIST_COLUMN_GUTTER = 88;
export const LIST_MIN_COLUMN_GAP = 72;
export const LIST_OUTER_PADDING = 24;
export const LIST_COLLISION_PADDING_X = 16;
export const LIST_COLLISION_PADDING_Y = 12;
export const LIST_CONNECTOR_OBSTACLE_PADDING = 12;

export interface ListTraversalEntry {
  nodeId: string;
  depth: number;
  siblingIndex: number;
  directRootBranchId: string | null;
  isLastSibling: boolean;
  ancestorIds: string[];
}

export interface ListPlacement {
  x: number;
  y: number;
}

export type ListPlacements = Record<string, ListPlacement>;

export interface ListLayoutDiagnostics {
  duplicateNodeIds: string[];
  nodesWithIdenticalPositions: string[][];
  overlaps: Array<{ firstId: string; secondId: string }>;
}

export interface ListConnectorBranch {
  edge: Edge;
  childId: string;
  segment: OrthogonalSegment;
}

export interface ListConnectorGroup {
  parentId: string;
  lead: OrthogonalSegment;
  bus: OrthogonalSegment;
  branches: ListConnectorBranch[];
}

export interface ListConnectorModel {
  groups: ListConnectorGroup[];
  duplicateEdgeIds: string[];
  duplicateHierarchyRelations: string[];
  duplicateVisibleConnectorSegments: string[];
  obstacleIntersections: Array<{ parentId: string; obstacleId: string }>;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function topLeftPosition(node: Node, left: number, top: number): ListPlacement {
  const { width, height } = getNodeDimensions(node);
  const origin = node.origin ?? [0, 0];
  return {
    x: left + width * origin[0],
    y: top + height * origin[1],
  };
}

function rectAt(node: Node, position: ListPlacement): NodeRect {
  return getNodeRect({ ...node, position });
}

function rectsTooClose(a: NodeRect, b: NodeRect): boolean {
  return (
    a.left - LIST_COLLISION_PADDING_X < b.right &&
    a.right + LIST_COLLISION_PADDING_X > b.left &&
    a.top - LIST_COLLISION_PADDING_Y < b.bottom &&
    a.bottom + LIST_COLLISION_PADDING_Y > b.top
  );
}

export function getPreorderTraversal(rootId: string, hierarchy: Hierarchy): ListTraversalEntry[] {
  const traversal: ListTraversalEntry[] = [];
  const seen = new Set<string>();

  const walk = (
    nodeId: string,
    depth: number,
    directRootBranchId: string | null,
    ancestorIds: string[],
    siblingIndex: number,
    isLastSibling: boolean
  ) => {
    if (seen.has(nodeId)) return;
    seen.add(nodeId);
    traversal.push({
      nodeId,
      depth,
      siblingIndex,
      directRootBranchId,
      isLastSibling,
      ancestorIds,
    });

    const children = hierarchy.get(nodeId)?.childIds ?? [];
    children.forEach((childId, index) => {
      walk(
        childId,
        depth + 1,
        depth === 0 ? childId : directRootBranchId,
        [...ancestorIds, nodeId],
        index,
        index === children.length - 1
      );
    });
  };

  walk(rootId, 0, null, [], 0, true);
  return traversal;
}

function resolveRowCollisions(
  traversal: ListTraversalEntry[],
  placements: ListPlacements,
  byId: Map<string, Node>,
  preserveManualOverrides: boolean
): void {
  const generatedRows = traversal.filter((entry) => {
    const node = byId.get(entry.nodeId);
    return node && !(preserveManualOverrides && (node.data as Record<string, unknown>).listManualOverride === true);
  });
  const safeLimit = Math.max(8, generatedRows.length * 2);

  for (let index = 0; index < generatedRows.length; index++) {
    const entry = generatedRows[index];
    const node = byId.get(entry.nodeId)!;
    let iterations = 0;
    while (iterations < safeLimit) {
      const currentRect = rectAt(node, placements[entry.nodeId]);
      let requiredShift = 0;
      for (let previous = 0; previous < index; previous++) {
        const previousEntry = generatedRows[previous];
        const previousNode = byId.get(previousEntry.nodeId)!;
        const previousRect = rectAt(previousNode, placements[previousEntry.nodeId]);
        if (!rectsTooClose(previousRect, currentRect)) continue;
        requiredShift = Math.max(
          requiredShift,
          previousRect.bottom - currentRect.top + LIST_COLLISION_PADDING_Y
        );
      }
      if (requiredShift <= 0) break;
      for (let later = index; later < generatedRows.length; later++) {
        placements[generatedRows[later].nodeId].y += requiredShift;
      }
      iterations += 1;
    }
  }
}

export function diagnoseListLayout(
  traversal: ListTraversalEntry[],
  placements: ListPlacements,
  byId: Map<string, Node>,
  preserveManualOverrides = false
): ListLayoutDiagnostics {
  const inputCounts = new Map<string, number>();
  traversal.forEach((entry) => inputCounts.set(entry.nodeId, (inputCounts.get(entry.nodeId) ?? 0) + 1));
  const duplicateNodeIds = [...inputCounts.entries()].filter(([, count]) => count > 1).map(([id]) => id);

  const positions = new Map<string, string[]>();
  for (const entry of traversal) {
    const node = byId.get(entry.nodeId);
    const placement = placements[entry.nodeId];
    if (!node || !placement) continue;
    if (preserveManualOverrides && (node.data as Record<string, unknown>).listManualOverride === true) continue;
    const key = `${placement.x.toFixed(3)},${placement.y.toFixed(3)}`;
    positions.set(key, [...(positions.get(key) ?? []), entry.nodeId]);
  }
  const nodesWithIdenticalPositions = [...positions.values()].filter((ids) => ids.length > 1);

  const overlaps: ListLayoutDiagnostics["overlaps"] = [];
  const generated = traversal.filter((entry) => {
    const node = byId.get(entry.nodeId);
    return node && !(preserveManualOverrides && (node.data as Record<string, unknown>).listManualOverride === true);
  });
  for (let first = 0; first < generated.length; first++) {
    for (let second = first + 1; second < generated.length; second++) {
      const firstNode = byId.get(generated[first].nodeId)!;
      const secondNode = byId.get(generated[second].nodeId)!;
      if (rectsTooClose(
        rectAt(firstNode, placements[firstNode.id]),
        rectAt(secondNode, placements[secondNode.id])
      )) {
        overlaps.push({ firstId: firstNode.id, secondId: secondNode.id });
      }
    }
  }
  return { duplicateNodeIds, nodesWithIdenticalPositions, overlaps };
}

export function computeListLayout(
  rootId: string,
  hierarchy: Hierarchy,
  byId: Map<string, Node>,
  options: { preserveManualOverrides?: boolean } = {}
): ListPlacements {
  const root = byId.get(rootId);
  if (!root) return {};
  const traversal = getPreorderTraversal(rootId, hierarchy).filter((entry) => byId.has(entry.nodeId));
  if (!traversal.length) return {};
  const preserveManualOverrides = options.preserveManualOverrides ?? false;
  const maxDepth = Math.max(...traversal.map((entry) => entry.depth));
  const maxWidthByDepth = Array.from({ length: maxDepth + 1 }, () => 0);
  for (const entry of traversal) {
    maxWidthByDepth[entry.depth] = Math.max(
      maxWidthByDepth[entry.depth],
      getNodeDimensions(byId.get(entry.nodeId)!).width
    );
  }

  const rootRect = getNodeRect(root);
  const columnX = [rootRect.left];
  for (let depth = 0; depth < maxDepth; depth++) {
    columnX[depth + 1] = columnX[depth]
      + maxWidthByDepth[depth]
      + Math.max(LIST_COLUMN_GUTTER, LIST_MIN_COLUMN_GAP);
  }

  const placements: ListPlacements = {};
  let nextY = rootRect.top;
  let previousRootBranchId: string | null = null;
  for (const entry of traversal) {
    if (
      entry.directRootBranchId !== null &&
      previousRootBranchId !== null &&
      entry.directRootBranchId !== previousRootBranchId
    ) {
      nextY += LIST_ROOT_BRANCH_GAP;
    }
    if (entry.directRootBranchId !== null) previousRootBranchId = entry.directRootBranchId;

    const node = byId.get(entry.nodeId)!;
    const { height } = getNodeDimensions(node);
    const generated = topLeftPosition(node, columnX[entry.depth], nextY);
    placements[entry.nodeId] = preserveManualOverrides
      && (node.data as Record<string, unknown>).listManualOverride === true
      ? { ...node.position }
      : generated;
    nextY += height + LIST_ROW_GAP;
  }

  resolveRowCollisions(traversal, placements, byId, preserveManualOverrides);
  if (process.env.NODE_ENV !== "production") {
    const diagnostics = diagnoseListLayout(traversal, placements, byId, preserveManualOverrides);
    if (
      diagnostics.duplicateNodeIds.length ||
      diagnostics.nodesWithIdenticalPositions.length ||
      diagnostics.overlaps.length
    ) {
      console.warn("[list-layout] geometry diagnostics", diagnostics);
    }
  }
  return placements;
}

export function isListHierarchyEdge(edge: Edge, byId: Map<string, Node>): boolean {
  const data = (edge.data ?? {}) as Record<string, unknown>;
  const target = byId.get(edge.target);
  return data.layoutMode === "list"
    && !edge.hidden
    && !!target
    && (target.data as Record<string, unknown>).parentId === edge.source;
}

export function connectorIntersectsObstacles(
  segments: OrthogonalSegment[],
  obstacles: NodeRect[],
  padding = LIST_CONNECTOR_OBSTACLE_PADDING
): string[] {
  const hits: string[] = [];
  for (const obstacle of obstacles) {
    const inflated = inflateRect(obstacle, padding);
    if (segments.some((segment) => segmentIntersectsRect(segment, inflated))) hits.push(obstacle.id);
  }
  return hits;
}

function segmentKey(segment: OrthogonalSegment): string {
  const start = `${segment.x1.toFixed(3)},${segment.y1.toFixed(3)}`;
  const end = `${segment.x2.toFixed(3)},${segment.y2.toFixed(3)}`;
  return start < end ? `${start}|${end}` : `${end}|${start}`;
}

function connectorSegments(group: ListConnectorGroup): OrthogonalSegment[] {
  return [group.lead, group.bus, ...group.branches.map((branch) => branch.segment)];
}

export function buildListConnectorModel(nodes: Node[], edges: Edge[]): ListConnectorModel {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const hierarchy = buildHierarchy(nodes, edges);
  const edgeCounts = new Map<string, number>();
  edges.forEach((edge) => edgeCounts.set(edge.id, (edgeCounts.get(edge.id) ?? 0) + 1));
  const duplicateEdgeIds = [...edgeCounts.entries()].filter(([, count]) => count > 1).map(([id]) => id);
  const duplicateHierarchyRelations: string[] = [];
  const renderedEdgeIds = new Set<string>();
  const renderedRelations = new Set<string>();
  const eligible = edges.filter((edge) => {
    if (!isListHierarchyEdge(edge, byId)) return false;
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source || !target || source.hidden || target.hidden) return false;
    const sourceData = source.data as Record<string, unknown>;
    const targetData = target.data as Record<string, unknown>;
    if (sourceData.listManualOverride === true || targetData.listManualOverride === true) return false;
    if (renderedEdgeIds.has(edge.id)) return false;
    renderedEdgeIds.add(edge.id);
    const relationKey = `${edge.source}->${edge.target}`;
    if (renderedRelations.has(relationKey)) {
      duplicateHierarchyRelations.push(relationKey);
      return false;
    }
    renderedRelations.add(relationKey);
    return true;
  });
  const byParent = new Map<string, Edge[]>();
  for (const edge of eligible) byParent.set(edge.source, [...(byParent.get(edge.source) ?? []), edge]);

  const visibleRects = nodes
    .filter((node) => !node.hidden && node.type !== "frame" && node.type !== "sunburst")
    .map(getNodeRect);
  const groups: ListConnectorGroup[] = [];
  const obstacleIntersections: ListConnectorModel["obstacleIntersections"] = [];

  for (const [parentId, parentEdges] of byParent) {
    const parent = byId.get(parentId);
    if (!parent) continue;
    const order = hierarchy.get(parentId)?.childIds ?? [];
    const orderIndex = new Map(order.map((id, index) => [id, index]));
    parentEdges.sort((a, b) => (orderIndex.get(a.target) ?? Number.MAX_SAFE_INTEGER) - (orderIndex.get(b.target) ?? Number.MAX_SAFE_INTEGER));
    const childRects = parentEdges
      .map((edge) => ({ edge, rect: byId.get(edge.target) ? getNodeRect(byId.get(edge.target)!) : null }))
      .filter((item): item is { edge: Edge; rect: NodeRect } => !!item.rect);
    if (!childRects.length) continue;

    const parentRect = getNodeRect(parent);
    const childColumnLeft = Math.min(...childRects.map((item) => item.rect.left));
    const corridorStart = parentRect.right + 24;
    const corridorEnd = childColumnLeft - 24;
    const desired = parentRect.right + clamp((childColumnLeft - parentRect.right) * 0.45, 24, 40);
    const minimum = Math.min(corridorStart, corridorEnd);
    const maximum = Math.max(corridorStart, corridorEnd);
    const candidates = [clamp(desired, minimum, maximum)];
    for (let x = minimum; x <= maximum; x += 8) candidates.push(x);

    const buildGroup = (busX: number): ListConnectorGroup => {
      const parentY = parentRect.centerY;
      const childYs = childRects.map((item) => item.rect.centerY);
      return {
        parentId,
        lead: { x1: parentRect.right, y1: parentY, x2: busX, y2: parentY },
        bus: { x1: busX, y1: Math.min(parentY, ...childYs), x2: busX, y2: Math.max(parentY, ...childYs) },
        branches: childRects.map(({ edge, rect }) => ({
          edge,
          childId: edge.target,
          segment: { x1: busX, y1: rect.centerY, x2: rect.left, y2: rect.centerY },
        })),
      };
    };

    const excluded = new Set([parentId, ...childRects.map((item) => item.edge.target)]);
    const obstacles = visibleRects.filter((rect) => !excluded.has(rect.id));
    let best = buildGroup(candidates[0]);
    let bestHits = connectorIntersectsObstacles(connectorSegments(best), obstacles);
    for (const candidate of candidates.slice(1)) {
      const group = buildGroup(candidate);
      const hits = connectorIntersectsObstacles(connectorSegments(group), obstacles);
      if (hits.length < bestHits.length) {
        best = group;
        bestHits = hits;
        if (!hits.length) break;
      }
    }
    bestHits.forEach((obstacleId) => obstacleIntersections.push({ parentId, obstacleId }));
    groups.push(best);
  }

  const segmentCounts = new Map<string, number>();
  groups.flatMap(connectorSegments).forEach((segment) => {
    if (segment.x1 === segment.x2 && segment.y1 === segment.y2) return;
    const key = segmentKey(segment);
    segmentCounts.set(key, (segmentCounts.get(key) ?? 0) + 1);
  });
  const duplicateVisibleConnectorSegments = [...segmentCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([key]) => key);

  if (process.env.NODE_ENV !== "production" && (
    duplicateEdgeIds.length ||
    duplicateHierarchyRelations.length ||
    duplicateVisibleConnectorSegments.length ||
    obstacleIntersections.length
  )) {
    console.warn("[list-connectors] diagnostics", {
      duplicateEdgeIds,
      duplicateHierarchyRelations,
      duplicateVisibleConnectorSegments,
      obstacleIntersections,
    });
  }
  return {
    groups,
    duplicateEdgeIds,
    duplicateHierarchyRelations,
    duplicateVisibleConnectorSegments,
    obstacleIntersections,
  };
}
