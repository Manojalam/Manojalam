"use client";

import { create } from "zustand";
import { MarkerType } from "@xyflow/react";
import type { Node, Edge, Viewport } from "@xyflow/react";
import type {
  BoardSettings,
  NodeRelationship,
  RelationshipDiagramSpec,
  RelationshipFanState,
  SaveStatus,
  VidyaBoard,
  AutoSizeMode,
} from "@/lib/types";
import { DEFAULT_BOARD_SETTINGS } from "@/lib/types";
import { BOARD_CONTENT_VERSION, HISTORY_LIMIT } from "@/lib/config";
import { generateId } from "@/lib/utils";
import {
  computeLayout,
  routeForMode,
  assignDefaultHandles,
  resolveInsertedNodeCollisions,
  getNodeRect,
  getNodeDimensions,
  nodePositionFromTopLeft,
  rectsOverlap,
  resizeAroundAnchor,
  resetNodeDimensions,
  sizeOf,
  type LayoutPlacement,
} from "@/lib/layout";
import { buildHierarchy, getSubtree } from "@/lib/layout/hierarchy";
import {
  applyLayoutPalette,
  supportsAutomaticLayoutColors,
} from "@/lib/layout/layout-palette";
import {
  computeLayoutNodeSizes,
  supportsGeneratedLayoutSizing,
} from "@/lib/layout/layout-presentation";
import { computeListLayout } from "@/lib/layout/list-layout";
import { hasFoldedChildSections } from "@/lib/layout/child-group-wrap";
import { applyStructuredReflowPlacement } from "@/lib/layout/structured-reflow";
import { packSiblingsAfterNestedMatrix } from "@/lib/layout/nested-matrix-spacing";
import {
  clearLayoutEdgeRouting,
  clearLayoutNodeGeometry,
  matrixFrameBelongsToLayoutScope,
  removeStaleGeneratedMatrixFrames,
} from "@/lib/layout/layout-conversion";
import {
  computeMatrixLayout,
  getMatrixBaseSize,
  isMatrixHierarchyEdge,
  matrixNodeSizeDiffersFromPlacement,
  matrixRenderedSizeChanged,
  type MatrixCellGeometry,
  type MatrixLayoutResult,
} from "@/lib/layout/matrix-layout";
import { canonicalRelationshipType } from "@/lib/relationships";
import { normalizeRelationshipDiagramSpec } from "@/lib/relationship-diagram";
import type { LayoutMode, RadialColorScheme } from "@/lib/types";
import {
  effectiveCornerRadius,
  fitShapeToContent,
  legacyRadiusToPercent,
  MAX_AUTOFIT_NODE_HEIGHT,
  MAX_AUTOFIT_NODE_WIDTH,
  MAX_FREEFORM_AUTOFIT_NODE_HEIGHT,
  MAX_FREEFORM_AUTOFIT_NODE_WIDTH,
  type ContentMeasurement,
} from "@/lib/canvas/shape-fitting";
import {
  computeAutoSize,
  resolveAutoSizeMode,
  type ContentResizeReason,
} from "@/lib/canvas/node-sizing";
import type { ManojalamClipboardPayload } from "@/lib/canvas/clipboard";
import { mergeCustomColors, normalizeCustomColors } from "@/lib/canvas/custom-colors";
import {
  resolveHydratedSunburstGeometry,
  viewportsEqual,
} from "@/lib/canvas/hydration";
import { normalizePersistedEdges, normalizePersistedNodes } from "@/lib/canvas/node-persistence";
import { resolveChartNodeResize } from "@/lib/canvas/chart-sizing";
import {
  manualizeFlowchartBranch,
  normalizeImplicitFlowchartRoutes,
  placeFlowchartInsertions,
  refreshAutomaticFlowchartHandles,
  rerouteFlowchartInsertionEdges,
  usesManualFlowchartPlacement,
} from "@/lib/canvas/flowchart-behavior";
import { normalizeConnectorLabelPresets } from "@/lib/canvas/connector-label-presets";
import {
  normalizeBoardColorOverride,
  resolveBoardColorMode,
} from "@/lib/canvas/board-colors";
import { clearConnectorJunctionGraph } from "@/lib/canvas/connector-junction";
import { createExternalNoteNode } from "@/lib/canvas/node-note";
import {
  deleteNodesPreservingHierarchy,
  reparentHierarchy,
} from "@/lib/canvas/hierarchy-mutations";
import {
  applyBoardFontSize,
  normalizeBoardFontSize,
  supportsBoardTypography,
} from "@/lib/canvas/board-typography";

interface HistoryEntry {
  nodes: Node[];
  edges: Edge[];
  relationships: NodeRelationship[];
  relationshipFans: RelationshipFanState[];
  settings: BoardSettings;
}

type ContentSize = ContentMeasurement;
type RelationshipDiagramFrameSize = { width: number; height: number };

interface CanvasState {
  board: VidyaBoard | null;
  nodes: Node[];
  edges: Edge[];
  relationships: NodeRelationship[];
  relationshipFans: RelationshipFanState[];
  viewport: Viewport;
  settings: BoardSettings;
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  saveStatus: SaveStatus;
  isBoardLoading: boolean;
  hasHydratedBoard: boolean;
  hasUserChangedBoard: boolean;
  pendingMigration: boolean;
  history: HistoryEntry[];
  historyIndex: number;
  clipboard: { nodes: Node[]; edges: Edge[] } | null;
  searchQuery: string;
  searchResults: string[];

  beginBoardHydration: () => void;
  setBoard: (board: VidyaBoard) => void;
  setNodes: (nodes: Node[] | ((prev: Node[]) => Node[])) => void;
  setEdges: (edges: Edge[] | ((prev: Edge[]) => Edge[])) => void;
  setViewport: (viewport: Viewport) => void;
  setSettings: (settings: Partial<BoardSettings>) => void;
  setBoardFontSize: (fontSize: number) => void;
  setSaveStatus: (status: SaveStatus) => void;
  setSelectedNodeIds: (ids: string[]) => void;
  setSelectedEdgeIds: (ids: string[]) => void;
  setSearchQuery: (query: string) => void;
  replaceRelationships: (
    sourceNodeId: string,
    relationType: string,
    targetNodeIds: string[],
    targetBranchNodeId?: string,
    editableTargetNodeIds?: readonly string[]
  ) => void;
  clearRelationships: (sourceNodeId: string, relationType: string) => void;
  setRelationshipFanVisible: (sourceNodeId: string, relationType: string, visible: boolean) => void;
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
  copySelected: () => void;
  paste: (payload?: Pick<ManojalamClipboardPayload, "nodes" | "edges">) => void;
  duplicateNode: (nodeId: string) => void;
  duplicateSelected: () => void;
  createRelationshipDiagram: (
    spec: RelationshipDiagramSpec,
    anchorSunburstId?: string,
    frameSize?: RelationshipDiagramFrameSize
  ) => string | null;
  updateRelationshipDiagramSpec: (
    nodeId: string,
    patch: Partial<RelationshipDiagramSpec>,
    frameSize?: RelationshipDiagramFrameSize
  ) => void;
  deleteSelected: () => void;
  reparentNode: (nodeId: string, newParentId: string) => boolean;
  deleteEdges: (ids: string[]) => void;
  clearConnectorJunction: (junctionId: string) => void;
  createChildNode: (parentId: string) => void;
  createChildNodes: (parentId: string, count: number, keepParentSelected?: boolean) => void;
  createSiblingNode: (nodeId: string) => string | null;
  createNodeNote: (nodeId: string, nearPoint?: { x: number; y: number }) => string | null;
  moveSiblingNode: (nodeId: string, direction: -1 | 1) => void;
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void;
  setNodeLocked: (nodeId: string, locked: boolean) => void;
  fitNodeToContent: (nodeId: string, contentSize: ContentSize, reason?: ContentResizeReason) => void;
  fitNodeToStoredContent: (nodeId: string) => void;
  setNodeAutoSizeMode: (nodeId: string, mode: AutoSizeMode) => void;
  beginManualNodeResize: (nodeId: string) => void;
  finishManualNodeResize: (nodeId: string, size: { width: number; height: number }) => void;
  setNodeSize: (nodeId: string, size: { width: number; height: number }) => void;
  resizeNodeToFitBounds: (nodeId: string, bounds: { width: number; height: number }) => void;
  convertNode: (nodeId: string, newType: string, extraData?: Record<string, unknown>) => void;
  scheduleListReflow: (nodeId: string) => void;
  scheduleMatrixReflow: (nodeId: string) => void;
  scheduleStructuredReflow: (nodeId: string, forceAutomatic?: boolean) => void;
  markListManualOverride: (nodeIds: string[], value: boolean) => void;
  markTreeManualOverride: (nodeIds: string[], value: boolean) => void;
  updateBoardTitle: (title: string) => void;
  performSearch: (query: string) => void;
  applyLayout: (mode: LayoutMode, rootIdOverride?: string) => void;
  applyLayoutColorScheme: (rootId: string, scheme: RadialColorScheme, resetOverrides?: boolean) => void;
}

const pendingListReflowNodeIds = new Set<string>();
let listReflowTimer: ReturnType<typeof setTimeout> | null = null;
const pendingMatrixReflowNodeIds = new Set<string>();
let matrixReflowTimer: ReturnType<typeof setTimeout> | null = null;
const pendingStructuredReflowNodeIds = new Set<string>();
const pendingForcedStructuredReflowNodeIds = new Set<string>();
let structuredReflowTimer: ReturnType<typeof setTimeout> | null = null;

function requestNodeInternalsRefresh(nodeIds: string[]): void {
  if (typeof window === "undefined" || !nodeIds.length) return;
  requestAnimationFrame(() => {
    window.dispatchEvent(new CustomEvent("vidya:update-node-internals", { detail: { nodeIds } }));
  });
}

function requestNodeTextEdit(nodeId: string): void {
  if (typeof window === "undefined") return;
  requestAnimationFrame(() => {
    window.dispatchEvent(new CustomEvent("vidya:edit-node", { detail: { nodeId } }));
  });
}

function cancelPendingLayoutReflows(): void {
  if (listReflowTimer) clearTimeout(listReflowTimer);
  listReflowTimer = null;
  pendingListReflowNodeIds.clear();
  if (matrixReflowTimer) clearTimeout(matrixReflowTimer);
  matrixReflowTimer = null;
  pendingMatrixReflowNodeIds.clear();
  if (structuredReflowTimer) clearTimeout(structuredReflowTimer);
  structuredReflowTimer = null;
  pendingStructuredReflowNodeIds.clear();
  pendingForcedStructuredReflowNodeIds.clear();
}

function cloneState(
  nodes: Node[],
  edges: Edge[],
  relationships: NodeRelationship[],
  relationshipFans: RelationshipFanState[],
  settings: BoardSettings
): HistoryEntry {
  return {
    nodes: structuredClone(nodes),
    edges: structuredClone(edges),
    relationships: structuredClone(relationships),
    relationshipFans: structuredClone(relationshipFans),
    settings: structuredClone(settings),
  };
}

function sameHistoryEntry(a: HistoryEntry, b: HistoryEntry): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function relationshipGroupKey(sourceNodeId: string, relationType: string): string {
  return `${sourceNodeId}\u0000${canonicalRelationshipType(relationType)}`;
}

function normalizeRelationshipState(
  nodes: Node[],
  rawRelationships: unknown,
  rawRelationshipFans: unknown
): { relationships: NodeRelationship[]; relationshipFans: RelationshipFanState[] } {
  const validNodeIds = new Set(
    nodes
      .filter((node) =>
        node.type !== "sunburst" &&
        node.type !== "frame" &&
        node.type !== "relationshipDiagram" &&
        node.type !== "junction"
      )
      .map((node) => node.id)
  );
  const relationships: NodeRelationship[] = [];
  const relationshipKeys = new Set<string>();
  const relationshipIds = new Set<string>();

  if (Array.isArray(rawRelationships)) {
    for (const value of rawRelationships) {
      if (!value || typeof value !== "object") continue;
      const candidate = value as Partial<NodeRelationship>;
      const sourceNodeId = typeof candidate.sourceNodeId === "string" ? candidate.sourceNodeId : "";
      const targetNodeId = typeof candidate.targetNodeId === "string" ? candidate.targetNodeId : "";
      const relationType = typeof candidate.relationType === "string"
        ? canonicalRelationshipType(candidate.relationType)
        : "";
      if (
        !sourceNodeId ||
        !targetNodeId ||
        !relationType ||
        sourceNodeId === targetNodeId ||
        !validNodeIds.has(sourceNodeId) ||
        !validNodeIds.has(targetNodeId)
      ) continue;

      const relationshipKey = `${relationshipGroupKey(sourceNodeId, relationType)}\u0000${targetNodeId}`;
      if (relationshipKeys.has(relationshipKey)) continue;
      relationshipKeys.add(relationshipKey);

      let id = typeof candidate.id === "string" && candidate.id.trim() ? candidate.id : generateId();
      if (relationshipIds.has(id)) id = generateId();
      relationshipIds.add(id);
      relationships.push({ id, sourceNodeId, targetNodeId, relationType });
    }
  }

  const populatedGroups = new Set(
    relationships.map((relationship) => relationshipGroupKey(relationship.sourceNodeId, relationship.relationType))
  );
  const relationshipFansByGroup = new Map<string, RelationshipFanState>();
  if (Array.isArray(rawRelationshipFans)) {
    for (const value of rawRelationshipFans) {
      if (!value || typeof value !== "object") continue;
      const candidate = value as Partial<RelationshipFanState>;
      const sourceNodeId = typeof candidate.sourceNodeId === "string" ? candidate.sourceNodeId : "";
      const relationType = typeof candidate.relationType === "string"
        ? canonicalRelationshipType(candidate.relationType)
        : "";
      const groupKey = relationshipGroupKey(sourceNodeId, relationType);
      if (!validNodeIds.has(sourceNodeId) || !relationType || !populatedGroups.has(groupKey)) continue;
      if (relationshipFansByGroup.has(groupKey)) continue;
      const targetBranchNodeId = typeof candidate.targetBranchNodeId === "string" && validNodeIds.has(candidate.targetBranchNodeId)
        ? candidate.targetBranchNodeId
        : undefined;
      relationshipFansByGroup.set(groupKey, {
        sourceNodeId,
        relationType,
        visible: candidate.visible !== false,
        ...(targetBranchNodeId ? { targetBranchNodeId } : {}),
      });
    }
  }

  for (const relationship of relationships) {
    const groupKey = relationshipGroupKey(relationship.sourceNodeId, relationship.relationType);
    if (!relationshipFansByGroup.has(groupKey)) {
      relationshipFansByGroup.set(groupKey, {
        sourceNodeId: relationship.sourceNodeId,
        relationType: relationship.relationType,
        visible: true,
      });
    }
  }

  return { relationships, relationshipFans: Array.from(relationshipFansByGroup.values()) };
}

function applyPlacements(nodes: Node[], placements: Record<string, LayoutPlacement>): Node[] {
  return nodes.map((n) => {
    const placement = placements[n.id];
    if (!placement) return n;
    const nextStyle = placement.width || placement.height
      ? { ...(n.style ?? {}), width: placement.width, height: placement.height }
      : n.style;
    return {
      ...n,
      position: { x: placement.x, y: placement.y },
      style: nextStyle,
    };
  });
}

function storedNodeSize(value: unknown): { width: number; height: number } | null {
  if (!value || typeof value !== "object") return null;
  const size = value as Record<string, unknown>;
  const width = typeof size.width === "number" && Number.isFinite(size.width) && size.width > 0
    ? size.width
    : null;
  const height = typeof size.height === "number" && Number.isFinite(size.height) && size.height > 0
    ? size.height
    : null;
  return width && height ? { width, height } : null;
}

function matrixCellById(result: MatrixLayoutResult): Map<string, MatrixCellGeometry> {
  return new Map([[result.rootId, result.header], ...result.cells.map((cell) => [cell.nodeId, cell] as const)]);
}

function clearMatrixPresentationData(data: Record<string, unknown>): Record<string, unknown> {
  const {
    layoutSizeOverride,
    matrixCell,
    matrixCellRole,
    matrixRootId,
    matrixColumn,
    matrixColumnWidth,
    matrixRowStart,
    matrixRowSpan,
    ...rest
  } = data;
  void matrixCell;
  void matrixCellRole;
  void matrixRootId;
  void matrixColumn;
  void matrixColumnWidth;
  void matrixRowStart;
  void matrixRowSpan;
  if ((layoutSizeOverride as { mode?: unknown } | undefined)?.mode !== "matrix") {
    return { ...rest, ...(layoutSizeOverride !== undefined ? { layoutSizeOverride } : {}) };
  }
  return rest;
}

/** Restores normal dimensions before another layout reads node geometry. */
function restoreMatrixPresentation(node: Node): Node {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const override = data.layoutSizeOverride as { mode?: unknown } | undefined;
  if (override?.mode !== "matrix" && data.matrixCell !== true) return node;
  const size = storedNodeSize(data.userSize) ?? getMatrixBaseSize(node);
  return resetNodeDimensions({
    ...node,
    data: clearMatrixPresentationData(data),
  }, size.width, size.height);
}

/** Restore a node's editable dimensions before calculating another layout. */
function restoreGeneratedLayoutPresentation(node: Node): Node {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const override = data.layoutSizeOverride as { mode?: LayoutMode } | undefined;
  if (!override?.mode || !supportsGeneratedLayoutSizing(override.mode)) return node;
  const size = storedNodeSize(data.userSize);
  if (!size) return node;
  const rect = getNodeRect(node);
  const { layoutSizeOverride: _layoutSizeOverride, ...nextData } = data;
  void _layoutSizeOverride;
  return resetNodeDimensions({
    ...node,
    position: nodePositionFromTopLeft(node, { x: rect.left, y: rect.top }, size),
    data: nextData,
  }, size.width, size.height);
}

function applyGeneratedLayoutPresentation(
  nodes: Node[],
  hierarchy: ReturnType<typeof buildHierarchy>,
  rootId: string,
  mode: LayoutMode
): Node[] {
  const sizes = computeLayoutNodeSizes(nodes, hierarchy, rootId, mode);
  if (!sizes.size) return nodes;
  return nodes.map((node) => {
    const size = sizes.get(node.id);
    if (!size) return node;
    const data = (node.data ?? {}) as Record<string, unknown>;
    const currentOverride = data.layoutSizeOverride as Partial<{
      mode: LayoutMode;
      width: number;
      height: number;
    }> | undefined;
    if (
      currentOverride?.mode === mode
      && Math.abs((currentOverride.width ?? 0) - size.width) < 0.5
      && Math.abs((currentOverride.height ?? 0) - size.height) < 0.5
      && Math.abs(numericDimension(node.style?.width, 0) - size.width) < 0.5
      && Math.abs(numericDimension(node.style?.height, 0) - size.height) < 0.5
    ) return node;
    const normalSize = storedNodeSize(data.userSize) ?? getNodeDimensions(node);
    const rect = getNodeRect(node);
    return resetNodeDimensions({
      ...node,
      position: nodePositionFromTopLeft(node, { x: rect.left, y: rect.top }, size),
      data: {
        ...data,
        userSize: normalSize,
        layoutSizeOverride: { mode, width: size.width, height: size.height },
      },
    }, size.width, size.height);
  });
}

