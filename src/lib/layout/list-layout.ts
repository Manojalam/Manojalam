import type { Edge, Node } from "@xyflow/react";
import type { Hierarchy } from "./hierarchy";
import { buildHierarchy } from "./hierarchy";
import {
  createNodeRect,
  getNodeDimensions,
  getNodeRect,
  inflateRect,
  segmentIntersectsRect,
  type NodeRect,
  type OrthogonalSegment,
} from "./geometry";

export type ListDensity = "compact" | "comfortable";

export interface ListDensitySettings {
  rootToBranchGapY: number;
  branchColumnGapX: number;
  childIndentX: number;
  rowGapY: number;
  parentChildGapY: number;
  siblingSubtreeGapY: number;
  connectorGutterX: number;
}

export const LIST_DENSITIES: Record<ListDensity, ListDensitySettings> = {
  compact: {
    rootToBranchGapY: 72,
    branchColumnGapX: 56,
    childIndentX: 48,
    rowGapY: 10,
    parentChildGapY: 14,
    siblingSubtreeGapY: 12,
    connectorGutterX: 22,
  },
  comfortable: {
    rootToBranchGapY: 88,
    branchColumnGapX: 76,
    childIndentX: 62,
    rowGapY: 16,
    parentChildGapY: 20,
    siblingSubtreeGapY: 18,
    connectorGutterX: 26,
  },
};

export const DEFAULT_LIST_DENSITY: ListDensity = "compact";
export const LIST_ROW_GAP = LIST_DENSITIES.compact.rowGapY;
export const LIST_ROOT_BRANCH_GAP = LIST_DENSITIES.compact.rootToBranchGapY;
export const LIST_COLUMN_GUTTER = LIST_DENSITIES.compact.childIndentX;
export const LIST_MIN_COLUMN_GAP = LIST_DENSITIES.compact.branchColumnGapX;
export const LIST_OUTER_PADDING = 24;
export const LIST_COLLISION_PADDING_X = 12;
export const LIST_COLLISION_PADDING_Y = 8;
export const LIST_CONNECTOR_OBSTACLE_PADDING = 8;
export const DEFAULT_LIST_CONNECTOR_WIDTH = 2;
export const MIN_LIST_CONNECTOR_WIDTH = 0.5;
export const MAX_LIST_CONNECTOR_WIDTH = 12;
export const LIST_CONNECTOR_WIDTH_STEP = 0.5;

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

export interface BranchColumn {
  branchRootId: string;
  nodeIds: string[];
  bounds: NodeRect;
  width: number;
  height: number;
}

export interface ListLayoutDiagnostics {
  duplicateNodeIds: string[];
  nodesWithIdenticalPositions: string[][];
  overlaps: Array<{ firstId: string; secondId: string }>;
}

export interface ListConnectorBranch {
  edge: Edge;
  childId: string;
  segments: OrthogonalSegment[];
}

