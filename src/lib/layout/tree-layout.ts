import type { Edge, Node } from "@xyflow/react";
import type { LayoutMode } from "../types";
import type { Hierarchy } from "./hierarchy";
import { buildHierarchy } from "./hierarchy";
import {
  getNodeDimensions,
  getNodeRect,
  inflateRect,
  nodePositionFromTopLeft,
  segmentIntersectsRect,
  type NodeRect,
  type OrthogonalSegment,
} from "./geometry";

export type OrthogonalTreeOrientation = "horizontal" | "vertical";

export interface OrthogonalTreeSpacing {
  levelGap: number;
  siblingGap: number;
  rootBranchGap: number;
}

export const ORTHOGONAL_TREE_SPACING: Record<OrthogonalTreeOrientation, OrthogonalTreeSpacing> = {
  horizontal: {
    levelGap: 104,
    siblingGap: 22,
    rootBranchGap: 34,
  },
  vertical: {
    levelGap: 88,
    siblingGap: 28,
    rootBranchGap: 42,
  },
};

export const TREE_CONNECTOR_OBSTACLE_PADDING = 8;
export const DEFAULT_TREE_CONNECTOR_WIDTH = 2;

export type TreePlacements = Record<string, { x: number; y: number }>;

interface SubtreeMetrics {
  span: number;
  childrenSpan: number;
  children: string[];
}

interface Point {
  x: number;
  y: number;
}

function isTreeMode(mode: unknown): mode is "horizontal" | "vertical" | "topDown" {
  return mode === "horizontal" || mode === "vertical" || mode === "topDown";
}

export function treeOrientationForMode(mode: LayoutMode | undefined): OrthogonalTreeOrientation | null {
  if (mode === "horizontal") return "horizontal";
  if (mode === "vertical" || mode === "topDown") return "vertical";
  return null;
}

/**
 * Packs a measured hierarchy into nested subtree bands. A parent is centered
 * over its complete child band, so collision prevention never moves an
 * individual descendant away from the branch it belongs to.
 */