function applyMatrixResultToNodes(
  nodes: Node[],
  result: MatrixLayoutResult,
  hierarchy: ReturnType<typeof buildHierarchy>,
  scopeIds: Set<string>
): Node[] {
  const placements = result.placements;
  const cells = matrixCellById(result);
  const matrixIds = new Set(Object.keys(placements));
  const root = nodes.find((node) => node.id === result.rootId);
  const rootData = (root?.data ?? {}) as Record<string, unknown>;
  const gridVisible = rootData.matrixGridVisible !== false;

  return nodes.map((node) => {
    const h = hierarchy.get(node.id);
    const originalData = (node.data ?? {}) as Record<string, unknown>;
    if (!scopeIds.has(node.id)) {
      if (originalData.matrixRootId !== result.rootId) return node;
      const restored = restoreMatrixPresentation(node);
      return {
        ...restored,
        data: {
          ...clearMatrixPresentationData((restored.data ?? {}) as Record<string, unknown>),
          parentId: h?.parentId ?? null,
          childOrder: h?.childIds ?? [],
        },
      };
    }
    if (!matrixIds.has(node.id)) {
      const restored = restoreMatrixPresentation(node);
      return {
        ...restored,
        data: {
          ...clearMatrixPresentationData((restored.data ?? {}) as Record<string, unknown>),
          parentId: h?.parentId ?? null,
          childOrder: h?.childIds ?? [],
        },
      };
    }

    const placement = placements[node.id];
    const cell = cells.get(node.id)!;
    const normalSize = storedNodeSize(originalData.userSize) ?? getMatrixBaseSize(node);
    const currentOverride = originalData.layoutSizeOverride as Partial<{
      mode: string;
      width: number;
      height: number;
    }> | undefined;
    const sizeChanged = currentOverride?.mode !== "matrix"
      || Math.abs((currentOverride.width ?? 0) - placement.width) > 0.5
      || Math.abs((currentOverride.height ?? 0) - placement.height) > 0.5
      || matrixNodeSizeDiffersFromPlacement(node, placement);
    let data: Record<string, unknown> = {
      ...originalData,
      parentId: h?.parentId ?? null,
      childOrder: h?.childIds ?? [],
      userSize: normalSize,
      layoutSizeOverride: {
        mode: "matrix",
        width: placement.width,
        height: placement.height,
      },
      matrixCell: true,
      matrixCellRole: node.id === result.rootId ? "header" : h?.parentId === result.rootId ? "category" : "cell",
      matrixRootId: result.rootId,
      matrixColumn: cell.column,
      matrixColumnWidth: cell.column >= 0 ? result.columnWidths[cell.column] : result.bounds.width,
      matrixRowStart: cell.rowStart,
      matrixRowSpan: cell.rowSpan,
      matrixGridVisible: gridVisible,
    };
    if (node.id === result.rootId) {
      data.layoutMode = "matrix";
      data.matrixDensity = result.density;
    } else if (data.layoutMode !== undefined) {
      const { layoutMode: _layoutMode, ...rest } = data;
      void _layoutMode;
      data = rest;
    }

    return {
      ...node,
      ...(sizeChanged ? { width: undefined, height: undefined, measured: undefined } : {}),
      position: { x: placement.x, y: placement.y },
      style: { ...(node.style ?? {}), width: placement.width, height: placement.height },
      data,
    };
  });
}

function matrixGeometryChanged(before: Node[], after: Node[], rootId: string): boolean {
  const beforeById = new Map(before.map((node) => [node.id, node]));
  const relevant = (node: Node) => {
    const data = (node.data ?? {}) as Record<string, unknown>;
    return node.id === rootId || data.matrixRootId === rootId || data.matrixFrameFor === rootId;
  };
  for (const node of after.filter(relevant)) {
    const previous = beforeById.get(node.id);
    if (!previous) return true;
    const previousData = (previous.data ?? {}) as Record<string, unknown>;
    const data = (node.data ?? {}) as Record<string, unknown>;
    const previousSize = previousData.layoutSizeOverride as Partial<{ width: number; height: number }> | undefined;
    const size = data.layoutSizeOverride as Partial<{ width: number; height: number }> | undefined;
    if (
      Math.abs(previous.position.x - node.position.x) > 0.5
      || Math.abs(previous.position.y - node.position.y) > 0.5
      || matrixRenderedSizeChanged(previous, node)
      || Math.abs((previousSize?.width ?? numericDimension(previous.style?.width, 0)) - (size?.width ?? numericDimension(node.style?.width, 0))) > 0.5
      || Math.abs((previousSize?.height ?? numericDimension(previous.style?.height, 0)) - (size?.height ?? numericDimension(node.style?.height, 0))) > 0.5
      || previousData.matrixCellRole !== data.matrixCellRole
      || previousData.matrixColumn !== data.matrixColumn
      || previousData.matrixRowStart !== data.matrixRowStart
      || previousData.matrixRowSpan !== data.matrixRowSpan
      || previousData.matrixGridVisible !== data.matrixGridVisible
    ) return true;
  }
  return before.filter(relevant).length !== after.filter(relevant).length;
}

function findLayoutRoot(nodeId: string, nodes: Node[], hierarchy: ReturnType<typeof buildHierarchy>): { id: string; mode?: LayoutMode } {
  let cur: string | null = nodeId;
  let fallback = nodeId;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    fallback = cur;
    const node = nodes.find((n) => n.id === cur);
    const mode = (node?.data as { layoutMode?: LayoutMode } | undefined)?.layoutMode;
    if (mode) return { id: cur, mode };
    cur = hierarchy.get(cur)?.parentId ?? null;
  }
  return { id: fallback };
}

function layoutSchemeValue(nodes: Node[], rootId: string): unknown {
  const data = (nodes.find((node) => node.id === rootId)?.data ?? {}) as Record<string, unknown>;
  return data.layoutColorScheme ?? data.radialColorScheme;
}

function applyPersistedLayoutPalettes(nodes: Node[], edges: Edge[]): { nodes: Node[]; edges: Edge[] } {
  const hierarchyNodes = nodes.filter((node) =>
    !isAutoMatrixFrame(node)
    && !isAutoSunburstNode(node)
    && node.type !== "relationshipDiagram"
  );
  const hierarchy = buildHierarchy(hierarchyNodes, edges);
  let nextNodes = nodes;
  let nextEdges = edges;
  for (const node of hierarchyNodes) {
    const data = (node.data ?? {}) as Record<string, unknown>;
    const mode = data.layoutMode as LayoutMode | undefined;
    if (!supportsAutomaticLayoutColors(mode)) continue;
    const styled = applyLayoutPalette(
      nextNodes,
      nextEdges,
      hierarchy,
      node.id,
      mode,
      data.layoutColorScheme ?? data.radialColorScheme
    );
    nextNodes = styled.nodes;
    nextEdges = styled.edges;
  }
  return { nodes: nextNodes, edges: nextEdges };
}

const BOARD_MATRIX_FRAME_KEY = "__board__";
const BOARD_SUNBURST_KEY = "__board__";

function matrixFrameKey(rootId?: string): string {
  return rootId ?? BOARD_MATRIX_FRAME_KEY;
}

function sunburstFrameKey(rootId?: string): string {
  return rootId ?? BOARD_SUNBURST_KEY;
}

function autoMatrixFrameKey(node: Node): string | null {
  const data = node.data as { matrixFrameFor?: unknown } | undefined;
  return node.type === "frame" && typeof data?.matrixFrameFor === "string" ? data.matrixFrameFor : null;
}

function isAutoMatrixFrame(node: Node): boolean {
  return autoMatrixFrameKey(node) !== null;
}

function autoSunburstKey(node: Node): string | null {
  const data = node.data as { sunburstFor?: unknown } | undefined;
  return node.type === "sunburst" && typeof data?.sunburstFor === "string" ? data.sunburstFor : null;
}

function isAutoSunburstNode(node: Node): boolean {
  return autoSunburstKey(node) !== null;
}

function restoreSunburstPresentation(node: Node): Node {
  const data = (node.data ?? {}) as Record<string, unknown>;
  if (!data.sunburstHiddenFor) return node;
  const { sunburstHiddenFor: _sunburstHiddenFor, ...nextData } = data;
  void _sunburstHiddenFor;
  return { ...node, hidden: false, data: nextData };
}

function clearSunburstNodes(nodes: Node[]): Node[] {
  return nodes
    .filter((node) => !isAutoSunburstNode(node))
    .map(restoreSunburstPresentation);
}

function sunburstTreeStats(rootId: string, hierarchy: ReturnType<typeof buildHierarchy>): { maxDepth: number; leaves: number } {
  const walk = (id: string, depth: number): { maxDepth: number; leaves: number } => {
    const childIds = hierarchy.get(id)?.childIds ?? [];
    if (!childIds.length) return { maxDepth: depth, leaves: 1 };
    return childIds.reduce(
      (stats, childId) => {
        const childStats = walk(childId, depth + 1);
        return {
          maxDepth: Math.max(stats.maxDepth, childStats.maxDepth),
          leaves: stats.leaves + childStats.leaves,
        };
      },
      { maxDepth: depth, leaves: 0 }
    );
  };
  return walk(rootId, 0);
}

function sunburstChartSize(
  rootId: string,
  hierarchy: ReturnType<typeof buildHierarchy>
): number {
  const { maxDepth, leaves } = sunburstTreeStats(rootId, hierarchy);
  const ringDepth = Math.max(1, maxDepth);
  const byDepth = 820 + Math.max(0, ringDepth - 2) * 90;
  const byDensity = 820 + Math.min(460, Math.sqrt(Math.max(1, leaves)) * 26);
  return Math.ceil(clampValue(Math.max(byDepth, byDensity), 900, 1280));
}

const MIN_MANUAL_SUNBURST_SIZE = 420;
const MAX_MANUAL_SUNBURST_SIZE = 4096;

function storedSunburstSize(data: Record<string, unknown>, fallback: number): number {
  if (data.chartSizeManual !== true) return fallback;
  const value = typeof data.chartSize === "number" ? data.chartSize : Number(data.chartSize);
  return Number.isFinite(value)
    ? Math.round(clampValue(value, MIN_MANUAL_SUNBURST_SIZE, MAX_MANUAL_SUNBURST_SIZE))
    : fallback;
}

function withMatrixFrame(nodes: Node[], scopeIds: Set<string>, key: string, enabled: boolean): Node[] {
  const withoutCurrentFrame = nodes.filter((n) => {
    const frameKey = autoMatrixFrameKey(n);
    if (!frameKey) return true;
    if (key === BOARD_MATRIX_FRAME_KEY) return false;
    // A parent conversion owns every generated frame inside its hierarchy.
    // Keeping nested matrix frames here leaves empty rectangular enclosures
    // after the nodes have been regenerated as a tree, list, or other chart.
    return !matrixFrameBelongsToLayoutScope(frameKey, key, scopeIds);
  });

  if (!enabled) return withoutCurrentFrame;

  const scopedNodes = withoutCurrentFrame.filter((node) => {
    if (!scopeIds.has(node.id) || node.hidden) return false;
    if (key === BOARD_MATRIX_FRAME_KEY) return true;
    const data = (node.data ?? {}) as Record<string, unknown>;
    return node.id === key || data.matrixRootId === key;
  });
  if (!scopedNodes.length) return withoutCurrentFrame;
  // A folded Matrix is a set of compact sections, not one rectangular table.
  // Cell borders keep each section legible without framing empty canvas.
  if (hasFoldedChildSections(scopedNodes)) return withoutCurrentFrame;

  const rects = scopedNodes.map((node) => {
    const data = (node.data ?? {}) as Record<string, unknown>;
    const override = data.layoutSizeOverride as Partial<{ mode: string; width: number; height: number }> | undefined;
    if (override?.mode !== "matrix" || !override.width || !override.height) return getNodeRect(node);
    return getNodeRect({
      ...node,
      width: undefined,
      height: undefined,
      measured: undefined,
      style: { ...(node.style ?? {}), width: override.width, height: override.height },
    });
  });
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.width));
  const maxY = Math.max(...rects.map((r) => r.y + r.height));
  const root = scopedNodes.find((node) => node.id === key);
  const rootData = (root?.data ?? {}) as Record<string, unknown>;
  const rootVisualStyle = rootData.layoutVisualStyle as Partial<{
    fillColor: string;
    borderColor: string;
  }> | undefined;
  const frameColor = rootVisualStyle?.borderColor ?? "#334155";
  const frameBackground = rootVisualStyle?.fillColor
    ? `color-mix(in srgb, ${rootVisualStyle.fillColor} 8%, transparent)`
    : "rgba(15, 23, 42, 0.015)";
  const pad = 4;
  const frame: Node = {
    id: `matrix-frame-${key}`,
    type: "frame",
    position: { x: minX - pad, y: minY - pad },
    data: {
      title: "",
      color: frameColor,
      background: frameBackground,
      borderStyle: "solid",
      locked: true,
      matrixFrameFor: key,
      matrixGridVisible: rootData.matrixGridVisible !== false,
      tags: [],
    },
    style: { width: maxX - minX + pad * 2, height: maxY - minY + pad * 2 },
    zIndex: -10,
    selectable: false,
    draggable: false,
  };

  return [...withoutCurrentFrame, frame];
}

function withSunburstNode(
  nodes: Node[],
  hierarchy: ReturnType<typeof buildHierarchy>,
  scopeIds: Set<string>,
  key: string,
  rootId: string | undefined,
  enabled: boolean
): Node[] {
  const existingChart = nodes.find((node) => autoSunburstKey(node) === key);
  const restored = clearSunburstNodes(nodes);
  if (!enabled || !rootId) return restored;

  const rootNode = restored.find((node) => node.id === rootId);
  if (!rootNode) return restored;

  const rootRect = getNodeRect(rootNode);
  const rootCenter = {
    x: rootRect.x + rootRect.width / 2,
    y: rootRect.y + rootRect.height / 2,
  };
  const rootData = (rootNode.data ?? {}) as Record<string, unknown>;
  const automaticChartSize = sunburstChartSize(rootId, hierarchy);
  const existingData = (existingChart?.data ?? {}) as Record<string, unknown>;
  const locked = existingData.locked === true;
  const chartSize = storedSunburstSize(existingData, automaticChartSize);
  const existingRect = existingChart ? getNodeRect(existingChart) : null;
  const hiddenNodes = restored.map((node) => {
    if (!scopeIds.has(node.id)) return node;
    return {
      ...node,
      hidden: true,
      data: { ...(node.data ?? {}), sunburstHiddenFor: key },
    };
  });
  const title = typeof rootData.text === "string" ? rootData.text : typeof rootData.title === "string" ? rootData.title : "";
  const chartNode: Node = {
    id: `sunburst-${key}`,
    type: "sunburst",
    position: existingRect
      ? {
          x: existingRect.centerX - chartSize / 2,
          y: existingRect.centerY - chartSize / 2,
        }
      : {
          x: rootCenter.x - chartSize / 2,
          y: rootCenter.y - chartSize / 2,
        },
    data: {
      ...existingData,
      rootId,
      sunburstFor: key,
      chartSize,
      title,
      locked,
      tags: [],
    },
    style: { ...(existingChart?.style ?? {}), width: chartSize, height: chartSize },
    zIndex: existingChart?.zIndex ?? 20,
    selected: existingChart?.selected ?? false,
    selectable: true,
    draggable: !locked,
  };

  return [...hiddenNodes, chartNode];
}

/**
 * Migrate legacy "mindmap" nodes into rounded shapes so every node is a
 * unified, connectable shape. Preserves all data; adds a shapeType default.
 */
function migrateNodes(nodes: Node[]): Node[] {
  return nodes.map((n) => {
    const data = { ...((n.data ?? {}) as Record<string, unknown>) };
    if (data.cornerRadiusPercent === undefined && typeof data.borderRadius === "number") {
      data.cornerRadiusPercent = legacyRadiusToPercent(data.borderRadius, getNodeDimensions(n), 40);
      delete data.borderRadius;
    }
    delete data.radialChartDiameter;
    delete data.radialRingWidth;
    if (n.type === "relationshipDiagram") {
      const locked = data.locked === true;
      return {
        ...n,
        selectable: true,
        draggable: !locked,
        data: {
          ...data,
          locked,
          relationshipDiagramSpec: normalizeRelationshipDiagramSpec(
            data.relationshipDiagramSpec ?? data.spec
          ),
        },
      };
    }
    if (n.type === "sunburst") {
      const locked = data.locked === true;
      return {
        ...n,
        selectable: true,
        draggable: !locked,
        data: { ...data, locked },
      };
    }
    const defaultCardWidth = n.type === "sanskrit"
      ? 320
      : n.type === "shloka"
        ? 360
        : n.type === "grammar"
          ? 300
          : null;
    if (defaultCardWidth) {
      return {
        ...n,
        data,
        style: { ...(n.style ?? {}), width: n.style?.width ?? defaultCardWidth },
      };
    }
    if (n.type !== "mindmap") return { ...n, data };
    return {
      ...n,
      type: "shape",
      data: { ...data, shapeType: (data.shapeType as string) ?? "rounded" },
    };
  });
}

/** Styling fields a child inherits from its parent (not content or per-node regions). */
function inheritStyle(parentData: Record<string, unknown>): Record<string, unknown> {
  const keys = [
    "shapeType", "color", "fillColor", "fillOpacity",
    "borderColor", "borderWidth", "borderStyle", "cornerRadiusPercent", "borderRadius",
    "fontFamily", "fontSize", "maximizeText", "textColor", "scriptMode", "petalCount",
  ];
  const out: Record<string, unknown> = {};
  for (const k of keys) if (parentData[k] !== undefined) out[k] = parentData[k];
  return out;
}

/** Node types that can act as connectable mind-map shapes. Others default to shape. */
const CONNECTABLE_TYPES = new Set(["shape", "sticky", "text", "mindmap"]);

function childTypeFor(parentType: string | undefined): string {
  if (parentType && CONNECTABLE_TYPES.has(parentType)) {
    return parentType === "mindmap" ? "shape" : parentType;
  }
  return "shape";
}

function getNodeText(data: Record<string, unknown>): string {
  const fields = ["text", "title", "topic", "label", "devanagari", "iast", "translation", "rule"];
  return fields.map((f) => data[f]).filter(Boolean).join(" ");
}

