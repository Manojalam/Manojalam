import type { Edge, Node } from "@xyflow/react";
import type { Hierarchy } from "./hierarchy";
import { buildHierarchy, getSubtree } from "./hierarchy";
import {
  DEFAULT_CHILD_GROUP_GAP,
  resolvedFoldSections,
} from "./child-group-wrap";
import {
  getNodeRect,
  inflateRect,
  segmentIntersectsRect,
  type NodeRect,
  type OrthogonalSegment,
} from "./geometry";

export type ListDensity = "compact" | "comfortable";

export interface ListDensitySettings {
  rootToFirstRowGapY: number;
  majorBranchGapY: number;
  childIndentX: number;
  rowGapY: number;
  parentChildGapY: number;
  siblingSubtreeGapY: number;
  connectorGutterX: number;
}

export const LIST_DENSITIES: Record<ListDensity, ListDensitySettings> = {
  compact: {
    rootToFirstRowGapY: 34,
    majorBranchGapY: 34,
    childIndentX: 160,
    rowGapY: 18,
    parentChildGapY: 24,
    siblingSubtreeGapY: 26,
    connectorGutterX: 48,
  },
  comfortable: {
    rootToFirstRowGapY: 46,
    majorBranchGapY: 46,
    childIndentX: 184,
    rowGapY: 26,
    parentChildGapY: 34,
    siblingSubtreeGapY: 38,
    connectorGutterX: 56,
  },
};

export const DEFAULT_LIST_DENSITY: ListDensity = "compact";
export const LIST_ROW_GAP = LIST_DENSITIES.compact.rowGapY;
export const LIST_ROOT_BRANCH_GAP = LIST_DENSITIES.compact.rootToFirstRowGapY;
export const LIST_COLUMN_GUTTER = LIST_DENSITIES.compact.childIndentX;
export const LIST_MIN_COLUMN_GAP = LIST_DENSITIES.compact.childIndentX;
export const LIST_OUTER_PADDING = 24;
export const LIST_COLLISION_PADDING_X = 20;
export const LIST_COLLISION_PADDING_Y = 14;
export const LIST_CONNECTOR_OBSTACLE_PADDING = 8;
export const DEFAULT_LIST_CONNECTOR_WIDTH = 2.5;
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
  sharedSegments: OrthogonalSegment[];
  branches: ListConnectorBranch[];
}