export interface ListConnectorGroup {
  parentId: string;
  orientation: "horizontal" | "vertical";
  leads: OrthogonalSegment[];
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
  options: {
    preserveManualOverrides?: boolean;
    preserveBranchAnchors?: boolean;
    density?: ListDensity;
  } = {}
): ListPlacements {
  const root = byId.get(rootId);
  if (!root) return {};
  const traversal = getPreorderTraversal(rootId, hierarchy).filter((entry) => byId.has(entry.nodeId));
  if (!traversal.length) return {};
  const preserveManualOverrides = options.preserveManualOverrides ?? false;
  const preserveBranchAnchors = options.preserveBranchAnchors ?? preserveManualOverrides;
  const rootData = (root.data ?? {}) as Record<string, unknown>;
  const storedDensity = rootData.listDensity === "comfortable" ? "comfortable" : DEFAULT_LIST_DENSITY;
  const density = LIST_DENSITIES[options.density ?? storedDensity];
  const rootRect = getNodeRect(root);
  const generated: ListPlacements = { [rootId]: { ...root.position } };
  const globallyPlaced = new Set<string>([rootId]);

  type CompactSubtree = {
    placements: ListPlacements;
    nodeIds: string[];
    bounds: NodeRect;
  };

  const mergeBounds = (id: string, first: NodeRect, second: NodeRect): NodeRect => createNodeRect(
    id,
    Math.min(first.left, second.left),
    Math.min(first.top, second.top),
    Math.max(first.right, second.right) - Math.min(first.left, second.left),
    Math.max(first.bottom, second.bottom) - Math.min(first.top, second.top)
  );

  const layoutCompactSubtree = (
    nodeId: string,
    baseX: number,
    top: number,
    relativeDepth: number
  ): CompactSubtree | null => {
    const node = byId.get(nodeId);
    if (!node || globallyPlaced.has(nodeId)) return null;
    globallyPlaced.add(nodeId);
    const placement = topLeftPosition(node, baseX + relativeDepth * density.childIndentX, top);
    const nodeRect = rectAt(node, placement);
    const placements: ListPlacements = { [nodeId]: placement };
    const nodeIds = [nodeId];
    let bounds = nodeRect;
    let cursorY = nodeRect.bottom + Math.max(density.rowGapY, density.parentChildGapY);
    const children = hierarchy.get(nodeId)?.childIds ?? [];

    for (const childId of children) {
      const child = layoutCompactSubtree(childId, baseX, cursorY, relativeDepth + 1);
      if (!child) continue;
      Object.assign(placements, child.placements);
      nodeIds.push(...child.nodeIds);
      bounds = mergeBounds(`branch-${nodeId}`, bounds, child.bounds);
      cursorY = child.bounds.bottom + Math.max(density.rowGapY, density.siblingSubtreeGapY);
    }
    return { placements, nodeIds, bounds };
  };

  const branchColumns: BranchColumn[] = [];
  for (const branchRootId of hierarchy.get(rootId)?.childIds ?? []) {
    const branch = layoutCompactSubtree(branchRootId, 0, 0, 0);
    if (!branch) continue;
    branchColumns.push({
      branchRootId,
      nodeIds: branch.nodeIds,
      bounds: branch.bounds,
      width: branch.bounds.width,
      height: branch.bounds.height,
    });
    Object.assign(generated, branch.placements);
  }

  const rowWidth = branchColumns.reduce((total, branch, index) => (
    total + branch.width + (index === 0 ? 0 : density.branchColumnGapX)
  ), 0);
  const branchesTop = rootRect.bottom + density.rootToBranchGapY;
  let nextBranchLeft = preserveBranchAnchors
    ? Number.NEGATIVE_INFINITY
    : rootRect.centerX - rowWidth / 2;
  const preservedTop = preserveBranchAnchors && branchColumns.length
    ? (() => {
        const first = branchColumns[0];
        const node = byId.get(first.branchRootId)!;
        const localRootRect = rectAt(node, generated[first.branchRootId]);
        return getNodeRect(node).top - (localRootRect.top - first.bounds.top);
      })()
    : branchesTop;
  for (const branch of branchColumns) {
    const branchNode = byId.get(branch.branchRootId)!;
    const localRootRect = rectAt(branchNode, generated[branch.branchRootId]);
    const existingRootRect = getNodeRect(branchNode);
    const anchoredLeft = existingRootRect.left - (localRootRect.left - branch.bounds.left);
    const targetLeft = preserveBranchAnchors
      ? Math.max(nextBranchLeft, anchoredLeft)
      : nextBranchLeft;
    const dx = targetLeft - branch.bounds.left;
    const dy = preservedTop - branch.bounds.top;
    for (const nodeId of branch.nodeIds) {
      generated[nodeId] = {
        x: generated[nodeId].x + dx,
        y: generated[nodeId].y + dy,
      };
    }
    branch.bounds = createNodeRect(
      branch.bounds.id,
      branch.bounds.left + dx,
      branch.bounds.top + dy,
      branch.bounds.width,
      branch.bounds.height
    );
    nextBranchLeft = branch.bounds.right + density.branchColumnGapX;
  }

  const placements: ListPlacements = {};
  for (const entry of traversal) {
    const node = byId.get(entry.nodeId)!;
    placements[entry.nodeId] = preserveManualOverrides
      && (node.data as Record<string, unknown>).listManualOverride === true
      ? { ...node.position }
      : generated[entry.nodeId];
  }
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
  return [
    ...group.leads,
    group.bus,
    ...group.branches.flatMap((branch) => branch.segments),
  ];
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
    let root: Node = parent;
    const ancestorIds = new Set<string>();
    while (!ancestorIds.has(root.id)) {
      ancestorIds.add(root.id);
      const data = (root.data ?? {}) as Record<string, unknown>;
      if (data.layoutMode === "list") break;
      const parentNodeId = hierarchy.get(root.id)?.parentId;
      const ancestor = parentNodeId ? byId.get(parentNodeId) : null;
      if (!ancestor) break;
      root = ancestor;
    }
    const rootData = (root.data ?? {}) as Record<string, unknown>;
    const density = LIST_DENSITIES[rootData.listDensity === "comfortable" ? "comfortable" : DEFAULT_LIST_DENSITY];
    const parentData = (parent.data ?? {}) as Record<string, unknown>;
    const isRootGroup = parent.id === root.id && parentData.layoutMode === "list";

    const group: ListConnectorGroup = isRootGroup
      ? (() => {
          const busY = Math.min(...childRects.map((item) => item.rect.top)) - density.connectorGutterX;
          const childXs = childRects.map((item) => item.rect.centerX);
          return {
            parentId,
            orientation: "horizontal" as const,
            leads: [{
              x1: parentRect.centerX,
              y1: parentRect.bottom,
              x2: parentRect.centerX,
              y2: busY,
            }],
            bus: {
              x1: Math.min(parentRect.centerX, ...childXs),
              y1: busY,
              x2: Math.max(parentRect.centerX, ...childXs),
              y2: busY,
            },
            branches: childRects.map(({ edge, rect }) => ({
              edge,
              childId: edge.target,
              segments: [{ x1: rect.centerX, y1: busY, x2: rect.centerX, y2: rect.top }],
            })),
          };
        })()
      : (() => {
          const childLeft = Math.min(...childRects.map((item) => item.rect.left));
          const trunkX = childLeft - density.connectorGutterX;
          const junctionY = Math.min(
            Math.min(...childRects.map((item) => item.rect.centerY)),
            parentRect.bottom + Math.max(6, Math.min(10, density.parentChildGapY / 2))
          );
          const parentAnchorX = parentRect.left + Math.min(14, parentRect.width / 2);
          return {
            parentId,
            orientation: "vertical" as const,
            leads: [
              { x1: parentAnchorX, y1: parentRect.bottom, x2: parentAnchorX, y2: junctionY },
              { x1: parentAnchorX, y1: junctionY, x2: trunkX, y2: junctionY },
            ],
            bus: {
              x1: trunkX,
              y1: junctionY,
              x2: trunkX,
              y2: Math.max(junctionY, ...childRects.map((item) => item.rect.centerY)),
            },
            branches: childRects.map(({ edge, rect }) => ({
              edge,
              childId: edge.target,
              segments: [{ x1: trunkX, y1: rect.centerY, x2: rect.left, y2: rect.centerY }],
            })),
          };
        })();

    const excluded = new Set([parentId, ...childRects.map((item) => item.edge.target)]);
    const obstacles = visibleRects.filter((rect) => !excluded.has(rect.id));
    const hits = connectorIntersectsObstacles(connectorSegments(group), obstacles);
    hits.forEach((obstacleId) => obstacleIntersections.push({ parentId, obstacleId }));
    groups.push(group);

    if (process.env.NODE_ENV !== "production") {
      const longStubs = group.branches.flatMap((branch) => branch.segments)
        .filter((segment) => Math.abs(segment.x2 - segment.x1) + Math.abs(segment.y2 - segment.y1) > density.childIndentX);
      if (longStubs.length) console.warn("[list-connectors] child stub exceeds one indentation step", { parentId, longStubs });
    }
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