const AUTOFIT_NODE_TYPES = new Set(["shape", "sticky", "text", "mindmap"]);
const AUTOFIT_FIELDS = new Set([
  "text", "richText", "label", "title", "topic", "devanagari", "iast", "translation",
  "rule", "fontSize", "fontFamily", "fontStyle", "fontWeight", "textAlign",
  "shapeType", "petalCount", "borderWidth", "cornerRadiusPercent", "borderRadius", "borderStyle",
]);
const MATRIX_REFLOW_FIELDS = new Set([
  ...AUTOFIT_FIELDS,
  "collapsed", "parentId", "childOrder", "layoutFoldCount", "layoutFoldBreakAfter", "layoutWrapAfter", "matrixDensity", "matrixGridVisible", "matrixOrientation", "matrixChildFlow",
  "matrixWidthOverride", "matrixHeightOverride",
]);
const LIST_REFLOW_FIELDS = new Set([
  ...AUTOFIT_FIELDS,
  "collapsed", "parentId", "childOrder", "layoutFoldCount", "layoutFoldBreakAfter", "layoutWrapAfter", "listDensity",
]);
const MIN_AUTO_NODE_WIDTH = 160;
const MIN_AUTO_NODE_HEIGHT = 56;
const MAX_AUTO_TEXT_WIDTH = 480;
const MAX_AUTO_CARD_WIDTH = 480;

/** Follow persisted hierarchy metadata without rebuilding every edge route on each keystroke. */
function storedLayoutModeForNode(nodeId: string, nodes: Node[]): LayoutMode | undefined {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const visited = new Set<string>();
  let current = byId.get(nodeId);
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    const data = (current.data ?? {}) as Record<string, unknown>;
    const override = data.layoutSizeOverride as { mode?: LayoutMode } | undefined;
    if (override?.mode) return override.mode;
    if (typeof data.layoutMode === "string") return data.layoutMode as LayoutMode;
    const parentId = typeof data.parentId === "string" ? data.parentId : null;
    current = parentId ? byId.get(parentId) : undefined;
  }
  return undefined;
}

function clampValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function numericDimension(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function defaultVisualSize(node: Node): { w: number; h: number } {
  if (node.type === "sticky") return { w: 180, h: 90 };
  if (node.type === "text") return { w: 240, h: 56 };
  if (node.type === "mindmap") return { w: 180, h: 72 };
  if (node.type === "shape") {
    const shapeType = ((node.data ?? {}) as Record<string, unknown>).shapeType as string | undefined;
    if (shapeType === "circle" || shapeType === "diamond" || shapeType === "star" || shapeType === "flower") {
      return { w: 120, h: 120 };
    }
    if (shapeType === "ellipse") return { w: 180, h: 110 };
    if (shapeType === "leaf") return { w: 160, h: 96 };
    if (["document", "database", "predefinedProcess", "delay", "cloud"].includes(shapeType ?? "")) {
      return { w: 170, h: 96 };
    }
    return { w: 140, h: 80 };
  }
  return { w: 180, h: 80 };
}

function styleSizeOf(node: Node): { w: number; h: number } {
  const size = getNodeDimensions(node);
  return { w: size.width, h: size.height };
}

function stripHtmlToLines(value: string): string[] {
  const lines = value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .split(/\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line, index, all) => line || (index > 0 && index < all.length - 1));
  return lines.some(Boolean) ? lines : [];
}

function nodeTextLines(data: Record<string, unknown>): string[] {
  const richText = typeof data.richText === "string" ? stripHtmlToLines(data.richText) : [];
  if (richText.length) return richText;
  const text = getNodeText(data);
  return text
    .split(/\n/)
    .map((line) => line.trim())
    .filter((line, index, all) => line || (index > 0 && index < all.length - 1));
}

function maxInlineFontSize(data: Record<string, unknown>): number | null {
  if (typeof data.richText !== "string") return null;
  const matches = [...data.richText.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/gi)];
  const sizes = matches.map((match) => Number(match[1])).filter(Number.isFinite);
  return sizes.length ? Math.max(...sizes) : null;
}

function measuredOrEstimatedContent(data: Record<string, unknown>): ContentSize {
  const stored = (data.intrinsicContentSize ?? data.matrixIntrinsicSize) as Partial<ContentSize> | undefined;
  if (
    stored
    && typeof stored.width === "number"
    && Number.isFinite(stored.width)
    && stored.width > 0
    && typeof stored.height === "number"
    && Number.isFinite(stored.height)
    && stored.height > 0
  ) {
    return {
      width: stored.width,
      height: stored.height,
      ...(stored.naturalWidth != null ? { naturalWidth: stored.naturalWidth } : {}),
      ...(stored.naturalHeight != null ? { naturalHeight: stored.naturalHeight } : {}),
      ...(stored.lineCount != null ? { lineCount: stored.lineCount } : {}),
      ...(stored.lineHeight != null ? { lineHeight: stored.lineHeight } : {}),
    };
  }

  const lines = nodeTextLines(data);
  const fontSize = clampValue(
    Math.max(typeof data.fontSize === "number" ? data.fontSize : 14, maxInlineFontSize(data) ?? 0),
    10,
    96
  );
  const lineHeight = fontSize * 1.38;
  const text = lines.join(" ");
  const words = text.split(/\s+/).filter(Boolean);
  const longestWord = words.reduce((max, word) => Math.max(max, word.length), 0);
  const charWidth = Math.max(6, fontSize * 0.58);
  const width = Math.min(
    MAX_AUTO_TEXT_WIDTH,
    Math.max(80, Math.ceil(Math.max(longestWord + 2, Math.sqrt(Math.max(text.length, 1)) * 4) * charWidth))
  );
  const lineCount = wrappedLineCount(lines.length ? lines : [""], Math.max(8, Math.floor(width / charWidth)));
  return { width, height: Math.max(lineHeight, lineCount * lineHeight), lineCount, lineHeight };
}

function normalizedContentMeasurement(content: ContentSize): ContentSize {
  return {
    width: Math.max(1, Math.ceil(content.width)),
    height: Math.max(1, Math.ceil(content.height)),
    ...(content.naturalWidth != null
      ? { naturalWidth: Math.max(1, Math.ceil(content.naturalWidth)) }
      : {}),
    ...(content.naturalHeight != null
      ? { naturalHeight: Math.max(1, Math.ceil(content.naturalHeight)) }
      : {}),
    ...(content.lineCount != null ? { lineCount: content.lineCount } : {}),
    ...(content.lineHeight != null ? { lineHeight: content.lineHeight } : {}),
    ...(content.presentationKey != null ? { presentationKey: content.presentationKey } : {}),
    ...(content.measurementWidth != null
      ? { measurementWidth: Math.max(1, content.measurementWidth) }
      : {}),
  };
}

function matrixContentMeasurement(node: Node, content: ContentSize): ContentSize & { cellWidth?: number } {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const override = data.layoutSizeOverride as Partial<{
    mode: LayoutMode;
    width: number;
  }> | undefined;
  return {
    ...content,
    ...(override?.mode === "matrix" && typeof override.width === "number" && override.width > 0
      ? { cellWidth: override.width }
      : {}),
  };
}

function matrixMeasurementCellWidthChanged(
  previous: unknown,
  next: ContentSize & { cellWidth?: number }
): boolean {
  const previousCellWidth = previous && typeof previous === "object"
    ? (previous as { cellWidth?: unknown }).cellWidth
    : undefined;
  return Math.abs(
    (typeof previousCellWidth === "number" ? previousCellWidth : 0)
      - (next.cellWidth ?? 0)
  ) > 1;
}

function createStructuralEdge(nodes: Node[], edges: Edge[], sourceId: string, targetId: string): Edge {
  const source = nodes.find((node) => node.id === sourceId);
  const target = nodes.find((node) => node.id === targetId);
  const hierarchy = buildHierarchy(nodes, edges);
  const layoutRoot = findLayoutRoot(sourceId, nodes, hierarchy);
  const configuredMode = layoutRoot.mode
    ?? ((source?.data as { layoutMode?: LayoutMode } | undefined)?.layoutMode)
    ?? "horizontal";
  const manualFlowchart = !!source && usesManualFlowchartPlacement(source, configuredMode);
  const mode: LayoutMode = manualFlowchart ? "freeForm" : configuredMode;
  const route = source && target ? routeForMode(mode, source, target) : null;
  const hiddenInMatrix = mode === "matrix";
  const hiddenInSunburst = mode === "radial";
  return {
    id: generateId(),
    source: sourceId,
    target: targetId,
    type: "branch",
    hidden: hiddenInMatrix || hiddenInSunburst,
    sourceHandle: route?.sourceHandle,
    targetHandle: route?.targetHandle,
    markerEnd: { type: MarkerType.ArrowClosed, color: "#6366f1" },
    data: {
      edgeType: "branch",
      curveStyle: manualFlowchart ? "step" : route?.curveStyle ?? "smooth",
      arrowEnd: true,
      hiddenInMatrix,
      hiddenInMatrixFor: hiddenInMatrix ? layoutRoot.id : undefined,
      hiddenInSunburst,
      hiddenInSunburstFor: hiddenInSunburst ? sunburstFrameKey(layoutRoot.id) : undefined,
      layoutMode: mode,
      manualRoute: manualFlowchart,
      preserveHandles: false,
    },
  };
}

function refreshStructuralEdge(edge: Edge, nodes: Node[], edges: Edge[]): Edge {
  const created = createStructuralEdge(nodes, edges, edge.source, edge.target);
  return {
    ...edge,
    hidden: created.hidden,
    sourceHandle: created.sourceHandle,
    targetHandle: created.targetHandle,
    markerEnd: edge.markerEnd ?? created.markerEnd,
    data: { ...(edge.data ?? {}), ...(created.data ?? {}) },
  };
}

function contentMeasurementChanged(
  previous: Partial<ContentSize> | undefined,
  next: ContentSize
): boolean {
  return Math.abs((previous?.width ?? 0) - next.width) > 1
    || Math.abs((previous?.height ?? 0) - next.height) > 1
    || Math.abs((previous?.naturalWidth ?? 0) - (next.naturalWidth ?? 0)) > 1
    || Math.abs((previous?.naturalHeight ?? 0) - (next.naturalHeight ?? 0)) > 1
    || Math.abs((previous?.lineCount ?? 0) - (next.lineCount ?? 0)) > 0.5
    || Math.abs((previous?.lineHeight ?? 0) - (next.lineHeight ?? 0)) > 0.5
    || previous?.presentationKey !== next.presentationKey
    || Math.abs((previous?.measurementWidth ?? 0) - (next.measurementWidth ?? 0)) > 1;
}

function wrappedLineCount(lines: string[], maxChars: number): number {
  let count = 0;
  const safeMaxChars = Math.max(1, maxChars);
  for (const line of lines) {
    const words = line.split(/\s+/).filter(Boolean);
    if (!words.length) {
      count += 1;
      continue;
    }
    let current = 0;
    for (const word of words) {
      const wordLength = word.length;
      if (wordLength >= safeMaxChars) {
        if (current > 0) {
          count += 1;
          current = 0;
        }
        count += Math.ceil(wordLength / safeMaxChars);
        continue;
      }
      const nextLength = current === 0 ? wordLength : current + 1 + wordLength;
      if (nextLength > safeMaxChars) {
        count += 1;
        current = wordLength;
      } else {
        current = nextLength;
      }
    }
    if (current > 0) count += 1;
  }
  return Math.max(1, count);
}

function contentFitSize(
  node: Node,
  measuredContent?: ContentSize,
  reason: ContentResizeReason = "input",
  modeOverride?: AutoSizeMode
): { width: number; height: number } | null {
  if (!node.type || !AUTOFIT_NODE_TYPES.has(node.type)) return null;
  const data = node.data as Record<string, unknown>;
  const lines = nodeTextLines(data);
  const { w: currentWidth, h: currentHeight } = styleSizeOf(node);
  const shapeType = (data.shapeType as string | undefined) ?? "";

  if (!lines.length && !measuredContent) {
    if (node.type !== "shape") return null;
    const minimum = defaultVisualSize(node);
    let targetWidth = Math.max(currentWidth, minimum.w);
    let targetHeight = Math.max(currentHeight, minimum.h);
    if (shapeType === "circle" || shapeType === "diamond" || shapeType === "star" || shapeType === "flower") {
      const size = Math.max(targetWidth, targetHeight);
      targetWidth = size;
      targetHeight = size;
    }
    if (targetWidth <= currentWidth && targetHeight <= currentHeight) return null;
    return { width: Math.ceil(targetWidth), height: Math.ceil(targetHeight) };
  }

  const content = measuredContent && measuredContent.width > 0 && measuredContent.height > 0
    ? measuredContent
    : measuredOrEstimatedContent(data);
  const fitted = computeAutoSize({
    mode: modeOverride ?? resolveAutoSizeMode(data),
    currentSize: { width: currentWidth, height: currentHeight },
    content,
    nodeType: node.type,
    shapeType: node.type === "shape" ? shapeType : "rectangle",
    borderWidth: typeof data.borderWidth === "number" ? data.borderWidth : 2,
    cornerRadius: typeof data.borderRadius === "number"
      ? data.borderRadius
      : effectiveCornerRadius(data.cornerRadiusPercent, { width: currentWidth, height: currentHeight }, 20),
    textPadding: node.type === "shape" && typeof data.textPadding === "number"
      ? data.textPadding
      : undefined,
    reason,
    minWidth: node.type === "sticky" ? 180 : MIN_AUTO_NODE_WIDTH,
    minHeight: node.type === "sticky" ? 90 : node.type === "shape" ? 70 : MIN_AUTO_NODE_HEIGHT,
    maxContentWidth: node.type === "text" ? MAX_AUTO_TEXT_WIDTH : MAX_AUTO_CARD_WIDTH,
    maxWidth: MAX_AUTOFIT_NODE_WIDTH,
    maxHeight: MAX_AUTOFIT_NODE_HEIGHT,
  });
  return fitted.changed ? { width: fitted.width, height: fitted.height } : null;
}

function patchNeedsMatrixReflow(patch: Record<string, unknown>): boolean {
  return Object.keys(patch).some((key) => MATRIX_REFLOW_FIELDS.has(key));
}

function patchNeedsListReflow(patch: Record<string, unknown>): boolean {
  return Object.keys(patch).some((key) => LIST_REFLOW_FIELDS.has(key));
}

function normalizeSunburstChartSizes(
  nodes: Node[],
  hierarchy: ReturnType<typeof buildHierarchy>
): Node[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return nodes.map((node) => {
    const data = (node.data ?? {}) as Record<string, unknown>;
    if (node.type !== "sunburst" || typeof data.rootId !== "string" || !byId.has(data.rootId)) return node;
    const current = styleSizeOf(node);
    const visualBounds = data.relationshipVisualBounds && typeof data.relationshipVisualBounds === "object"
      ? data.relationshipVisualBounds as Partial<{ minX: number; minY: number }>
      : null;
    const geometry = resolveHydratedSunburstGeometry({
      position: node.position,
      currentSize: { width: current.w, height: current.h },
      chartSize: data.chartSize,
      automaticSize: sunburstChartSize(data.rootId, hierarchy),
      legacyVisualBounds: visualBounds,
    });
    const locked = data.locked === true;
    const normalizedData: Record<string, unknown> = {
      ...data,
      chartSize: geometry.size,
      locked,
    };
    delete normalizedData.relationshipVisualBounds;
    return {
      ...resetNodeDimensions({
      ...node,
      position: geometry.position,
      data: normalizedData,
      }, geometry.size, geometry.size),
      selectable: true,
      draggable: !locked,
    };
  });
}

function fitNodeAfterContentChange(
  node: Node,
  measuredContent?: ContentSize,
  reason: ContentResizeReason = "input",
  modeOverride?: AutoSizeMode
): Node {
  const fit = contentFitSize(node, measuredContent, reason, modeOverride);
  if (!fit) return node;
  const rect = getNodeRect(node);
  const nextSize = { width: fit.width, height: fit.height };
  const topLeft = resizeAroundAnchor(rect, nextSize, "top-left");
  return resetNodeDimensions({
    ...node,
    position: nodePositionFromTopLeft(node, topLeft, nextSize),
  }, fit.width, fit.height);
}

function nodeRectAt(node: Node, offset: { x: number; y: number } = { x: 0, y: 0 }) {
  const { w, h } = sizeOf(node);
  return {
    id: node.id,
    x: node.position.x + offset.x,
    y: node.position.y + offset.y,
    width: w,
    height: h,
  };
}

function groupBounds(nodes: Node[]) {
  const rects = nodes.map((node) => nodeRectAt(node));
  const minX = Math.min(...rects.map((rect) => rect.x));
  const minY = Math.min(...rects.map((rect) => rect.y));
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.width));
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

const RELATIONSHIP_DIAGRAM_PLACEMENT_GAP = 80;

function relationshipDiagramDefaultSize(
  spec: RelationshipDiagramSpec,
  preferred?: RelationshipDiagramFrameSize
) {
  if (
    preferred
    && Number.isFinite(preferred.width)
    && Number.isFinite(preferred.height)
    && preferred.width > 0
    && preferred.height > 0
  ) {
    return {
      width: Math.max(420, Math.round(preferred.width)),
      height: Math.max(360, Math.round(preferred.height)),
    };
  }
  if (spec.layout === "arc-fan" || spec.layout === "flower" || spec.layout === "radial-hub") {
    return { width: 980, height: 920 };
  }
  if (spec.layout === "matrix") return { width: 1120, height: 720 };
  return { width: 960, height: 720 };
}

/**
 * A sunburst node can temporarily retain the expanded bounds of the legacy
 * relationship fan. New diagrams must be placed beside the compact hierarchy
 * chart, not beside (or inside) that stale halo.
 */
function baseVisualRect(node: Node) {
  if (node.type !== "sunburst") return getNodeRect(node);

  const data = (node.data ?? {}) as Record<string, unknown>;
  const visualBounds = data.relationshipVisualBounds && typeof data.relationshipVisualBounds === "object"
    ? data.relationshipVisualBounds as Partial<{ minX: number; minY: number }>
    : null;
  const minX = typeof visualBounds?.minX === "number" && Number.isFinite(visualBounds.minX)
    ? visualBounds.minX
    : 0;
  const minY = typeof visualBounds?.minY === "number" && Number.isFinite(visualBounds.minY)
    ? visualBounds.minY
    : 0;
  const current = sizeOf(node);
  const chartSize = numericDimension(data.chartSize, Math.min(current.w, current.h));
  return {
    id: node.id,
    x: node.position.x - minX,
    y: node.position.y - minY,
    width: chartSize,
    height: chartSize,
  };
}

function relationshipDiagramAnchor(
  nodes: Node[],
  spec: RelationshipDiagramSpec,
  anchorSunburstId?: string
) {
  const explicit = anchorSunburstId
    ? nodes.find((node) => node.id === anchorSunburstId && node.type === "sunburst" && !node.hidden)
    : null;
  if (explicit) return baseVisualRect(explicit);

  const chartRootId = spec.scope.chartRootNodeId;
  const chart = chartRootId
    ? nodes.find((node) => {
        if (node.type !== "sunburst" || node.hidden) return false;
        const data = (node.data ?? {}) as Record<string, unknown>;
        return data.rootId === chartRootId;
      })
    : null;
  if (chart) return baseVisualRect(chart);

  const sourceIds = new Set(spec.scope.sourceNodeIds);
  const sources = nodes.filter((node) => sourceIds.has(node.id));
  if (sources.length) return { id: "relationship-diagram-sources", ...groupBounds(sources) };

  return { id: "relationship-diagram-origin", x: 0, y: 0, width: 0, height: 0 };
}