export interface ListConnectorModel {
  groups: ListConnectorGroup[];
  duplicateEdgeIds: string[];
  duplicateHierarchyRelations: string[];
  duplicateVisibleConnectorSegments: string[];
  obstacleIntersections: Array<{ parentId: string; obstacleId: string }>;
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

function boundsForNodeIds(
  nodeIds: string[],
  placements: ListPlacements,
  byId: Map<string, Node>
): NodeRect | null {
  const rects = nodeIds.flatMap((nodeId) => {
    const node = byId.get(nodeId);
    const placement = placements[nodeId];
    return node && placement ? [rectAt(node, placement)] : [];
  });
  if (!rects.length) return null;
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  return {
    id: "list-subtree",
    x: left,
    y: top,
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
  };
}

function verticalFoldExtents(
  children: string[],
  childBounds: Map<string, NodeRect>,
  gap: number
): number[][] | null {
  if (children.some((childId) => !childBounds.has(childId))) return null;
  const extents = Array.from(
    { length: children.length },
    () => Array.from({ length: children.length + 1 }, () => 0)
  );
  for (let start = 0; start < children.length; start += 1) {
    let extent = 0;
    for (let end = start; end < children.length; end += 1) {
      if (end > start) extent += gap;
      extent += childBounds.get(children[end])!.height;
      extents[start][end + 1] = extent;
    }
  }
  return extents;
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
  const rootData = (root.data ?? {}) as Record<string, unknown>;
  const storedDensity = rootData.listDensity === "comfortable" ? "comfortable" : DEFAULT_LIST_DENSITY;
  const density = LIST_DENSITIES[options.density ?? storedDensity];
  const generated: ListPlacements = Object.fromEntries(
    traversal.map((entry) => [entry.nodeId, { ...byId.get(entry.nodeId)!.position }])
  );
  generated[rootId] = { ...root.position };
  const arranged = new Set<string>();
  const arranging = new Set<string>();

  const translateSubtree = (nodeId: string, dx: number, dy: number): void => {
    for (const descendantId of getSubtree(nodeId, hierarchy)) {
      const placement = generated[descendantId];
      if (!placement) continue;
      generated[descendantId] = { x: placement.x + dx, y: placement.y + dy };
    }
  };

  const subtreeBounds = (nodeId: string): NodeRect | null => boundsForNodeIds(
    getSubtree(nodeId, hierarchy),
    generated,
    byId
  );

  const arrangeSubtree = (parentId: string): void => {
    if (arranged.has(parentId) || arranging.has(parentId)) return;
    const parent = byId.get(parentId);
    const parentPlacement = generated[parentId];
    if (!parent || !parentPlacement) return;
    arranging.add(parentId);
    const children = (hierarchy.get(parentId)?.childIds ?? []).filter(
      (childId) => byId.has(childId) && generated[childId] !== undefined
    );
    children.forEach(arrangeSubtree);

    if (children.length) {
      const siblingGap = parentId === rootId
        ? density.rowGapY + density.majorBranchGapY
        : density.siblingSubtreeGapY;
      const childBounds = new Map(children.flatMap((childId) => {
        const bounds = subtreeBounds(childId);
        return bounds ? [[childId, bounds] as const] : [];
      }));
      const sections = resolvedFoldSections(
        (parent.data ?? {}) as Record<string, unknown>,
        children,
        verticalFoldExtents(children, childBounds, siblingGap)
      );
      const parentRect = rectAt(parent, parentPlacement);
      const firstChildTop = parentRect.bottom + (
        parentId === rootId ? density.rootToFirstRowGapY : density.parentChildGapY
      );
      let columnLeft = parentRect.left + density.childIndentX;

      for (const section of sections) {
        let cursorY = firstChildTop;
        let sectionRight = columnLeft;
        for (const childId of section) {
          const child = byId.get(childId)!;
          const childRect = rectAt(child, generated[childId]);
          const bounds = subtreeBounds(childId);
          if (!bounds) continue;
          translateSubtree(childId, columnLeft - childRect.left, cursorY - bounds.top);
          const movedBounds = subtreeBounds(childId)!;
          cursorY = movedBounds.bottom + siblingGap;
          sectionRight = Math.max(sectionRight, movedBounds.right);
        }
        columnLeft = sectionRight + DEFAULT_CHILD_GROUP_GAP;
      }
    }

    arranging.delete(parentId);
    arranged.add(parentId);
  };

  arrangeSubtree(rootId);

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
  if (data.manualRoute === true) return false;
  const source = byId.get(edge.source);
  const target = byId.get(edge.target);
  const sourceData = (source?.data ?? {}) as Record<string, unknown>;
  return (data.layoutMode === "list" || sourceData.layoutMode === "list")
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
    ...group.sharedSegments,
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
    const junctionY = Math.min(
      Math.min(...childRects.map((item) => item.rect.centerY)),
      parentRect.bottom + Math.max(6, Math.min(10, density.parentChildGapY / 2))
    );
    const parentAnchorX = parentRect.left + Math.min(14, parentRect.width / 2);
    // A List parent owns one outline bus. Slightly different child X positions
    // (especially Matrix roots with different widths) must not create parallel
    // trunks that appear as duplicate connectors.
    const trunkX = Math.min(...childRects.map((item) => item.rect.left)) - density.connectorGutterX;
    const trunk = {
      x1: trunkX,
      y1: junctionY,
      x2: trunkX,
      y2: Math.max(junctionY, ...childRects.map((item) => item.rect.centerY)),
    };
    const group: ListConnectorGroup = {
      parentId,
      orientation: "vertical",
      sharedSegments: [
        { x1: parentAnchorX, y1: parentRect.bottom, x2: parentAnchorX, y2: junctionY },
        { x1: parentAnchorX, y1: junctionY, x2: trunkX, y2: junctionY },
        trunk,
      ],
      branches: childRects.map(({ edge, rect }) => ({
        edge,
        childId: edge.target,
        segments: [{
          x1: trunkX,
          y1: rect.centerY,
          x2: rect.left,
          y2: rect.centerY,
        }],
      })),
    };

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