export function computeOrthogonalTreeLayout(
  rootId: string,
  hierarchy: Hierarchy,
  byId: Map<string, Node>,
  orientation: OrthogonalTreeOrientation
): TreePlacements {
  const root = byId.get(rootId);
  if (!root) return {};

  const spacing = ORTHOGONAL_TREE_SPACING[orientation];
  const horizontal = orientation === "horizontal";
  const levelMaxMain = new Map<number, number>();
  const depthById = new Map<string, number>();
  const collected = new Set<string>();

  const collect = (nodeId: string, depth: number): void => {
    if (collected.has(nodeId)) return;
    const node = byId.get(nodeId);
    if (!node) return;
    collected.add(nodeId);
    depthById.set(nodeId, depth);
    const size = getNodeDimensions(node);
    const mainSize = horizontal ? size.width : size.height;
    levelMaxMain.set(depth, Math.max(levelMaxMain.get(depth) ?? 0, mainSize));
    for (const childId of hierarchy.get(nodeId)?.childIds ?? []) collect(childId, depth + 1);
  };
  collect(rootId, 0);

  const maxDepth = Math.max(0, ...depthById.values());
  const levelCenter = new Map<number, number>();
  let mainCursor = 0;
  for (let depth = 0; depth <= maxDepth; depth += 1) {
    const bandSize = levelMaxMain.get(depth) ?? 0;
    levelCenter.set(depth, mainCursor + bandSize / 2);
    mainCursor += bandSize + spacing.levelGap;
  }

  const metrics = new Map<string, SubtreeMetrics>();
  const measuring = new Set<string>();
  const measure = (nodeId: string): SubtreeMetrics | null => {
    const cached = metrics.get(nodeId);
    if (cached) return cached;
    const node = byId.get(nodeId);
    if (!node || measuring.has(nodeId)) return null;
    measuring.add(nodeId);
    const depth = depthById.get(nodeId) ?? 0;
    const children = (hierarchy.get(nodeId)?.childIds ?? [])
      .filter((childId) => byId.has(childId) && depthById.has(childId));
    const childMetrics = children
      .map((childId) => ({ childId, metrics: measure(childId) }))
      .filter((entry): entry is { childId: string; metrics: SubtreeMetrics } => entry.metrics !== null);
    const orderedChildren = childMetrics.map((entry) => entry.childId);
    const gap = depth === 0 ? spacing.rootBranchGap : spacing.siblingGap;
    const childrenSpan = childMetrics.reduce((sum, entry) => sum + entry.metrics.span, 0)
      + Math.max(0, childMetrics.length - 1) * gap;
    const size = getNodeDimensions(node);
    const ownSpan = horizontal ? size.height : size.width;
    const result = {
      span: Math.max(ownSpan, childrenSpan),
      childrenSpan,
      children: orderedChildren,
    };
    measuring.delete(nodeId);
    metrics.set(nodeId, result);
    return result;
  };

  const rootMetrics = measure(rootId);
  if (!rootMetrics) return {};

  const centers: Record<string, Point> = {};
  const place = (nodeId: string, crossStart: number): void => {
    const nodeMetrics = metrics.get(nodeId);
    if (!nodeMetrics) return;
    const depth = depthById.get(nodeId) ?? 0;
    const crossCenter = crossStart + nodeMetrics.span / 2;
    const mainCenter = levelCenter.get(depth) ?? 0;
    centers[nodeId] = horizontal
      ? { x: mainCenter, y: crossCenter }
      : { x: crossCenter, y: mainCenter };

    if (!nodeMetrics.children.length) return;
    const gap = depth === 0 ? spacing.rootBranchGap : spacing.siblingGap;
    let childStart = crossStart + (nodeMetrics.span - nodeMetrics.childrenSpan) / 2;
    for (const childId of nodeMetrics.children) {
      place(childId, childStart);
      childStart += (metrics.get(childId)?.span ?? 0) + gap;
    }
  };
  place(rootId, 0);

  const rootRect = getNodeRect(root);
  const rawRootCenter = centers[rootId];
  const placements: TreePlacements = {};
  for (const [nodeId, center] of Object.entries(centers)) {
    const node = byId.get(nodeId);
    if (!node) continue;
    const size = getNodeDimensions(node);
    const targetCenter = {
      x: rootRect.centerX + center.x - rawRootCenter.x,
      y: rootRect.centerY + center.y - rawRootCenter.y,
    };
    placements[nodeId] = nodePositionFromTopLeft(
      node,
      { x: targetCenter.x - size.width / 2, y: targetCenter.y - size.height / 2 },
      size
    );
  }
  return placements;
}

export interface TreeConnectorBranch {
  edge: Edge;
  childId: string;
  segments: OrthogonalSegment[];
}

export interface TreeConnectorGroup {
  parentId: string;
  orientation: OrthogonalTreeOrientation;
  sharedSegments: OrthogonalSegment[];
  branches: TreeConnectorBranch[];
}

export interface TreeConnectorModel {
  groups: TreeConnectorGroup[];
  duplicateHierarchyRelations: string[];
  obstacleIntersections: Array<{ parentId: string; obstacleId: string }>;
}

export function isGroupedTreeHierarchyEdge(edge: Edge, byId: Map<string, Node>): boolean {
  const data = (edge.data ?? {}) as Record<string, unknown>;
  const source = byId.get(edge.source);
  const target = byId.get(edge.target);
  if (!source || !target || source.hidden || target.hidden || edge.hidden) return false;
  const sourceData = (source.data ?? {}) as Record<string, unknown>;
  const targetData = (target.data ?? {}) as Record<string, unknown>;
  return isTreeMode(data.layoutMode)
    && targetData.parentId === edge.source
    && sourceData.treeManualOverride !== true
    && targetData.treeManualOverride !== true;
}

function groupSegments(group: TreeConnectorGroup): OrthogonalSegment[] {
  return [
    ...group.sharedSegments,
    ...group.branches.flatMap((branch) => branch.segments),
  ].filter((segment) => segment.x1 !== segment.x2 || segment.y1 !== segment.y2);
}

function connectorHits(segments: OrthogonalSegment[], obstacles: NodeRect[]): string[] {
  return obstacles
    .filter((obstacle) => {
      const inflated = inflateRect(obstacle, TREE_CONNECTOR_OBSTACLE_PADDING);
      return segments.some((segment) => segmentIntersectsRect(segment, inflated));
    })
    .map((obstacle) => obstacle.id);
}