/** Keep the original hierarchy fixed and search outward for a free diagram slot. */
function relationshipDiagramPosition(
  nodes: Node[],
  spec: RelationshipDiagramSpec,
  width: number,
  height: number,
  anchorSunburstId?: string
) {
  const anchor = relationshipDiagramAnchor(nodes, spec, anchorSunburstId);
  const origin = {
    x: anchor.x + anchor.width + RELATIONSHIP_DIAGRAM_PLACEMENT_GAP,
    y: anchor.y + (anchor.height - height) / 2,
  };
  const obstacles = nodes
    .filter((node) => !node.hidden)
    .map(baseVisualRect);
  const rowStep = height + RELATIONSHIP_DIAGRAM_PLACEMENT_GAP;
  const columnStep = width + RELATIONSHIP_DIAGRAM_PLACEMENT_GAP;
  const rowOffsets = [0, 1, -1, 2, -2, 3, -3, 4, -4];

  for (let column = 0; column < 8; column += 1) {
    for (const row of rowOffsets) {
      const candidate = {
        id: "relationship-diagram-candidate",
        x: origin.x + column * columnStep,
        y: origin.y + row * rowStep,
        width,
        height,
      };
      if (obstacles.every((obstacle) => !rectsOverlap(candidate, obstacle, 28))) {
        return { x: candidate.x, y: candidate.y };
      }
    }
  }

  return { x: origin.x + 8 * columnStep, y: origin.y };
}

function clearDuplicatedContent(
  data: Record<string, unknown>,
  originalId: string,
  idMap: Map<string, string>,
  preserveContent = false
) {
  const next = structuredClone(data);
  const textFields = [
    "text", "richText", "label", "title", "topic", "devanagari", "iast", "translation",
    "rule", "source", "sourceText", "padaccheda", "anvaya", "padartha", "chandas",
    "grammarNotes", "exceptions", "notes",
  ];
  if (!preserveContent) {
    for (const field of textFields) {
      if (field in next) next[field] = "";
    }
    if (Array.isArray(next.examples)) next.examples = [];
    if (Array.isArray(next.tags)) next.tags = [];
    if (Array.isArray(next.collapsedSections)) next.collapsedSections = [];
  }

  const parentId = typeof next.parentId === "string" ? next.parentId : null;
  next.parentId = parentId && idMap.has(parentId) ? idMap.get(parentId)! : null;
  const childOrder = Array.isArray(next.childOrder) ? next.childOrder : [];
  const mappedChildOrder = childOrder
    .filter((childId): childId is string => typeof childId === "string" && idMap.has(childId))
    .map((childId) => idMap.get(childId)!);
  next.childOrder = mappedChildOrder;
  if (Array.isArray(next.layoutFoldBreakAfter)) {
    const mappedBreaks = next.layoutFoldBreakAfter
      .filter((childId): childId is string => typeof childId === "string" && idMap.has(childId))
      .map((childId) => idMap.get(childId)!);
    if (mappedBreaks.length) next.layoutFoldBreakAfter = mappedBreaks;
    else delete next.layoutFoldBreakAfter;
  }
  if (originalId === parentId || mappedChildOrder.length === 0) delete next.layoutMode;

  return next;
}

function duplicateNodeStyle(node: Node) {
  const { w, h } = sizeOf(node);
  return { ...(node.style ?? {}), width: w, height: h };
}

function findFreeDuplicateOffset(selectedNodes: Node[], allNodes: Node[]) {
  if (!selectedNodes.length) return { x: 40, y: 40 };
  const selectedIds = new Set(selectedNodes.map((node) => node.id));
  const obstacles = allNodes
    .filter((node) => !selectedIds.has(node.id) && !isAutoMatrixFrame(node))
    .map(getNodeRect);
  const bounds = groupBounds(selectedNodes);
  const padding = 28;
  const stepX = Math.max(bounds.width + padding * 2, 120);
  const stepY = Math.max(bounds.height + padding * 2, 100);

  const isFree = (offset: { x: number; y: number }) => {
    const duplicatedRects = selectedNodes.map((node) => nodeRectAt(node, offset));
    return duplicatedRects.every((rect, index) => {
      const clearOfExisting = obstacles.every((obstacle) => !rectsOverlap(rect, obstacle, padding));
      if (!clearOfExisting) return false;
      return duplicatedRects.every((other, otherIndex) =>
        index === otherIndex || !rectsOverlap(rect, other, padding)
      );
    });
  };

  const candidates: Array<{ x: number; y: number }> = [
    { x: stepX, y: 0 },
    { x: 0, y: stepY },
    { x: stepX, y: stepY },
    { x: stepX, y: -stepY },
    { x: -stepX, y: 0 },
    { x: 0, y: -stepY },
    { x: -stepX, y: stepY },
    { x: -stepX, y: -stepY },
  ];

  for (let ring = 1; ring <= 8; ring++) {
    for (let gy = -ring; gy <= ring; gy++) {
      for (let gx = -ring; gx <= ring; gx++) {
        if (Math.max(Math.abs(gx), Math.abs(gy)) !== ring) continue;
        if (gx === 0 && gy === 0) continue;
        candidates.push({ x: gx * stepX, y: gy * stepY });
      }
    }
  }

  const seen = new Set<string>();
  for (const candidate of candidates) {
    const key = `${candidate.x}:${candidate.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (isFree(candidate)) return candidate;
  }

  return { x: stepX, y: stepY };
}

function buildDuplicateSelection(selectedNodes: Node[], selectedEdges: Edge[], allNodes: Node[]) {
  const offset = findFreeDuplicateOffset(selectedNodes, allNodes);
  const idMap = new Map(selectedNodes.map((node) => [node.id, generateId()]));

  const nodes = selectedNodes.map((node) => {
    const newId = idMap.get(node.id)!;
    const data = clearDuplicatedContent(
      node.data as Record<string, unknown>,
      node.id,
      idMap,
      node.type === "relationshipDiagram"
    );
    return {
      ...structuredClone(node),
      id: newId,
      position: { x: node.position.x + offset.x, y: node.position.y + offset.y },
      data,
      style: duplicateNodeStyle(node),
      selected: true,
    };
  });

  const edges = selectedEdges
    .filter((edge) => idMap.has(edge.source) && idMap.has(edge.target))
    .map((edge) => ({
      ...structuredClone(edge),
      id: generateId(),
      source: idMap.get(edge.source)!,
      target: idMap.get(edge.target)!,
      selected: false,
    }));

  return { nodes, edges };
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  board: null,
  nodes: [],
  edges: [],
  relationships: [],
  relationshipFans: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  settings: { ...DEFAULT_BOARD_SETTINGS },
  selectedNodeIds: [],
  selectedEdgeIds: [],
  saveStatus: "saved",
  isBoardLoading: true,
  hasHydratedBoard: false,
  hasUserChangedBoard: false,
  pendingMigration: false,
  history: [],
  historyIndex: -1,
  clipboard: null,
  searchQuery: "",
  searchResults: [],

  beginBoardHydration: () => {
    cancelPendingLayoutReflows();
    set({
      isBoardLoading: true,
      hasHydratedBoard: false,
      hasUserChangedBoard: false,
      pendingMigration: false,
      saveStatus: "saved",
      selectedNodeIds: [],
      selectedEdgeIds: [],
    });
  },

  setBoard: (board) => {
    cancelPendingLayoutReflows();
    const persistedNodes = normalizePersistedNodes(board.content.nodes);
    const persistedEdges = normalizePersistedEdges(board.content.edges);
    const migrated = migrateNodes(persistedNodes);
    // Infer + persist parentId from directed edges (for old boards).
    const hierarchy = buildHierarchy(migrated, persistedEdges);
    const parentedNodes = migrated.map((n) => {
      const h = hierarchy.get(n.id);
      return {
        ...n,
        data: {
          ...n.data,
          parentId: h?.parentId ?? null,
          childOrder: h?.childIds ?? [],
        },
      };
    });
    const hierarchyMigrationRequired = parentedNodes.some((node, index) => {
      const before = (migrated[index].data ?? {}) as Record<string, unknown>;
      const after = node.data as Record<string, unknown>;
      return before.parentId !== after.parentId
        || JSON.stringify(before.childOrder ?? []) !== JSON.stringify(after.childOrder ?? []);
    });
    const activeLayoutNodes = removeStaleGeneratedMatrixFrames(parentedNodes);
    // Ensure every edge has explicit handles so multi-handle nodes render cleanly.
    const handledEdges = assignDefaultHandles(activeLayoutNodes, persistedEdges);
    const normalizedFlowchartEdges = normalizeImplicitFlowchartRoutes(activeLayoutNodes, handledEdges);
    const flowchartEdges = refreshAutomaticFlowchartHandles(activeLayoutNodes, normalizedFlowchartEdges);
    const normalizedNodes = normalizeSunburstChartSizes(activeLayoutNodes, buildHierarchy(activeLayoutNodes, flowchartEdges));
    const styledBoard = applyPersistedLayoutPalettes(normalizedNodes, flowchartEdges);
    const nodes = styledBoard.nodes;
    const edges = styledBoard.edges;
    const { relationships, relationshipFans } = normalizeRelationshipState(
      nodes,
      board.content.relationships,
      board.content.relationshipFans
    );
    const relationshipMigrationRequired =
      JSON.stringify(board.content.relationships ?? []) !== JSON.stringify(relationships) ||
      JSON.stringify(board.content.relationshipFans ?? []) !== JSON.stringify(relationshipFans);
    const structuralMigrationRequired =
      JSON.stringify(board.content.nodes ?? []) !== JSON.stringify(nodes)
      || JSON.stringify(board.content.edges ?? []) !== JSON.stringify(edges);
    const rawSettings = board.content.settings ?? DEFAULT_BOARD_SETTINGS;
    const canvasBackgroundMode = resolveBoardColorMode(
      rawSettings.canvasBackgroundColor,
      rawSettings.canvasBackgroundMode,
      "canvas"
    );
    const gridColorMode = resolveBoardColorMode(
      rawSettings.gridColor,
      rawSettings.gridColorMode,
      "grid"
    );
    const settings: BoardSettings = {
      ...DEFAULT_BOARD_SETTINGS,
      ...rawSettings,
      gridSpacing: numericDimension(
        rawSettings.gridSpacing ?? rawSettings.gridSize,
        DEFAULT_BOARD_SETTINGS.gridSpacing ?? 32
      ),
      defaultFontSize: normalizeBoardFontSize(
        typeof rawSettings.defaultFontSize === "number"
          ? rawSettings.defaultFontSize
          : DEFAULT_BOARD_SETTINGS.defaultFontSize
      ),
      connectorLabelPresets: normalizeConnectorLabelPresets(rawSettings.connectorLabelPresets),
      customTextColors: normalizeCustomColors(rawSettings.customTextColors),
      customHighlightColors: normalizeCustomColors(rawSettings.customHighlightColors),
      customColors: mergeCustomColors(
        rawSettings.customColors,
        rawSettings.customTextColors,
        rawSettings.customHighlightColors,
      ),
      canvasBackgroundMode,
      canvasBackgroundColor: normalizeBoardColorOverride(
        rawSettings.canvasBackgroundColor,
        "canvas",
        canvasBackgroundMode
      ),
      gridColorMode,
      gridColor: normalizeBoardColorOverride(rawSettings.gridColor, "grid", gridColorMode),
    };
    const settingsMigrationRequired = JSON.stringify(rawSettings) !== JSON.stringify(settings);
    const normalizedBoard: VidyaBoard = {
      ...board,
      content: {
        ...board.content,
        version: BOARD_CONTENT_VERSION,
        nodes: nodes as VidyaBoard["content"]["nodes"],
        edges,
        relationships,
        relationshipFans,
        settings,
      },
    };
    const migrationRequired = relationshipMigrationRequired
      || structuralMigrationRequired
      || hierarchyMigrationRequired
      || settingsMigrationRequired;
    set({
      board: normalizedBoard,
      nodes,
      edges,
      relationships,
      relationshipFans,
      selectedNodeIds: [],
      selectedEdgeIds: [],
      viewport: board.content.viewport ?? { x: 0, y: 0, zoom: 1 },
      settings,
      saveStatus: "saved",
      isBoardLoading: false,
      hasHydratedBoard: true,
      hasUserChangedBoard: false,
      pendingMigration: migrationRequired,
      history: [],
      historyIndex: -1,
    });
  },

  setNodes: (nodesOrFn) =>
    set((state) => {
      const nodes = typeof nodesOrFn === "function" ? nodesOrFn(state.nodes) : nodesOrFn;
      const relationshipState = normalizeRelationshipState(
        nodes,
        state.relationships,
        state.relationshipFans
      );
      return {
        nodes,
        ...relationshipState,
        saveStatus: "unsaved",
      };
    }),

  setEdges: (edgesOrFn) =>
    set((state) => ({
      edges: typeof edgesOrFn === "function" ? edgesOrFn(state.edges) : edgesOrFn,
      saveStatus: "unsaved",
    })),

  setViewport: (viewport) => set((state) => viewportsEqual(state.viewport, viewport)
    ? {}
    : { viewport, saveStatus: "unsaved" }),

  setSettings: (partial) =>
    set((state) => ({
      settings: { ...state.settings, ...partial },
      saveStatus: "unsaved",
    })),

  setBoardFontSize: (value) => {
    const fontSize = normalizeBoardFontSize(value);
    const targetIds = get().nodes.filter(supportsBoardTypography).map((node) => node.id);
    set((state) => ({
      nodes: applyBoardFontSize(state.nodes, fontSize),
      settings: { ...state.settings, defaultFontSize: fontSize },
      saveStatus: "unsaved",
    }));
    requestNodeInternalsRefresh(targetIds);
    targetIds.forEach((nodeId) => {
      get().scheduleListReflow(nodeId);
      get().scheduleMatrixReflow(nodeId);
    });
  },

  setSaveStatus: (status) => set((state) => ({
    saveStatus: status,
    ...(status === "unsaved" && state.hasHydratedBoard ? { hasUserChangedBoard: true } : {}),
    ...(status === "saved" && state.hasUserChangedBoard ? { pendingMigration: false } : {}),
  })),

  setSelectedNodeIds: (ids) => set({ selectedNodeIds: ids }),
  setSelectedEdgeIds: (ids) => set({ selectedEdgeIds: ids }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  replaceRelationships: (
    sourceNodeId,
    rawRelationType,
    targetNodeIds,
    targetBranchNodeId,
    editableTargetNodeIds
  ) => {
    const relationType = canonicalRelationshipType(rawRelationType);
    if (!sourceNodeId || !relationType) return;
    const state = get();
    const validNodeIds = new Set(
      state.nodes
        .filter((node) =>
          node.type !== "sunburst" &&
          node.type !== "frame" &&
          node.type !== "relationshipDiagram" &&
          node.type !== "junction"
        )
        .map((node) => node.id)
    );
    if (!validNodeIds.has(sourceNodeId)) return;

    const editableTargetIdSet = editableTargetNodeIds
      ? new Set(editableTargetNodeIds.filter((nodeId) => validNodeIds.has(nodeId)))
      : null;
    const uniqueTargetIds = Array.from(new Set(targetNodeIds)).filter((targetNodeId) =>
      targetNodeId !== sourceNodeId
      && validNodeIds.has(targetNodeId)
      && (!editableTargetIdSet || editableTargetIdSet.has(targetNodeId))
    );
    const groupKey = relationshipGroupKey(sourceNodeId, relationType);
    const existingGroup = state.relationships.filter(
      (relationship) => relationshipGroupKey(relationship.sourceNodeId, relationship.relationType) === groupKey
    );
    const existingByTarget = new Map(
      existingGroup.map((relationship) => [relationship.targetNodeId, relationship])
    );
    // A hierarchy node can be shown by more than one radial chart. Editing one
    // chart must not silently delete the source's relationships to another.
    const relationshipsOutsideEditableChart = editableTargetIdSet
      ? existingGroup.filter((relationship) => !editableTargetIdSet.has(relationship.targetNodeId))
      : [];
    const replacement = uniqueTargetIds.map<NodeRelationship>((targetNodeId) => ({
      id: existingByTarget.get(targetNodeId)?.id ?? generateId(),
      sourceNodeId,
      targetNodeId,
      relationType,
    }));
    const completeReplacement = [...relationshipsOutsideEditableChart, ...replacement];
    const nextRelationships = [
      ...state.relationships.filter(
        (relationship) => relationshipGroupKey(relationship.sourceNodeId, relationship.relationType) !== groupKey
      ),
      ...completeReplacement,
    ];

    const existingFan = state.relationshipFans.find(
      (fan) => relationshipGroupKey(fan.sourceNodeId, fan.relationType) === groupKey
    );
    const otherFans = state.relationshipFans.filter(
      (fan) => relationshipGroupKey(fan.sourceNodeId, fan.relationType) !== groupKey
    );
    const validTargetBranchNodeId = targetBranchNodeId && validNodeIds.has(targetBranchNodeId)
      ? targetBranchNodeId
      : existingFan?.targetBranchNodeId;
    const nextRelationshipFans = completeReplacement.length
      ? [
          ...otherFans,
          {
            sourceNodeId,
            relationType,
            visible: existingFan?.visible ?? true,
            ...(validTargetBranchNodeId ? { targetBranchNodeId: validTargetBranchNodeId } : {}),
          },
        ]
      : otherFans;

    if (
      JSON.stringify(state.relationships) === JSON.stringify(nextRelationships) &&
      JSON.stringify(state.relationshipFans) === JSON.stringify(nextRelationshipFans)
    ) return;

    state.pushHistory();
    set({
      relationships: nextRelationships,
      relationshipFans: nextRelationshipFans,
      saveStatus: "unsaved",
    });
  },

  clearRelationships: (sourceNodeId, rawRelationType) => {
    const relationType = canonicalRelationshipType(rawRelationType);
    if (!sourceNodeId || !relationType) return;
    const state = get();
    const groupKey = relationshipGroupKey(sourceNodeId, relationType);
    const nextRelationships = state.relationships.filter(
      (relationship) => relationshipGroupKey(relationship.sourceNodeId, relationship.relationType) !== groupKey
    );
    const nextRelationshipFans = state.relationshipFans.filter(
      (fan) => relationshipGroupKey(fan.sourceNodeId, fan.relationType) !== groupKey
    );
    if (
      nextRelationships.length === state.relationships.length &&
      nextRelationshipFans.length === state.relationshipFans.length
    ) return;
    state.pushHistory();
    set({
      relationships: nextRelationships,
      relationshipFans: nextRelationshipFans,
      saveStatus: "unsaved",
    });
  },

  setRelationshipFanVisible: (sourceNodeId, rawRelationType, visible) => {
    const relationType = canonicalRelationshipType(rawRelationType);
    if (!sourceNodeId || !relationType) return;
    const state = get();
    const groupKey = relationshipGroupKey(sourceNodeId, relationType);
    const hasRelationships = state.relationships.some(
      (relationship) => relationshipGroupKey(relationship.sourceNodeId, relationship.relationType) === groupKey
    );
    if (!hasRelationships) return;
    const existingFan = state.relationshipFans.find(
      (fan) => relationshipGroupKey(fan.sourceNodeId, fan.relationType) === groupKey
    );
    if (existingFan?.visible === visible) return;
    state.pushHistory();
    set({
      relationshipFans: [
        ...state.relationshipFans.filter(
          (fan) => relationshipGroupKey(fan.sourceNodeId, fan.relationType) !== groupKey
        ),
        {
          sourceNodeId,
          relationType,
          visible,
          ...(existingFan?.targetBranchNodeId ? { targetBranchNodeId: existingFan.targetBranchNodeId } : {}),
        },
      ],
      saveStatus: "unsaved",
    });
  },

  pushHistory: () => {
    const { nodes, edges, relationships, relationshipFans, settings, history, historyIndex } = get();
    const entry = cloneState(nodes, edges, relationships, relationshipFans, settings);
    const newHistory = history.slice(0, historyIndex + 1);
    if (!newHistory.length || !sameHistoryEntry(newHistory[newHistory.length - 1], entry)) {
      newHistory.push(entry);
    }
    if (newHistory.length > HISTORY_LIMIT) newHistory.shift();
    set({ history: newHistory, historyIndex: newHistory.length - 1 });
  },

  undo: () => {
    cancelPendingLayoutReflows();
    const { history, historyIndex, nodes, edges, relationships, relationshipFans, settings } = get();
    if (historyIndex < 0) return;
    const current = cloneState(nodes, edges, relationships, relationshipFans, settings);
    let targetIndex = historyIndex;
    if (history[targetIndex] && sameHistoryEntry(history[targetIndex], current)) targetIndex -= 1;
    if (targetIndex < 0) return;
    const nextHistory = history.slice();
    nextHistory[targetIndex + 1] = current;
    const entry = nextHistory[targetIndex];
    const restoredNodes = structuredClone(entry.nodes);
    const restoredEdges = structuredClone(entry.edges);
    set({
      nodes: restoredNodes,
      edges: restoredEdges,
      relationships: structuredClone(entry.relationships),
      relationshipFans: structuredClone(entry.relationshipFans),
      settings: structuredClone(entry.settings),
      selectedNodeIds: restoredNodes.filter((node) => node.selected).map((node) => node.id),
      selectedEdgeIds: restoredEdges.filter((edge) => edge.selected).map((edge) => edge.id),
      history: nextHistory,
      historyIndex: targetIndex,
      saveStatus: "unsaved",
    });
  },

  redo: () => {
    cancelPendingLayoutReflows();
    const { history, historyIndex } = get();
    if (historyIndex >= history.length - 1) return;
    const newIndex = historyIndex + 1;
    const entry = history[newIndex];
    const restoredNodes = structuredClone(entry.nodes);
    const restoredEdges = structuredClone(entry.edges);
    set({
      nodes: restoredNodes,
      edges: restoredEdges,
      relationships: structuredClone(entry.relationships),
      relationshipFans: structuredClone(entry.relationshipFans),
      settings: structuredClone(entry.settings),
      selectedNodeIds: restoredNodes.filter((node) => node.selected).map((node) => node.id),
      selectedEdgeIds: restoredEdges.filter((edge) => edge.selected).map((edge) => edge.id),
      historyIndex: newIndex,
      saveStatus: "unsaved",
    });
  },

  copySelected: () => {
    const { nodes, edges, selectedNodeIds } = get();
    if (!selectedNodeIds.length) return;
    const selectedNodes = nodes.filter((n) => selectedNodeIds.includes(n.id));
    const selectedEdges = edges.filter(
      (e) => selectedNodeIds.includes(e.source) && selectedNodeIds.includes(e.target)
    );
    set({ clipboard: { nodes: structuredClone(selectedNodes), edges: structuredClone(selectedEdges) } });
  },

  paste: (payload) => {
    const { clipboard, nodes, edges } = get();
    const source = payload ?? clipboard;
    if (!source) return;
    get().pushHistory();
    const idMap = new Map(source.nodes.map((node) => [node.id, generateId()]));
    const preparedNodes = source.nodes.map((n) => {
      const newId = idMap.get(n.id)!;
      const data = structuredClone((n.data ?? {}) as Record<string, unknown>);
      if (typeof data.parentId === "string") data.parentId = idMap.get(data.parentId) ?? null;
      if (Array.isArray(data.childOrder)) {
        data.childOrder = data.childOrder
          .filter((id): id is string => typeof id === "string" && idMap.has(id))
          .map((id) => idMap.get(id)!);
      }
      return {
        ...structuredClone(n),
        id: newId,
        data,
        style: duplicateNodeStyle(n),
        selected: true,
      };
    });
    const offset = findFreeDuplicateOffset(preparedNodes, nodes);
    const newNodes = preparedNodes.map((node) => ({
      ...node,
      position: { x: node.position.x + offset.x, y: node.position.y + offset.y },
    }));
    const newEdges = source.edges.map((e) => ({
      ...structuredClone(e),
      id: generateId(),
      source: idMap.get(e.source) ?? e.source,
      target: idMap.get(e.target) ?? e.target,
    }));
    set({
      nodes: [...nodes.map((n) => ({ ...n, selected: false })), ...newNodes],
      edges: [...edges, ...newEdges],
      selectedNodeIds: newNodes.map((n) => n.id),
      saveStatus: "unsaved",
    });
  },

  duplicateNode: (nodeId) => {
    const { nodes, edges } = get();
    const source = nodes.find((node) => node.id === nodeId);
    if (!source) return;
    get().pushHistory();
    const { nodes: newNodes } = buildDuplicateSelection([source], [], nodes);
    set({
      nodes: [...nodes.map((node) => ({ ...node, selected: false })), ...newNodes],
      edges: edges.map((edge) => ({ ...edge, selected: false })),
      selectedNodeIds: newNodes.map((node) => node.id),
      selectedEdgeIds: [],
      saveStatus: "unsaved",
    });
  },

  duplicateSelected: () => {
    const { nodes, edges, selectedNodeIds } = get();
    if (!selectedNodeIds.length) return;
    get().pushHistory();
    const selectedSet = new Set(selectedNodeIds);
    const selectedNodes = nodes.filter((node) => selectedSet.has(node.id));
    const selectedEdges = edges.filter((edge) => selectedSet.has(edge.source) && selectedSet.has(edge.target));
    const { nodes: newNodes, edges: newEdges } = buildDuplicateSelection(selectedNodes, selectedEdges, nodes);
    set({
      nodes: [...nodes.map((node) => ({ ...node, selected: false })), ...newNodes],
      edges: [...edges.map((edge) => ({ ...edge, selected: false })), ...newEdges],
      selectedNodeIds: newNodes.map((node) => node.id),
      selectedEdgeIds: [],
      saveStatus: "unsaved",
    });
  },

  createRelationshipDiagram: (spec, anchorSunburstId, frameSize) => {
    const state = get();
    if (!spec || !spec.scope || !Array.isArray(spec.scope.sourceNodeIds)) return null;

    const id = generateId();
    const relationshipDiagramSpec = normalizeRelationshipDiagramSpec(spec, spec.scope);
    const { width, height } = relationshipDiagramDefaultSize(relationshipDiagramSpec, frameSize);
    const position = relationshipDiagramPosition(
      state.nodes,
      relationshipDiagramSpec,
      width,
      height,
      anchorSunburstId
    );
    const diagramNode: Node = {
      id,
      type: "relationshipDiagram",
      position,
      data: {
        title: relationshipDiagramSpec.title || "Relationship Diagram",
        background: relationshipDiagramSpec.background,
        relationshipDiagramSpec,
        tags: [],
      },
      style: { width, height },
      zIndex: 10,
      selected: true,
      selectable: true,
      draggable: true,
    };

    state.pushHistory();
    set({
      nodes: [
        ...state.nodes.map((node) => node.selected ? { ...node, selected: false } : node),
        diagramNode,
      ],
      edges: state.edges.map((edge) => edge.selected ? { ...edge, selected: false } : edge),
      selectedNodeIds: [id],
      selectedEdgeIds: [],
      saveStatus: "unsaved",
    });
    return id;
  },

  updateRelationshipDiagramSpec: (nodeId, patch, frameSize) => {
    const state = get();
    const node = state.nodes.find((candidate) =>
      candidate.id === nodeId && candidate.type === "relationshipDiagram"
    );
    if (!node) return;
    const data = (node.data ?? {}) as Record<string, unknown>;
    const currentSpec = data.relationshipDiagramSpec;
    if (!currentSpec || typeof currentSpec !== "object") return;

    const current = normalizeRelationshipDiagramSpec(currentSpec);
    const nextSpec = normalizeRelationshipDiagramSpec({
      ...current,
      ...structuredClone(patch),
      scope: patch.scope
        ? { ...current.scope, ...structuredClone(patch.scope) }
        : current.scope,
    }, current.scope);
    const specChanged = JSON.stringify(currentSpec) !== JSON.stringify(nextSpec);
    const requestedSize = frameSize
      ? relationshipDiagramDefaultSize(nextSpec, frameSize)
      : null;
    const currentSize = sizeOf(node);
    const frameChanged = !!requestedSize && (
      Math.abs(currentSize.w - requestedSize.width) >= 0.5
      || Math.abs(currentSize.h - requestedSize.height) >= 0.5
    );
    if (!specChanged && !frameChanged) return;

    state.pushHistory();
    set({
      nodes: state.nodes.map((candidate) => {
        if (candidate.id !== nodeId) return candidate;
        const layoutChanged = current.layout !== nextSpec.layout;
        const shouldResize = layoutChanged || frameChanged;
        const defaultSize = requestedSize ?? relationshipDiagramDefaultSize(nextSpec);
        const updatedCandidate = {
          ...candidate,
          data: {
            ...(candidate.data ?? {}),
            title: nextSpec.title || "Relationship Diagram",
            background: nextSpec.background,
            relationshipDiagramSpec: nextSpec,
          },
        };
        return shouldResize
          ? resetNodeDimensions(updatedCandidate, defaultSize.width, defaultSize.height)
          : updatedCandidate;
      }),
      saveStatus: "unsaved",
    });
  },

  deleteSelected: () => {
    const { selectedNodeIds, selectedEdgeIds, nodes, edges, relationships, relationshipFans } = get();
    if (!selectedNodeIds.length && !selectedEdgeIds.length) return;
    get().pushHistory();
    const selectedNodes = new Set(selectedNodeIds);
    const selectedEdges = new Set(selectedEdgeIds);
    const hierarchyMutation = deleteNodesPreservingHierarchy(
      nodes,
      edges,
      selectedNodes,
      (source, target) => createStructuralEdge(nodes, edges, source, target)
    );
    const deletedMatrixRoots = new Set(nodes
      .filter((node) => {
        const data = (node.data ?? {}) as Record<string, unknown>;
        return selectedNodes.has(node.id)
          && data.matrixCellRole === "header"
          && data.matrixRootId === node.id;
      })
      .map((node) => node.id));
    const matrixRootByNode = new Map(nodes.map((node) => {
      const data = (node.data ?? {}) as Record<string, unknown>;
      return [node.id, typeof data.matrixRootId === "string" ? data.matrixRootId : null] as const;
    }));
    const affectedMatrixRoots = new Set(nodes
      .filter((node) => selectedNodes.has(node.id))
      .map((node) => (node.data as { matrixRootId?: unknown } | undefined)?.matrixRootId)
      .filter((rootId): rootId is string => typeof rootId === "string" && !selectedNodes.has(rootId)));
    const selectedSunbursts = nodes.filter((node) => selectedNodes.has(node.id) && isAutoSunburstNode(node));
    const removedSunburstKeys = new Set(
      selectedSunbursts.map((node) => autoSunburstKey(node)).filter((key): key is string => !!key)
    );
    const restoredRootIds = new Set(selectedSunbursts
      .map((node) => (node.data as Record<string, unknown> | undefined)?.rootId)
      .filter((rootId): rootId is string => typeof rootId === "string"));
    const nextRelationships = relationships.filter(
      (relationship) =>
        !selectedNodes.has(relationship.sourceNodeId) &&
        !selectedNodes.has(relationship.targetNodeId)
    );
    const populatedRelationshipGroups = new Set(
      nextRelationships.map((relationship) =>
        relationshipGroupKey(relationship.sourceNodeId, relationship.relationType)
      )
    );
    const nextRelationshipFans = relationshipFans
      .filter((fan) =>
        !selectedNodes.has(fan.sourceNodeId) &&
        populatedRelationshipGroups.has(relationshipGroupKey(fan.sourceNodeId, fan.relationType))
      )
      .map((fan) => selectedNodes.has(fan.targetBranchNodeId ?? "")
        ? { ...fan, targetBranchNodeId: undefined }
        : fan);
    const nextNodes = hierarchyMutation.nodes
      .filter((node) => {
        const frameRootId = autoMatrixFrameKey(node);
        return !frameRootId || !deletedMatrixRoots.has(frameRootId);
      })
      .map((node) => {
        const matrixRootId = matrixRootByNode.get(node.id);
        const restoredNode = matrixRootId && deletedMatrixRoots.has(matrixRootId)
          ? restoreMatrixPresentation(node)
          : node;
        const data = (restoredNode.data ?? {}) as Record<string, unknown>;
        const restoreFromSunburst = typeof data.sunburstHiddenFor === "string"
          && removedSunburstKeys.has(data.sunburstHiddenFor);
        const restoreRootLayout = restoredRootIds.has(restoredNode.id) && data.layoutMode === "radial";
        if (!restoreFromSunburst && !restoreRootLayout) return restoredNode;
        const nextData = { ...data };
        if (restoreFromSunburst) delete nextData.sunburstHiddenFor;
        if (restoreRootLayout) delete nextData.layoutMode;
        return {
          ...restoredNode,
          ...(restoreFromSunburst ? { hidden: false } : {}),
          data: nextData,
        };
      });
    let nextEdges = hierarchyMutation.edges
      .filter((edge) => !selectedEdges.has(edge.id))
      .map((edge) => {
        const sourceRootId = matrixRootByNode.get(edge.source);
        const targetRootId = matrixRootByNode.get(edge.target);
        const deletedRootId = sourceRootId && deletedMatrixRoots.has(sourceRootId)
          ? sourceRootId
          : targetRootId && deletedMatrixRoots.has(targetRootId) ? targetRootId : null;
        const data = (edge.data ?? {}) as Record<string, unknown>;
        const restoreFromSunburst = typeof data.hiddenInSunburstFor === "string"
          && removedSunburstKeys.has(data.hiddenInSunburstFor);
        if (!deletedRootId && !restoreFromSunburst) return edge;
        const nextData: Record<string, unknown> = { ...data };
        if (deletedRootId) {
          nextData.hiddenInMatrix = false;
          nextData.hiddenInMatrixFor = undefined;
          nextData.layoutMode = "freeForm";
        }
        if (restoreFromSunburst) {
          delete nextData.hiddenInSunburst;
          delete nextData.hiddenInSunburstFor;
          nextData.layoutMode = "freeForm";
        }
        const baseHidden = !!edge.hidden
          && data.hiddenInMatrix !== true
          && data.hiddenInSunburst !== true;
        return {
          ...edge,
          hidden: baseHidden
            || nextData.hiddenInMatrix === true
            || nextData.hiddenInSunburst === true,
          data: nextData,
        };
      });
    const changedHierarchyEdges = new Set(hierarchyMutation.changedEdgeIds);
    nextEdges = nextEdges.map((edge) => changedHierarchyEdges.has(edge.id)
      ? refreshStructuralEdge(edge, nextNodes, nextEdges)
      : edge);
    set({
      nodes: nextNodes,
      edges: nextEdges,
      relationships: nextRelationships,
      relationshipFans: nextRelationshipFans,
      selectedNodeIds: [],
      selectedEdgeIds: [],
      saveStatus: "unsaved",
    });
    affectedMatrixRoots.forEach((rootId) => get().scheduleMatrixReflow(rootId));
    hierarchyMutation.affectedParentIds.forEach((parentId) => {
      get().scheduleListReflow(parentId);
      get().scheduleMatrixReflow(parentId);
      get().scheduleStructuredReflow(parentId);
    });
  },

  reparentNode: (nodeId, newParentId) => {
    const state = get();
    const result = reparentHierarchy(
      state.nodes,
      state.edges,
      nodeId,
      newParentId,
      (source, target) => createStructuralEdge(state.nodes, state.edges, source, target)
    );
    if (!result.changed) return false;
    const changedEdges = new Set(result.changedEdgeIds);
    const nextEdges = result.edges.map((edge) => changedEdges.has(edge.id)
      ? refreshStructuralEdge(edge, result.nodes, result.edges)
      : edge);
    set({ nodes: result.nodes, edges: nextEdges, saveStatus: "unsaved" });
    result.affectedParentIds.forEach((parentId) => {
      get().scheduleListReflow(parentId);
      get().scheduleMatrixReflow(parentId);
      get().scheduleStructuredReflow(parentId);
    });
    return true;
  },

  deleteEdges: (ids) => {
    if (!ids.length) return;
    const { nodes, edges, selectedEdgeIds } = get();
    const removeIds = new Set(ids);
    if (!edges.some((edge) => removeIds.has(edge.id))) return;
    get().pushHistory();
    const remainingEdges = edges.filter((edge) => !removeIds.has(edge.id));
    const detachedBySource = new Map<string, Set<string>>();
    for (const edge of edges) {
      if (!removeIds.has(edge.id)) continue;
      const target = nodes.find((node) => node.id === edge.target);
      const parentId = (target?.data as { parentId?: unknown } | undefined)?.parentId;
      const duplicateRemains = remainingEdges.some((candidate) => (
        candidate.source === edge.source && candidate.target === edge.target
      ));
      if (parentId !== edge.source || duplicateRemains) continue;
      const targets = detachedBySource.get(edge.source) ?? new Set<string>();
      targets.add(edge.target);
      detachedBySource.set(edge.source, targets);
    }
    set({
      nodes: nodes.map((node) => {
        const data = (node.data ?? {}) as Record<string, unknown>;
        const detachedTargets = detachedBySource.get(node.id);
        if (detachedTargets) {
          const childOrder = Array.isArray(data.childOrder) ? data.childOrder as string[] : [];
          return {
            ...node,
            data: { ...data, childOrder: childOrder.filter((childId) => !detachedTargets.has(childId)) },
          };
        }
        const parentId = typeof data.parentId === "string" ? data.parentId : null;
        if (parentId && detachedBySource.get(parentId)?.has(node.id)) {
          return { ...node, data: { ...data, parentId: null } };
        }
        return node;
      }),
      edges: remainingEdges,
      selectedEdgeIds: selectedEdgeIds.filter((id) => !removeIds.has(id)),
      saveStatus: "unsaved",
    });
    detachedBySource.forEach((_, sourceId) => get().scheduleStructuredReflow(sourceId));
  },

  clearConnectorJunction: (junctionId) => {
    const { nodes, edges } = get();
    if (!nodes.some((node) => node.id === junctionId && node.type === "junction")) return;
    get().pushHistory();
    const result = clearConnectorJunctionGraph(nodes, edges, junctionId);
    set({
      nodes: result.nodes.map((node) => ({ ...node, selected: false })),
      edges: result.edges.map((edge) => ({
        ...edge,
        selected: edge.id === result.mergedEdgeId,
      })),
      selectedNodeIds: [],
      selectedEdgeIds: result.mergedEdgeId ? [result.mergedEdgeId] : [],
      saveStatus: "unsaved",
    });
  },

  createNodeNote: (nodeId, nearPoint) => {
    const { nodes, edges, settings } = get();
    const source = nodes.find((node) => node.id === nodeId);
    if (!source || ["junction", "frame", "sunburst", "relationshipDiagram"].includes(source.type ?? "")) {
      return null;
    }
    get().pushHistory();
    const noteId = generateId();
    const note = createExternalNoteNode(
      source,
      nodes,
      noteId,
      settings.defaultScriptMode,
      nearPoint,
      settings.defaultFontSize
    );
    set({
      nodes: [...nodes.map((node) => ({ ...node, selected: false })), note],
      edges: edges.map((edge) => ({ ...edge, selected: false })),
      selectedNodeIds: [noteId],
      selectedEdgeIds: [],
      saveStatus: "unsaved",
    });
    requestNodeTextEdit(noteId);
    return noteId;
  },

  createChildNode: (parentId) => get().createChildNodes(parentId, 1),

  createChildNodes: (parentId, count, keepParentSelected = false) => {
    const { nodes, edges, settings } = get();
    const parent = nodes.find((n) => n.id === parentId);
    if (!parent || ["relationshipDiagram", "sunburst", "frame", "junction"].includes(parent.type ?? "")) return;
    const safeCount = Math.max(1, Math.min(48, Math.round(count)));
    get().pushHistory();
    const currentHierarchy = buildHierarchy(nodes, edges);
    const currentLayoutRoot = findLayoutRoot(parentId, nodes, currentHierarchy);
    const childIds = Array.from({ length: safeCount }, () => generateId());
    const existingChildCount = currentHierarchy.get(parentId)?.childIds.length ?? 0;
    const parentData = parent.data as Record<string, unknown>;
    const childType = childTypeFor(parent.type);
    const inheritedMode = currentLayoutRoot.mode ?? (parentData.layoutMode as LayoutMode | undefined);
    const manualFlowchart = usesManualFlowchartPlacement(parent, inheritedMode);
    const mode = manualFlowchart ? "freeForm" : inheritedMode ?? "horizontal";
    const hiddenInMatrix = mode === "matrix";
    const hiddenInSunburst = mode === "radial";
    const parentRect = getNodeRect(parent);
    const parentSize = getNodeDimensions(parent);
    const newNodes = childIds.map<Node>((childId, index) => ({
      id: childId,
      type: childType,
      position: {
        x: parentRect.right + 104,
        y: parentRect.centerY - parentSize.height / 2 + (existingChildCount + index) * (parentSize.height + 28),
      },
      data: {
        ...inheritStyle(parentData),
        fontSize: typeof parentData.fontSize === "number" ? parentData.fontSize : settings.defaultFontSize,
        text: "New Idea",
        tags: [],
        parentId,
        ...(childType === "shape" && { shapeType: (parentData.shapeType as string) ?? "rounded" }),
      },
      style: { ...(parent.style ?? {}), width: parentSize.width, height: parentSize.height },
    }));
    const newEdges = newNodes.map<Edge>((newNode) => {
      const route = routeForMode(mode, parent, newNode);
      return {
        id: generateId(),
        source: parentId,
        target: newNode.id,
        type: "branch",
        hidden: hiddenInMatrix || hiddenInSunburst,
        sourceHandle: route.sourceHandle,
        targetHandle: route.targetHandle,
        markerEnd: { type: MarkerType.ArrowClosed, color: "#6366f1" },
        data: {
          edgeType: "branch",
          curveStyle: manualFlowchart ? "step" : route.curveStyle,
          arrowEnd: true,
          hiddenInMatrix,
          hiddenInMatrixFor: hiddenInMatrix ? currentLayoutRoot.id : undefined,
          hiddenInSunburst,
          hiddenInSunburstFor: hiddenInSunburst ? sunburstFrameKey(currentLayoutRoot.id) : undefined,
          layoutMode: mode,
          ...(manualFlowchart && { manualRoute: true }),
        },
      };
    });
    // Record child in the parent's sibling order.
    const storedOrder = parentData.childOrder as string[] | undefined;
    const prevOrder = storedOrder?.length
      ? storedOrder
      : currentHierarchy.get(parentId)?.childIds ?? [];
    let nextNodes = [
      ...nodes.map((n) =>
        n.id === parentId
          ? { ...n, data: { ...n.data, childOrder: [...prevOrder, ...childIds] } }
          : n
      ),
      ...newNodes,
    ];
    let nextEdges = [...edges, ...newEdges];
    let nextHierarchy = buildHierarchy(nextNodes, nextEdges);
    if (manualFlowchart) {
      const manualized = manualizeFlowchartBranch(
        nextNodes,
        nextEdges,
        currentLayoutRoot.id,
        nextHierarchy
      );
      nextNodes = manualized.nodes;
      nextEdges = manualized.edges;
      nextHierarchy = buildHierarchy(nextNodes, nextEdges);
    }
    const layoutRoot = findLayoutRoot(parentId, nextNodes, nextHierarchy);
    const placementMode = layoutRoot.mode ?? mode;
    const useSunburst = placementMode === "radial";
    let placedNodes = manualFlowchart
      ? placeFlowchartInsertions(nextNodes, nextEdges, childIds)
      : nextNodes;
    if (manualFlowchart) {
      nextEdges = rerouteFlowchartInsertionEdges(placedNodes, nextEdges, childIds);
    }
    if (!manualFlowchart && placementMode === "matrix") {
      const result = computeMatrixLayout(
        layoutRoot.id,
        nextHierarchy,
        new Map(nextNodes.filter((node) => !isAutoMatrixFrame(node)).map((node) => [node.id, node]))
      );
      placedNodes = applyMatrixResultToNodes(
        nextNodes,
        result,
        nextHierarchy,
        new Set(getSubtree(layoutRoot.id, nextHierarchy))
      );
    } else if (!manualFlowchart && !useSunburst) {
      const placements = placementMode === "list"
        ? computeListLayout(
            layoutRoot.id,
            nextHierarchy,
            new Map(nextNodes.map((node) => [node.id, node])),
            { preserveBranchAnchors: true }
          )
        : computeLayout(nextNodes, nextEdges, placementMode, { rootId: layoutRoot.id });
      placedNodes = applyPlacements(
        nextNodes,
        placements
      );
    }
    const styledLayout = manualFlowchart
      ? { nodes: placedNodes, edges: nextEdges }
      : applyLayoutPalette(
          placedNodes,
          nextEdges,
          nextHierarchy,
          layoutRoot.id,
          layoutRoot.mode ?? "freeForm",
          layoutSchemeValue(nextNodes, layoutRoot.id)
        );
    const rootScope = new Set(getSubtree(layoutRoot.id, nextHierarchy));
    const matrixNodes = placementMode === "matrix"
      ? withMatrixFrame(styledLayout.nodes, rootScope, matrixFrameKey(layoutRoot.id), true)
      : styledLayout.nodes;
    const finalNodes = useSunburst
      ? withSunburstNode(matrixNodes, nextHierarchy, rootScope, sunburstFrameKey(layoutRoot.id), layoutRoot.id, true)
      : matrixNodes;

    set({
      nodes: finalNodes,
      edges: styledLayout.edges,
      selectedNodeIds: keepParentSelected ? [parentId] : [childIds[childIds.length - 1]],
      saveStatus: "unsaved",
    });
    requestNodeInternalsRefresh(childIds);
    if (!keepParentSelected && childIds.length === 1) requestNodeTextEdit(childIds[0]);
  },

  createSiblingNode: (nodeId) => {
    const { nodes, edges, settings } = get();
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return null;
    const currentHierarchy = buildHierarchy(nodes, edges);
    const parentId = currentHierarchy.get(nodeId)?.parentId;
    if (!parentId) return null;
    const parentNode = nodes.find((candidate) => candidate.id === parentId);
    if (!parentNode) return null;
    const layoutRoot = findLayoutRoot(nodeId, nodes, currentHierarchy);
    get().pushHistory();
    const siblingId = generateId();
    const nodeData = node.data as Record<string, unknown>;
    const sibType = childTypeFor(node.type);
    const parentData = (parentNode.data ?? {}) as Record<string, unknown>;
    const inheritedMode = layoutRoot.mode ?? (parentData.layoutMode as LayoutMode | undefined);
    const manualFlowchart = usesManualFlowchartPlacement(node, inheritedMode);
    const edgeMode = manualFlowchart ? "freeForm" : inheritedMode ?? "horizontal";
    const siblingSize = getNodeDimensions(node);
    const nodeRect = getNodeRect(node);
    const siblingTopLeft = { x: nodeRect.left, y: nodeRect.bottom + 36 };
    const newNode: Node = {
      id: siblingId,
      type: sibType,
      origin: node.origin,
      position: nodePositionFromTopLeft(node, siblingTopLeft, siblingSize),
      data: {
        ...inheritStyle(nodeData),
        fontSize: typeof nodeData.fontSize === "number" ? nodeData.fontSize : settings.defaultFontSize,
        text: "New Idea",
        tags: [],
        parentId,
        ...(sibType === "shape" && { shapeType: (nodeData.shapeType as string) ?? "rounded" }),
      },
      style: { ...(node.style ?? {}), width: siblingSize.width, height: siblingSize.height },
    };
    const newEdges = [...edges];
    const route = routeForMode(edgeMode, parentNode, newNode);
    const hiddenInMatrix = edgeMode === "matrix";
    const hiddenInSunburst = edgeMode === "radial";
    newEdges.push({
      id: generateId(),
      source: parentId,
      target: siblingId,
      type: "branch",
      hidden: hiddenInMatrix || hiddenInSunburst,
      sourceHandle: route.sourceHandle,
      targetHandle: route.targetHandle,
      markerEnd: { type: MarkerType.ArrowClosed, color: "#6366f1" },
      data: {
        edgeType: "branch",
        curveStyle: manualFlowchart ? "step" : route.curveStyle,
        arrowEnd: true,
        hiddenInMatrix,
        hiddenInMatrixFor: hiddenInMatrix ? layoutRoot.id : undefined,
        hiddenInSunburst,
        hiddenInSunburstFor: hiddenInSunburst ? sunburstFrameKey(layoutRoot.id) : undefined,
        layoutMode: edgeMode,
        ...(manualFlowchart && { manualRoute: true }),
      },
    });
    const siblingOrder = [...(currentHierarchy.get(parentId)?.childIds ?? [])];
    const insertionIndex = Math.max(0, siblingOrder.indexOf(nodeId) + 1);
    siblingOrder.splice(insertionIndex, 0, siblingId);
    let nextNodes = [
      ...nodes.map((candidate) => candidate.id === parentId
        ? { ...candidate, data: { ...(candidate.data ?? {}), childOrder: siblingOrder } }
        : candidate),
      newNode,
    ];
    let nextEdges = newEdges;
    let nextHierarchy = buildHierarchy(nextNodes, nextEdges);
    if (manualFlowchart) {
      const manualized = manualizeFlowchartBranch(
        nextNodes,
        nextEdges,
        layoutRoot.id,
        nextHierarchy
      );
      nextNodes = manualized.nodes;
      nextEdges = manualized.edges;
      nextHierarchy = buildHierarchy(nextNodes, nextEdges);
    }
    const nextLayoutRoot = findLayoutRoot(parentId, nextNodes, nextHierarchy);
    const placementMode = nextLayoutRoot.mode ?? edgeMode;
    const useSunburst = placementMode === "radial";
    const placedNodes = manualFlowchart
      ? placeFlowchartInsertions(nextNodes, nextEdges, [siblingId])
      : placementMode === "matrix"
      ? applyMatrixResultToNodes(
          nextNodes,
          computeMatrixLayout(
            nextLayoutRoot.id,
            nextHierarchy,
            new Map(nextNodes.filter((candidate) => !isAutoMatrixFrame(candidate)).map((candidate) => [candidate.id, candidate]))
          ),
          nextHierarchy,
          new Set(getSubtree(nextLayoutRoot.id, nextHierarchy))
        )
      : applyPlacements(
          nextNodes,
          !useSunburst
            ? placementMode === "list"
              ? computeListLayout(
                  nextLayoutRoot.id,
                  nextHierarchy,
                  new Map(nextNodes.map((candidate) => [candidate.id, candidate])),
                  { preserveBranchAnchors: true }
                )
              : computeLayout(nextNodes, nextEdges, placementMode, { rootId: nextLayoutRoot.id })
            : resolveInsertedNodeCollisions(nextNodes, siblingId)
        );
    if (manualFlowchart) {
      nextEdges = rerouteFlowchartInsertionEdges(placedNodes, nextEdges, [siblingId]);
    }
    const styledLayout = manualFlowchart
      ? { nodes: placedNodes, edges: nextEdges }
      : applyLayoutPalette(
          placedNodes,
          nextEdges,
          nextHierarchy,
          nextLayoutRoot.id,
          nextLayoutRoot.mode ?? "freeForm",
          layoutSchemeValue(nextNodes, nextLayoutRoot.id)
        );
    const rootScope = new Set(getSubtree(nextLayoutRoot.id, nextHierarchy));
    const matrixNodes = placementMode === "matrix"
      ? withMatrixFrame(styledLayout.nodes, rootScope, matrixFrameKey(nextLayoutRoot.id), true)
      : styledLayout.nodes;
    const finalNodes = useSunburst
      ? withSunburstNode(matrixNodes, nextHierarchy, rootScope, sunburstFrameKey(nextLayoutRoot.id), nextLayoutRoot.id, true)
      : matrixNodes;

    set({
      nodes: finalNodes,
      edges: styledLayout.edges,
      selectedNodeIds: [siblingId],
      saveStatus: "unsaved",
    });
    get().scheduleListReflow(nodeId);
    get().scheduleMatrixReflow(nodeId);
    requestNodeInternalsRefresh([siblingId]);
    requestNodeTextEdit(siblingId);
    return siblingId;
  },

  moveSiblingNode: (nodeId, direction) => {
    const { nodes, edges } = get();
    const hierarchy = buildHierarchy(nodes, edges);
    const parentId = hierarchy.get(nodeId)?.parentId;
    if (!parentId) return;
    const order = [...(hierarchy.get(parentId)?.childIds ?? [])];
    const currentIndex = order.indexOf(nodeId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= order.length) return;
    [order[currentIndex], order[nextIndex]] = [order[nextIndex], order[currentIndex]];
    get().pushHistory();
    set({
      nodes: nodes.map((candidate) => candidate.id === parentId
        ? { ...candidate, data: { ...(candidate.data ?? {}), childOrder: order } }
        : candidate),
      saveStatus: "unsaved",
    });
    get().scheduleListReflow(nodeId);
    get().scheduleMatrixReflow(nodeId);
    get().scheduleStructuredReflow(nodeId);
  },

  updateNodeData: (nodeId, data) => {
    set((state) => {
      const sourceNode = state.nodes.find((node) => node.id === nodeId);
      const updatedNode: Node | null = sourceNode
        ? { ...sourceNode, data: { ...sourceNode.data, ...data } }
        : null;
      const nodes = state.nodes.map((node) => node.id === nodeId && updatedNode ? updatedNode : node);
      return { nodes, saveStatus: "unsaved" };
    });
    const changedManualFill = Object.prototype.hasOwnProperty.call(data, "fillColor")
      || Object.prototype.hasOwnProperty.call(data, "color");
    if (changedManualFill) {
      const { nodes, edges } = get();
      const editedNode = nodes.find((node) => node.id === nodeId);
      const editedData = (editedNode?.data ?? {}) as Record<string, unknown>;
      const visualStyle = editedData.layoutVisualStyle as Partial<{ rootId: string }> | undefined;
      if (editedData.layoutAutoFill === false && typeof visualStyle?.rootId === "string") {
        const hierarchyNodes = nodes.filter((node) =>
          !isAutoMatrixFrame(node)
          && !isAutoSunburstNode(node)
          && node.type !== "relationshipDiagram"
        );
        const root = hierarchyNodes.find((node) => node.id === visualStyle.rootId);
        const rootData = (root?.data ?? {}) as Record<string, unknown>;
        const mode = rootData.layoutMode as LayoutMode | undefined;
        if (root && supportsAutomaticLayoutColors(mode)) {
          const hierarchy = buildHierarchy(hierarchyNodes, edges);
          const styled = applyLayoutPalette(
            nodes,
            edges,
            hierarchy,
            root.id,
            mode,
            rootData.layoutColorScheme
          );
          const scopeIds = new Set(getSubtree(root.id, hierarchy));
          const nextNodes = mode === "matrix"
            ? withMatrixFrame(styled.nodes, scopeIds, matrixFrameKey(root.id), true)
            : styled.nodes;
          set({ nodes: nextNodes, edges: styled.edges, saveStatus: "unsaved" });
        }
      }
    }
    if (patchNeedsListReflow(data)) get().scheduleListReflow(nodeId);
    if (patchNeedsMatrixReflow(data)) get().scheduleMatrixReflow(nodeId);
    if (
      Object.prototype.hasOwnProperty.call(data, "layoutFoldCount")
      || Object.prototype.hasOwnProperty.call(data, "layoutFoldBreakAfter")
      || Object.prototype.hasOwnProperty.call(data, "layoutWrapAfter")
    ) {
      get().scheduleStructuredReflow(nodeId, true);
    }
  },

  setNodeLocked: (nodeId, locked) => {
    const node = get().nodes.find((candidate) => candidate.id === nodeId);
    if (!node || ((node.data ?? {}) as Record<string, unknown>).locked === locked) return;
    get().pushHistory();
    set((state) => ({
      nodes: state.nodes.map((candidate) => candidate.id === nodeId
        ? {
            ...candidate,
            draggable: !locked,
            data: { ...(candidate.data ?? {}), locked },
          }
        : candidate),
      saveStatus: "unsaved",
    }));
  },

  setNodeAutoSizeMode: (nodeId, mode) => {
    const node = get().nodes.find((candidate) => candidate.id === nodeId);
    if (!node) return;
    const data = (node.data ?? {}) as Record<string, unknown>;
    if (resolveAutoSizeMode(data) === mode && data.autoSizeMode === mode) return;
    get().pushHistory();
    const currentSize = getNodeDimensions(node);
    set((state) => ({
      nodes: state.nodes.map((candidate) => candidate.id === nodeId
        ? {
            ...candidate,
            data: {
              ...(candidate.data ?? {}),
              autoSizeMode: mode,
              ...(mode === "smart" ? {} : { userSize: currentSize }),
            },
          }
        : candidate),
      saveStatus: "unsaved",
    }));
  },

  beginManualNodeResize: (nodeId) => {
    const node = get().nodes.find((candidate) => candidate.id === nodeId);
    if (!node) return;
    get().pushHistory();
    const data = (node.data ?? {}) as Record<string, unknown>;
    if (data.matrixCell === true) return;
    const currentSize = getNodeDimensions(node);
    set((state) => ({
      nodes: state.nodes.map((candidate) => candidate.id === nodeId
        ? {
            ...candidate,
            data: {
              ...(candidate.data ?? {}),
              autoSizeMode: "fixed" as AutoSizeMode,
              userSize: currentSize,
            },
          }
        : candidate),
      saveStatus: "unsaved",
    }));
  },

  finishManualNodeResize: (nodeId, size) => {
    const node = get().nodes.find((candidate) => candidate.id === nodeId);
    if (!node) return;
    const nodeData = (node.data ?? {}) as Record<string, unknown>;
    if (nodeData.matrixCell === true) {
      const layoutOverride = nodeData.layoutSizeOverride as Partial<{
        mode: string;
        width: number;
        height: number;
      }> | undefined;
      const currentSize = layoutOverride?.mode === "matrix"
        && typeof layoutOverride.width === "number"
        && typeof layoutOverride.height === "number"
        ? { width: layoutOverride.width, height: layoutOverride.height }
        : getNodeDimensions(node);
      const currentColumnWidth = typeof nodeData.matrixColumnWidth === "number"
        ? nodeData.matrixColumnWidth
        : currentSize.width;
      const desiredColumnWidth = Math.max(80, Math.min(1200,
        Math.round(currentColumnWidth + size.width - currentSize.width)
      ));
      const desiredHeight = Math.max(40, Math.round(size.height));
      set((state) => ({
        nodes: state.nodes.map((candidate) => candidate.id === nodeId
          ? {
              ...candidate,
              data: {
                ...(candidate.data ?? {}),
                matrixWidthOverride: desiredColumnWidth,
                matrixHeightOverride: desiredHeight,
              },
            }
          : candidate),
        saveStatus: "unsaved",
      }));
      requestNodeInternalsRefresh([nodeId]);
      get().scheduleMatrixReflow(nodeId);
      return;
    }
    const chartResize = resolveChartNodeResize(node.type, size);
    if (chartResize) {
      const { width, height } = chartResize.size;
      set((state) => ({
        nodes: state.nodes.map((candidate) => candidate.id === nodeId
          ? resetNodeDimensions({
              ...candidate,
              data: {
                ...(candidate.data ?? {}),
                ...chartResize.dataPatch,
              },
            }, width, height)
          : candidate),
        saveStatus: "unsaved",
      }));
      requestNodeInternalsRefresh([nodeId]);
      return;
    }
    const data = nodeData;
    let width = Math.max(60, Math.round(size.width));
    let height = Math.max(40, Math.round(size.height));
    const shapeType = String(data.shapeType ?? "");
    if (["circle", "diamond", "star", "flower"].includes(shapeType)) {
      const side = Math.max(width, height);
      width = side;
      height = side;
    }
    set((state) => ({
      nodes: state.nodes.map((candidate) => candidate.id === nodeId
        ? resetNodeDimensions({
            ...candidate,
            data: {
              ...(candidate.data ?? {}),
              autoSizeMode: "fixed" as AutoSizeMode,
              userSize: { width, height },
            },
          }, width, height)
        : candidate),
      saveStatus: "unsaved",
    }));
    requestNodeInternalsRefresh([nodeId]);
    get().scheduleListReflow(nodeId);
    get().scheduleMatrixReflow(nodeId);
    get().scheduleStructuredReflow(nodeId);
  },

  setNodeSize: (nodeId, size) => {
    if (!get().nodes.some((candidate) => candidate.id === nodeId)) return;
    get().pushHistory();
    get().finishManualNodeResize(nodeId, size);
  },

  fitNodeToStoredContent: (nodeId) => {
    const node = get().nodes.find((candidate) => candidate.id === nodeId);
    if (!node) return;
    get().pushHistory();
    const data = (node.data ?? {}) as Record<string, unknown>;
    const content = measuredOrEstimatedContent(data);
    const layoutMode = storedLayoutModeForNode(nodeId, get().nodes);
    let fitted: Node = {
      ...node,
      data: { ...(node.data ?? {}), autoSizeMode: "smart" as AutoSizeMode },
    };
    if (!layoutMode || layoutMode === "freeForm" || layoutMode === "fromParentFreeForm") {
      fitted = fitNodeAfterContentChange(fitted, content, "fit", "smart");
    }
    set((state) => ({
      nodes: state.nodes.map((candidate) => candidate.id === nodeId ? fitted : candidate),
      saveStatus: "unsaved",
    }));
    requestNodeInternalsRefresh([nodeId]);
    get().scheduleListReflow(nodeId);
    get().scheduleMatrixReflow(nodeId);
    get().scheduleStructuredReflow(nodeId);
  },

  fitNodeToContent: (nodeId, contentSize, reason = "input") => {
    let geometryChanged = false;
    let intrinsicChanged = false;
    let activeLayoutMode: LayoutMode | undefined;
    set((state) => {
      const node = state.nodes.find((n) => n.id === nodeId);
      if (!node) return {};

      const normalizedContent = normalizedContentMeasurement(contentSize);
      activeLayoutMode = storedLayoutModeForNode(nodeId, state.nodes);
      const passiveHydrationMeasurement = state.hasHydratedBoard
        && !state.hasUserChangedBoard
        && state.saveStatus === "saved"
        && (reason === "layout" || reason === "format" || reason === "blur");
      if (passiveHydrationMeasurement) {
        const data = (node.data ?? {}) as Record<string, unknown>;
        const matrixContent = activeLayoutMode === "matrix"
          ? matrixContentMeasurement(node, normalizedContent)
          : null;
        const previousIntrinsic = (activeLayoutMode === "matrix"
          ? data.matrixIntrinsicSize
          : data.intrinsicContentSize) as Partial<ContentSize> | undefined;
        if (
          !contentMeasurementChanged(previousIntrinsic, normalizedContent)
          && !(matrixContent && matrixMeasurementCellWidthChanged(previousIntrinsic, matrixContent))
        ) return {};
        return {
          nodes: state.nodes.map((candidate) => candidate.id === nodeId
            ? {
                ...candidate,
                data: {
                  ...(candidate.data ?? {}),
                  intrinsicContentSize: normalizedContent,
                  ...(matrixContent ? { matrixIntrinsicSize: matrixContent } : {}),
                },
              }
            : candidate),
        };
      }
      if (activeLayoutMode === "matrix") {
        const data = (node.data ?? {}) as Record<string, unknown>;
        const matrixContent = matrixContentMeasurement(node, normalizedContent);
        const previousIntrinsic = data.matrixIntrinsicSize as Partial<ContentSize> | undefined;
        intrinsicChanged = contentMeasurementChanged(previousIntrinsic, normalizedContent)
          || matrixMeasurementCellWidthChanged(previousIntrinsic, matrixContent);
        if (!intrinsicChanged) return {};
        return {
          nodes: state.nodes.map((candidate) => candidate.id === nodeId
            ? {
                ...candidate,
                data: {
                  ...(candidate.data ?? {}),
                  intrinsicContentSize: normalizedContent,
                  matrixIntrinsicSize: matrixContent,
                },
              }
            : candidate),
          saveStatus: "unsaved" as SaveStatus,
        };
      }

      const data = (node.data ?? {}) as Record<string, unknown>;
      const previousIntrinsic = data.intrinsicContentSize as Partial<ContentSize> | undefined;
      intrinsicChanged = contentMeasurementChanged(previousIntrinsic, normalizedContent);

      const override = data.layoutSizeOverride as Partial<{
        mode: LayoutMode;
        width: number;
        height: number;
      }> | undefined;
      if (override?.mode && supportsGeneratedLayoutSizing(override.mode)) {
        if (!intrinsicChanged) return {};
        return {
          nodes: state.nodes.map((candidate) => candidate.id === nodeId
            ? {
                ...candidate,
                data: { ...(candidate.data ?? {}), intrinsicContentSize: normalizedContent },
              }
            : candidate),
          saveStatus: "unsaved" as SaveStatus,
        };
      }

      const withMeasurement = {
        ...node,
        data: { ...(node.data ?? {}), intrinsicContentSize: normalizedContent },
      };
      let fitted = fitNodeAfterContentChange(withMeasurement, normalizedContent, reason);

      const prevStyle = (node.style ?? {}) as Record<string, unknown>;
      const nextStyle = (fitted.style ?? {}) as Record<string, unknown>;
      geometryChanged =
        node.position.x !== fitted.position.x ||
        node.position.y !== fitted.position.y ||
        prevStyle.width !== nextStyle.width ||
        prevStyle.height !== nextStyle.height;

      if (geometryChanged && resolveAutoSizeMode(data) === "height-only") {
        const nextSize = getNodeDimensions(fitted);
        fitted = {
          ...fitted,
          data: {
            ...(fitted.data ?? {}),
            userSize: nextSize,
          },
        };
      }

      if (!geometryChanged && !intrinsicChanged) return {};

      return {
        nodes: state.nodes.map((n) => (n.id === nodeId ? fitted : n)),
        saveStatus: "unsaved" as SaveStatus,
      };
    });
    if (geometryChanged) {
      requestNodeInternalsRefresh([nodeId]);
      get().scheduleListReflow(nodeId);
      get().scheduleMatrixReflow(nodeId);
      get().scheduleStructuredReflow(nodeId);
    } else if (intrinsicChanged) {
      if (activeLayoutMode === "matrix") get().scheduleMatrixReflow(nodeId);
      else if (activeLayoutMode === "list") get().scheduleListReflow(nodeId);
      else if (activeLayoutMode) get().scheduleStructuredReflow(nodeId);
    }
  },

  resizeNodeToFitBounds: (nodeId, bounds) => {
    set((state) => {
      const node = state.nodes.find((n) => n.id === nodeId);
      if (!node) return {};

      const hierarchy = buildHierarchy(state.nodes, state.edges);
      const layoutMode = findLayoutRoot(nodeId, state.nodes, hierarchy).mode;
      const freeformSizing = !layoutMode || layoutMode === "freeForm";
      if (layoutMode === "matrix") {
        const data = (node.data ?? {}) as Record<string, unknown>;
        const normalSize = storedNodeSize(data.userSize) ?? getMatrixBaseSize(node);
        const width = Math.max(normalSize.width, Math.ceil(bounds.width));
        const height = Math.max(normalSize.height, Math.ceil(bounds.height));
        if (width <= normalSize.width + 1 && height <= normalSize.height + 1) return {};
        return {
          nodes: state.nodes.map((candidate) => candidate.id === nodeId
            ? { ...candidate, data: { ...(candidate.data ?? {}), userSize: { width, height } } }
            : candidate),
          saveStatus: "unsaved" as SaveStatus,
        };
      }

      const current = styleSizeOf(node);
      const maxWidth = freeformSizing ? MAX_FREEFORM_AUTOFIT_NODE_WIDTH : MAX_AUTOFIT_NODE_WIDTH;
      const maxHeight = freeformSizing ? MAX_FREEFORM_AUTOFIT_NODE_HEIGHT : MAX_AUTOFIT_NODE_HEIGHT;
      let width = Math.max(current.w, Math.min(maxWidth, Math.ceil(bounds.width)));
      let height = Math.max(current.h, Math.min(maxHeight, Math.ceil(bounds.height)));
      const shapeType = ((node.data ?? {}) as Record<string, unknown>).shapeType as string | undefined;
      if (shapeType === "circle" || shapeType === "diamond" || shapeType === "star" || shapeType === "flower") {
        const currentSquareSize = Math.max(current.w, current.h);
        const size = Math.max(
          currentSquareSize,
          Math.min(Math.max(width, height), maxHeight, maxWidth)
        );
        width = size;
        height = size;
      }

      if (width <= current.w + 1 && height <= current.h + 1) return {};

      const nextSize = { width, height };
      const topLeft = resizeAroundAnchor(getNodeRect(node), nextSize, "top-left");
      const fitted = resetNodeDimensions({
        ...node,
        position: nodePositionFromTopLeft(node, topLeft, nextSize),
      }, width, height);

      return {
        nodes: state.nodes.map((n) => (n.id === nodeId ? fitted : n)),
        saveStatus: "unsaved" as SaveStatus,
      };
    });
    requestNodeInternalsRefresh([nodeId]);
    get().scheduleListReflow(nodeId);
    get().scheduleMatrixReflow(nodeId);
    get().scheduleStructuredReflow(nodeId);
  },

  convertNode: (nodeId, newType, extraData = {}) => {
    const { nodes } = get();
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    get().pushHistory();

    const newData = { ...node.data, ...extraData };
    if (newType === "shape" && !newData.shapeType) newData.shapeType = "rounded";
    if (newType === "mindmap" && !newData.color)   newData.color = "#818cf8";
    if (newType === "sticky"  && !newData.color)   newData.color = "yellow";

    const hierarchy = buildHierarchy(nodes, get().edges);
    const matrixMode = findLayoutRoot(nodeId, nodes, hierarchy).mode === "matrix";
    const matrixBase = matrixMode ? getMatrixBaseSize(node) : null;
    const current = matrixBase ?? getNodeDimensions(node);
    const shapeType = newType === "shape" ? (newData.shapeType as string) ?? "rounded" : "rectangle";
    const content = measuredOrEstimatedContent(newData as Record<string, unknown>);
    const fittedSize = fitShapeToContent(shapeType, content, {
      nodeType: newType,
      currentSize: current,
      growOnly: false,
      borderWidth: typeof newData.borderWidth === "number" ? newData.borderWidth : 2,
      minWidth: newType === "sticky" ? 180 : MIN_AUTO_NODE_WIDTH,
      minHeight: newType === "sticky" ? 90 : newType === "shape" ? 70 : MIN_AUTO_NODE_HEIGHT,
      maxContentWidth: newType === "text" ? MAX_AUTO_TEXT_WIDTH : MAX_AUTO_CARD_WIDTH,
      maxWidth: MAX_AUTOFIT_NODE_WIDTH,
      maxHeight: MAX_AUTOFIT_NODE_HEIGHT,
      cornerRadius: typeof newData.borderRadius === "number"
        ? newData.borderRadius
        : effectiveCornerRadius(newData.cornerRadiusPercent, current, 20),
      textPadding: newType === "shape" && typeof newData.textPadding === "number"
        ? newData.textPadding
        : undefined,
    });

    const convertedData = {
      ...newData,
      autoSizeMode: resolveAutoSizeMode(newData as Record<string, unknown>),
      userSize: fittedSize,
    };
    const oldRect = getNodeRect(node);
    const topLeft = resizeAroundAnchor(oldRect, fittedSize, "center");
    const convertedNode = resetNodeDimensions({
      ...node,
      type: newType,
      data: convertedData,
      position: matrixMode
        ? node.position
        : nodePositionFromTopLeft(node, topLeft, fittedSize),
    }, fittedSize.width, fittedSize.height);
    set({
      nodes: nodes.map((n) => n.id === nodeId
        ? matrixMode ? { ...convertedNode, style: n.style } : convertedNode
        : n),
      saveStatus: "unsaved",
    });
    requestNodeInternalsRefresh([nodeId]);
    get().scheduleListReflow(nodeId);
    get().scheduleMatrixReflow(nodeId);
    get().scheduleStructuredReflow(nodeId);
  },

  scheduleListReflow: (nodeId) => {
    pendingListReflowNodeIds.add(nodeId);
    if (listReflowTimer) clearTimeout(listReflowTimer);
    listReflowTimer = setTimeout(() => {
      listReflowTimer = null;
      const requestedNodeIds = [...pendingListReflowNodeIds];
      pendingListReflowNodeIds.clear();
      const state = get();
      const layoutNodes = state.nodes.filter((node) => !isAutoMatrixFrame(node) && !isAutoSunburstNode(node));
      const hierarchy = buildHierarchy(layoutNodes, state.edges);
      const byId = new Map(layoutNodes.map((node) => [node.id, node]));
      const rootIds = new Set<string>();

      for (const requestedNodeId of requestedNodeIds) {
        if (!byId.has(requestedNodeId)) continue;
        const root = findLayoutRoot(requestedNodeId, layoutNodes, hierarchy);
        if (root.mode === "list") rootIds.add(root.id);
      }
      if (!rootIds.size) return;

      let changed = false;
      let nextNodes = state.nodes;
      let nextEdges = state.edges;
      for (const rootId of rootIds) {
        const styled = applyLayoutPalette(
          nextNodes,
          nextEdges,
          hierarchy,
          rootId,
          "list",
          layoutSchemeValue(nextNodes, rootId)
        );
        nextNodes = styled.nodes;
        nextEdges = styled.edges;
        const sizedNodes = applyGeneratedLayoutPresentation(nextNodes, hierarchy, rootId, "list");
        if (sizedNodes.some((node, index) => node !== nextNodes[index])) changed = true;
        nextNodes = sizedNodes;
        const currentById = new Map(nextNodes
          .filter((node) => !isAutoMatrixFrame(node) && !isAutoSunburstNode(node))
          .map((node) => [node.id, node]));
        const placements = computeListLayout(rootId, hierarchy, currentById, {
          preserveManualOverrides: true,
        });
        nextNodes = nextNodes.map((node) => {
          const placement = placements[node.id];
          if (!placement) return node;
          if (
            Math.abs(node.position.x - placement.x) < 0.75
            && Math.abs(node.position.y - placement.y) < 0.75
          ) return node;
          changed = true;
          return { ...node, position: { x: placement.x, y: placement.y } };
        });
      }
      if (changed || rootIds.size) set({ nodes: nextNodes, edges: nextEdges, saveStatus: "unsaved" });
    }, 96);
  },

  scheduleMatrixReflow: (nodeId) => {
    pendingMatrixReflowNodeIds.add(nodeId);
    if (matrixReflowTimer) clearTimeout(matrixReflowTimer);
    matrixReflowTimer = setTimeout(() => {
      matrixReflowTimer = null;
      const requestedNodeIds = [...pendingMatrixReflowNodeIds];
      pendingMatrixReflowNodeIds.clear();
      const state = get();
      const layoutNodes = state.nodes.filter((node) =>
        !isAutoMatrixFrame(node)
        && !isAutoSunburstNode(node)
        && node.type !== "relationshipDiagram"
      );
      const hierarchy = buildHierarchy(layoutNodes, state.edges);
      const byId = new Map(layoutNodes.map((node) => [node.id, node]));
      const rootIds = new Set<string>();

      for (const requestedNodeId of requestedNodeIds) {
        const node = byId.get(requestedNodeId);
        if (!node) continue;
        const data = (node.data ?? {}) as Record<string, unknown>;
        const storedRootId = typeof data.matrixRootId === "string" ? data.matrixRootId : null;
        const root = storedRootId && byId.has(storedRootId)
          ? { id: storedRootId, mode: "matrix" as LayoutMode }
          : findLayoutRoot(requestedNodeId, layoutNodes, hierarchy);
        if (root.mode === "matrix") rootIds.add(root.id);
      }
      if (!rootIds.size) return;

      let nextNodes = state.nodes;
      let nextEdges = state.edges;
      let siblingSpacingChanged = false;
      for (const rootId of rootIds) {
        const previouslyOwnedNodeIds = new Set(nextNodes
          .filter((node) => {
            const data = (node.data ?? {}) as Record<string, unknown>;
            return node.id === rootId || data.matrixRootId === rootId;
          })
          .map((node) => node.id));
        const currentLayoutNodes = nextNodes.filter((node) =>
          !isAutoMatrixFrame(node)
          && !isAutoSunburstNode(node)
          && node.type !== "relationshipDiagram"
        );
        const currentHierarchy = buildHierarchy(currentLayoutNodes, nextEdges);
        const currentById = new Map(currentLayoutNodes.map((node) => [node.id, node]));
        if (!currentById.has(rootId)) continue;
        const result = computeMatrixLayout(rootId, currentHierarchy, currentById);
        const scopeIds = new Set(getSubtree(rootId, currentHierarchy));
        nextNodes = applyMatrixResultToNodes(nextNodes, result, currentHierarchy, scopeIds);
        const styled = applyLayoutPalette(
          nextNodes,
          nextEdges,
          currentHierarchy,
          rootId,
          "matrix",
          layoutSchemeValue(nextNodes, rootId)
        );
        nextNodes = styled.nodes;
        nextEdges = styled.edges;
        nextNodes = withMatrixFrame(nextNodes, scopeIds, matrixFrameKey(rootId), true);
        const packedNodes = packSiblingsAfterNestedMatrix(nextNodes, currentHierarchy, rootId);
        if (packedNodes !== nextNodes) siblingSpacingChanged = true;
        nextNodes = packedNodes;
        nextEdges = nextEdges.map((edge) => {
          const data = (edge.data ?? {}) as Record<string, unknown>;
          const ownedByRoot = data.hiddenInMatrixFor === rootId
            || (data.hiddenInMatrix === true
              && (previouslyOwnedNodeIds.has(edge.source) || previouslyOwnedNodeIds.has(edge.target)));
          const hiddenInMatrix = isMatrixHierarchyEdge(edge, currentHierarchy, scopeIds);
          if (!ownedByRoot && !hiddenInMatrix) return edge;

          const baseHidden = !!edge.hidden
            && data.hiddenInMatrix !== true
            && data.hiddenInSunburst !== true;
          const hidden = baseHidden || hiddenInMatrix || data.hiddenInSunburst === true;
          const hiddenInMatrixFor = hiddenInMatrix ? rootId : undefined;
          if (
            edge.hidden === hidden
            && data.hiddenInMatrix === hiddenInMatrix
            && data.hiddenInMatrixFor === hiddenInMatrixFor
          ) return edge;
          return {
            ...edge,
            hidden,
            data: {
              ...data,
              hiddenInMatrix,
              hiddenInMatrixFor,
            },
          };
        });
      }

      const geometryChanged = [...rootIds].some((rootId) => matrixGeometryChanged(state.nodes, nextNodes, rootId));
      const edgesChanged = nextEdges.some((edge, index) => edge !== state.edges[index]);
      if (geometryChanged || edgesChanged || siblingSpacingChanged) {
        set({ nodes: nextNodes, edges: nextEdges, saveStatus: "unsaved" });
      }
    }, 140);
  },

  scheduleStructuredReflow: (nodeId, forceAutomatic = false) => {
    pendingStructuredReflowNodeIds.add(nodeId);
    if (forceAutomatic) pendingForcedStructuredReflowNodeIds.add(nodeId);
    if (structuredReflowTimer) clearTimeout(structuredReflowTimer);
    structuredReflowTimer = setTimeout(() => {
      structuredReflowTimer = null;
      const requestedNodeIds = [...pendingStructuredReflowNodeIds];
      const forcedNodeIds = new Set(pendingForcedStructuredReflowNodeIds);
      pendingStructuredReflowNodeIds.clear();
      pendingForcedStructuredReflowNodeIds.clear();
      const state = get();
      const layoutNodes = state.nodes.filter((node) =>
        !isAutoMatrixFrame(node)
        && !isAutoSunburstNode(node)
        && node.type !== "relationshipDiagram"
      );
      const hierarchy = buildHierarchy(layoutNodes, state.edges);
      const byId = new Map(layoutNodes.map((node) => [node.id, node]));
      const roots = new Map<string, LayoutMode>();
      const forcedRootIds = new Set<string>();
      const supportedModes = new Set<LayoutMode>([
        "fromParentFreeForm",
        "horizontal",
        "vertical",
        "topDown",
        "linear",
      ]);
      for (const requestedNodeId of requestedNodeIds) {
        if (!byId.has(requestedNodeId)) continue;
        const root = findLayoutRoot(requestedNodeId, layoutNodes, hierarchy);
        if (root.mode && supportedModes.has(root.mode)) {
          roots.set(root.id, root.mode);
          if (forcedNodeIds.has(requestedNodeId)) forcedRootIds.add(root.id);
        }
      }
      if (!roots.size) return;

      let changed = false;
      let nodes = state.nodes;
      let nextEdges = state.edges;
      for (const [rootId, mode] of roots) {
        const forceRootLayout = forcedRootIds.has(rootId);
        const styled = applyLayoutPalette(
          nodes,
          nextEdges,
          hierarchy,
          rootId,
          mode,
          layoutSchemeValue(nodes, rootId)
        );
        nodes = styled.nodes;
        nextEdges = styled.edges;
        const sizedNodes = applyGeneratedLayoutPresentation(nodes, hierarchy, rootId, mode);
        if (sizedNodes.some((node, index) => node !== nodes[index])) changed = true;
        nodes = sizedNodes;
        const currentLayoutNodes = nodes.filter((node) =>
          !isAutoMatrixFrame(node)
          && !isAutoSunburstNode(node)
          && node.type !== "relationshipDiagram"
        );
        const placements = computeLayout(currentLayoutNodes, nextEdges, mode, { rootId });
        nodes = nodes.map((node) => {
          const placement = placements[node.id];
          if (!placement) return node;
          const nextNode = applyStructuredReflowPlacement(node, placement, forceRootLayout);
          if (nextNode !== node) changed = true;
          return nextNode;
        });
      }
      if (changed || roots.size) set({ nodes, edges: nextEdges, saveStatus: "unsaved" });
    }, 96);
  },

  markListManualOverride: (nodeIds, value) => {
    if (!nodeIds.length) return;
    const { nodes, edges } = get();
    const hierarchy = buildHierarchy(nodes, edges);
    const eligible = new Set(nodeIds.filter((nodeId) => {
      if (!value) return true;
      return findLayoutRoot(nodeId, nodes, hierarchy).mode === "list";
    }));
    if (!eligible.size) return;
    set({
      nodes: nodes.map((node) => {
        if (!eligible.has(node.id)) return node;
        const data = (node.data ?? {}) as Record<string, unknown>;
        if (value) return data.listManualOverride === true
          ? node
          : { ...node, data: { ...data, listManualOverride: true } };
        if (!("listManualOverride" in data)) return node;
        const { listManualOverride: _listManualOverride, ...rest } = data;
        void _listManualOverride;
        return { ...node, data: rest };
      }),
    });
  },

  markTreeManualOverride: (nodeIds, value) => {
    if (!nodeIds.length) return;
    const { nodes, edges } = get();
    const hierarchy = buildHierarchy(nodes, edges);
    const eligible = new Set(nodeIds.filter((nodeId) => {
      if (!value) return true;
      const mode = findLayoutRoot(nodeId, nodes, hierarchy).mode;
      return mode === "horizontal" || mode === "vertical" || mode === "topDown";
    }));
    if (!eligible.size) return;
    set({
      nodes: nodes.map((node) => {
        if (!eligible.has(node.id)) return node;
        const data = (node.data ?? {}) as Record<string, unknown>;
        if (value) return data.treeManualOverride === true
          ? node
          : { ...node, data: { ...data, treeManualOverride: true } };
        if (!("treeManualOverride" in data)) return node;
        const { treeManualOverride: _treeManualOverride, ...rest } = data;
        void _treeManualOverride;
        return { ...node, data: rest };
      }),
    });
  },

  applyLayout: (mode, rootIdOverride) => {
    const { nodes, edges, selectedNodeIds } = get();
    if (!nodes.length) return;
    cancelPendingLayoutReflows();

    const rawLayoutNodes = nodes.filter((n) =>
      !isAutoMatrixFrame(n) &&
      !isAutoSunburstNode(n) &&
      n.type !== "relationshipDiagram"
    );
    const selectedRootId = rootIdOverride ?? (selectedNodeIds.length === 1 ? selectedNodeIds[0] : undefined);
    const rootId = selectedRootId && rawLayoutNodes.some((n) => n.id === selectedRootId) ? selectedRootId : undefined;
    if (!rootId) return;
    const rawHierarchy = buildHierarchy(rawLayoutNodes, edges);
    const selectedScopeIds = new Set(getSubtree(rootId, rawHierarchy));
    const sourceLayoutMode = findLayoutRoot(rootId, rawLayoutNodes, rawHierarchy).mode;
    const convertingLayout = sourceLayoutMode !== mode;
    const visibleLayoutNodes = mode === "radial"
      ? rawLayoutNodes
      : rawLayoutNodes.map((node) => selectedScopeIds.has(node.id) ? restoreSunburstPresentation(node) : node);
    const restoredLayoutNodes = visibleLayoutNodes.map((node) => selectedScopeIds.has(node.id)
      ? restoreGeneratedLayoutPresentation(node)
      : node);
    const presentationRestoredNodes = mode === "matrix"
      ? restoredLayoutNodes
      : restoredLayoutNodes.map((node) => selectedScopeIds.has(node.id) ? restoreMatrixPresentation(node) : node);
    const layoutNodes = convertingLayout
      ? presentationRestoredNodes.map((node) => selectedScopeIds.has(node.id)
        ? { ...node, data: clearLayoutNodeGeometry((node.data ?? {}) as Record<string, unknown>) }
        : node)
      : presentationRestoredNodes;
    const sunburstEnabled = mode === "radial" && !!rootId;
    const sunburstKey = sunburstFrameKey(rootId);

    const hierarchy = buildHierarchy(layoutNodes, edges);
    const scopeIds = new Set(getSubtree(rootId, hierarchy));
    const layoutEdges = convertingLayout
      ? edges.map((edge) => scopeIds.has(edge.source) && scopeIds.has(edge.target)
        ? { ...edge, data: clearLayoutEdgeRouting((edge.data ?? {}) as Record<string, unknown>) }
        : edge)
      : edges;
    const paletteSeed = applyLayoutPalette(
      layoutNodes,
      layoutEdges,
      hierarchy,
      rootId,
      mode,
      layoutSchemeValue(layoutNodes, rootId)
    );
    const preparedLayoutNodes = applyGeneratedLayoutPresentation(
      paletteSeed.nodes,
      hierarchy,
      rootId,
      mode
    );
    const byId = new Map(preparedLayoutNodes.map((n) => [n.id, n]));
    const matrixResult = mode === "matrix"
      ? computeMatrixLayout(rootId, hierarchy, byId)
      : null;
    const positions = matrixResult?.placements
      ?? (sunburstEnabled ? {} : computeLayout(preparedLayoutNodes, layoutEdges, mode, { rootId }));

    get().pushHistory();

    // Reroute parent→child edges within scope, using post-layout geometry.
    const newEdges = layoutEdges.map((e) => {
      const originalData = (e.data ?? {}) as Record<string, unknown>;
      let edge = e;
      if (originalData.hiddenInSunburst && (!sunburstEnabled || originalData.hiddenInSunburstFor !== sunburstKey)) {
        const { hiddenInSunburst: _hiddenInSunburst, hiddenInSunburstFor: _hiddenInSunburstFor, ...restData } = originalData;
        void _hiddenInSunburst;
        void _hiddenInSunburstFor;
        edge = {
          ...e,
          hidden: e.hidden && !originalData.hiddenInSunburst && !originalData.hiddenInMatrix,
          data: restData,
        };
      }

      const touchesScope = scopeIds.has(e.source) || scopeIds.has(e.target);
      const insideScope = scopeIds.has(e.source) && scopeIds.has(e.target);
      if (!touchesScope) return edge;
      const edgeData = (edge.data ?? {}) as Record<string, unknown>;
      const baseHidden = !!edge.hidden && edgeData.hiddenInMatrix !== true && edgeData.hiddenInSunburst !== true;
      if (!insideScope) {
        return {
          ...edge,
          hidden: baseHidden,
          data: {
            ...edgeData,
            hiddenInMatrix: false,
            hiddenInMatrixFor: undefined,
            hiddenInSunburst: false,
            hiddenInSunburstFor: undefined,
            layoutMode: mode,
          },
        };
      }
      const parent = byId.get(edge.source);
      const child = byId.get(edge.target);
      if (!parent || !child) return edge;
      const pParent = positions[edge.source] ? { ...parent, position: positions[edge.source] } : parent;
      const pChild = positions[edge.target] ? { ...child, position: positions[edge.target] } : child;
      const route = routeForMode(mode, pParent, pChild);
      const hierarchyEdge = hierarchy.get(edge.target)?.parentId === edge.source;
      const hiddenInMatrix = mode === "matrix" && isMatrixHierarchyEdge(edge, hierarchy, scopeIds);
      const hiddenInSunburst = !!sunburstEnabled && hierarchyEdge;
      return {
        ...edge,
        ...(hierarchyEdge ? { type: "branch", reconnectable: true } : {}),
        hidden: baseHidden || hiddenInMatrix || hiddenInSunburst,
        sourceHandle: route.sourceHandle,
        targetHandle: route.targetHandle,
        markerEnd: edge.markerEnd ?? { type: MarkerType.ArrowClosed, color: "#6366f1" },
        data: {
          ...(edge.data ?? {}),
          edgeType: "branch",
          curveStyle: route.curveStyle,
          hiddenInMatrix,
          hiddenInMatrixFor: hiddenInMatrix ? rootId : undefined,
          hiddenInSunburst,
          hiddenInSunburstFor: hiddenInSunburst ? sunburstKey : undefined,
          layoutMode: mode,
        },
      };
    });

    const laidOutNodes = matrixResult
      ? applyMatrixResultToNodes(preparedLayoutNodes, matrixResult, hierarchy, scopeIds)
      : preparedLayoutNodes.map((node) => {
          if (!scopeIds.has(node.id)) return node;
          const placement = positions[node.id];
          const h = hierarchy.get(node.id);
          let data: Record<string, unknown> = {
            ...clearMatrixPresentationData((node.data ?? {}) as Record<string, unknown>),
            parentId: h?.parentId ?? null,
            childOrder: h?.childIds ?? [],
          };
          if (node.id === rootId) {
            data.layoutMode = mode;
          } else if (mode === "list" && data.layoutMode !== undefined) {
            const { layoutMode: _layoutMode, ...rest } = data;
            void _layoutMode;
            data = rest;
          }
          if (mode === "list" && data.listManualOverride !== undefined) {
            const { listManualOverride: _listManualOverride, ...rest } = data;
            void _listManualOverride;
            data = rest;
          }
          if (data.treeManualOverride !== undefined) {
            const { treeManualOverride: _treeManualOverride, ...rest } = data;
            void _treeManualOverride;
            data = rest;
          }
          const style = placement?.width || placement?.height
            ? { ...(node.style ?? {}), width: placement.width, height: placement.height }
            : node.style;
          return {
            ...node,
            ...(placement ? { position: { x: placement.x, y: placement.y } } : {}),
            style,
            data,
          };
        });
    const paletteResult = applyLayoutPalette(
      laidOutNodes,
      newEdges,
      hierarchy,
      rootId,
      mode,
      layoutSchemeValue(preparedLayoutNodes, rootId)
    );
    const existingMatrixFrames = nodes.filter(isAutoMatrixFrame);
    const frameKey = matrixFrameKey(rootId);
    const framedNodes = withMatrixFrame(
      [...paletteResult.nodes, ...existingMatrixFrames],
      scopeIds,
      frameKey,
      mode === "matrix"
    );
    const newNodes = withSunburstNode(
      framedNodes,
      hierarchy,
      scopeIds,
      sunburstKey,
      rootId,
      sunburstEnabled
    );

    const selectedNodes = mode === "matrix"
      ? newNodes.map((node) => ({ ...node, selected: node.id === rootId }))
      : newNodes;
    const spacedNodes = mode === "matrix"
      ? packSiblingsAfterNestedMatrix(selectedNodes, hierarchy, rootId)
      : selectedNodes;
    set({
      nodes: spacedNodes,
      edges: mode === "matrix"
        ? paletteResult.edges.map((edge) => edge.selected ? { ...edge, selected: false } : edge)
        : paletteResult.edges,
      ...(mode === "matrix" ? { selectedNodeIds: [rootId], selectedEdgeIds: [] } : {}),
      saveStatus: "unsaved",
    });
  },

  applyLayoutColorScheme: (rootId, scheme, resetOverrides = false) => {
    const { nodes, edges } = get();
    const hierarchyNodes = nodes.filter((node) =>
      !isAutoMatrixFrame(node)
      && !isAutoSunburstNode(node)
      && node.type !== "relationshipDiagram"
    );
    const root = hierarchyNodes.find((node) => node.id === rootId);
    if (!root) return;
    const mode = ((root.data ?? {}) as Record<string, unknown>).layoutMode as LayoutMode | undefined;
    if (!supportsAutomaticLayoutColors(mode)) return;

    const hierarchy = buildHierarchy(hierarchyNodes, edges);
    get().pushHistory();
    const styled = applyLayoutPalette(nodes, edges, hierarchy, rootId, mode, scheme, { resetOverrides });
    const scopeIds = new Set(getSubtree(rootId, hierarchy));
    const nextNodes = mode === "matrix"
      ? withMatrixFrame(styled.nodes, scopeIds, matrixFrameKey(rootId), true)
      : styled.nodes;
    set({ nodes: nextNodes, edges: styled.edges, saveStatus: "unsaved" });
  },

  updateBoardTitle: (title) =>
    set((state) => ({
      board: state.board ? { ...state.board, title } : null,
      saveStatus: "unsaved",
    })),

  performSearch: (query) => {
    const { nodes, edges } = get();
    if (!query.trim()) {
      set({ searchResults: [], searchQuery: query });
      return;
    }
    const q = query.toLowerCase();
    const results: string[] = [];
    for (const node of nodes) {
      const text = getNodeText(node.data as Record<string, unknown>);
      const tags = ((node.data as { tags?: string[] }).tags ?? []).join(" ");
      if (text.toLowerCase().includes(q) || tags.toLowerCase().includes(q)) {
        results.push(node.id);
      }
    }
    for (const edge of edges) {
      const label = String((edge.data as { label?: string })?.label ?? "");
      if (label.toLowerCase().includes(q)) {
        results.push(edge.id);
      }
    }
    set({ searchResults: results, searchQuery: query });
  },
}));