/** Build one shared orthogonal bus for every automatic tree parent. */
export function buildTreeConnectorModel(nodes: Node[], edges: Edge[]): TreeConnectorModel {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const hierarchy = buildHierarchy(nodes, edges);
  const renderedRelations = new Set<string>();
  const duplicateHierarchyRelations: string[] = [];
  const eligible = edges.filter((edge) => {
    if (!isGroupedTreeHierarchyEdge(edge, byId)) return false;
    const relation = `${edge.source}->${edge.target}`;
    if (renderedRelations.has(relation)) {
      duplicateHierarchyRelations.push(relation);
      return false;
    }
    renderedRelations.add(relation);
    return true;
  });
  const edgesByParent = new Map<string, Edge[]>();
  for (const edge of eligible) {
    edgesByParent.set(edge.source, [...(edgesByParent.get(edge.source) ?? []), edge]);
  }

  const visibleRects = nodes
    .filter((node) => !node.hidden && node.type !== "frame" && node.type !== "sunburst")
    .map(getNodeRect);
  const groups: TreeConnectorGroup[] = [];
  const obstacleIntersections: TreeConnectorModel["obstacleIntersections"] = [];

  for (const [parentId, parentEdges] of edgesByParent) {
    const parent = byId.get(parentId);
    if (!parent) continue;
    const parentRect = getNodeRect(parent);
    const order = hierarchy.get(parentId)?.childIds ?? [];
    const orderIndex = new Map(order.map((childId, index) => [childId, index]));
    parentEdges.sort((first, second) =>
      (orderIndex.get(first.target) ?? Number.MAX_SAFE_INTEGER)
      - (orderIndex.get(second.target) ?? Number.MAX_SAFE_INTEGER)
    );
    const children = parentEdges
      .map((edge) => ({ edge, rect: byId.get(edge.target) ? getNodeRect(byId.get(edge.target)!) : null }))
      .filter((entry): entry is { edge: Edge; rect: NodeRect } => entry.rect !== null);
    if (!children.length) continue;

    const mode = ((parentEdges[0].data ?? {}) as Record<string, unknown>).layoutMode as LayoutMode | undefined;
    const orientation = treeOrientationForMode(mode);
    if (!orientation) continue;

    let group: TreeConnectorGroup;
    if (orientation === "vertical") {
      const nearestChildTop = Math.min(...children.map((child) => child.rect.top));
      const clearance = Math.max(0, nearestChildTop - parentRect.bottom);
      const busY = parentRect.bottom + Math.min(56, Math.max(24, clearance / 2));
      const childCenters = children.map((child) => child.rect.centerX);
      group = {
        parentId,
        orientation,
        sharedSegments: [
          { x1: parentRect.centerX, y1: parentRect.bottom, x2: parentRect.centerX, y2: busY },
          { x1: Math.min(...childCenters), y1: busY, x2: Math.max(...childCenters), y2: busY },
        ],
        branches: children.map(({ edge, rect }) => ({
          edge,
          childId: edge.target,
          segments: [{ x1: rect.centerX, y1: busY, x2: rect.centerX, y2: rect.top }],
        })),
      };
    } else {
      const nearestChildLeft = Math.min(...children.map((child) => child.rect.left));
      const clearance = Math.max(0, nearestChildLeft - parentRect.right);
      const busX = parentRect.right + Math.min(64, Math.max(28, clearance / 2));
      const childCenters = children.map((child) => child.rect.centerY);
      group = {
        parentId,
        orientation,
        sharedSegments: [
          { x1: parentRect.right, y1: parentRect.centerY, x2: busX, y2: parentRect.centerY },
          { x1: busX, y1: Math.min(...childCenters), x2: busX, y2: Math.max(...childCenters) },
        ],
        branches: children.map(({ edge, rect }) => ({
          edge,
          childId: edge.target,
          segments: [{ x1: busX, y1: rect.centerY, x2: rect.left, y2: rect.centerY }],
        })),
      };
    }

    const excluded = new Set([parentId, ...children.map((child) => child.edge.target)]);
    const obstacles = visibleRects.filter((rect) => !excluded.has(rect.id));
    for (const obstacleId of connectorHits(groupSegments(group), obstacles)) {
      obstacleIntersections.push({ parentId, obstacleId });
    }
    groups.push(group);
  }

  return { groups, duplicateHierarchyRelations, obstacleIntersections };
}
