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
  rectsOverlap,
  resetNodeDimensions,
  sizeOf,
  type LayoutPlacement,
} from "@/lib/layout";
import { buildHierarchy, getSubtree } from "@/lib/layout/hierarchy";
import { canonicalRelationshipType } from "@/lib/relationships";
import { normalizeRelationshipDiagramSpec } from "@/lib/relationship-diagram";
import type { LayoutMode } from "@/lib/types";

interface HistoryEntry {
  nodes: Node[];
  edges: Edge[];
  relationships: NodeRelationship[];
  relationshipFans: RelationshipFanState[];
}

type ContentSize = { width: number; height: number; lineCount?: number; lineHeight?: number };
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
  history: HistoryEntry[];
  historyIndex: number;
  clipboard: { nodes: Node[]; edges: Edge[] } | null;
  searchQuery: string;
  searchResults: string[];

  setBoard: (board: VidyaBoard) => void;
  setNodes: (nodes: Node[] | ((prev: Node[]) => Node[])) => void;
  setEdges: (edges: Edge[] | ((prev: Edge[]) => Edge[])) => void;
  setViewport: (viewport: Viewport) => void;
  setSettings: (settings: Partial<BoardSettings>) => void;
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
  paste: () => void;
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
  deleteEdges: (ids: string[]) => void;
  createChildNode: (parentId: string) => void;
  createChildNodes: (parentId: string, count: number, keepParentSelected?: boolean) => void;
  createSiblingNode: (nodeId: string) => void;
  moveSiblingNode: (nodeId: string, direction: -1 | 1) => void;
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void;
  fitNodeToContent: (nodeId: string, contentSize: ContentSize) => void;
  resizeNodeToFitBounds: (nodeId: string, bounds: { width: number; height: number }) => void;
  convertNode: (nodeId: string, newType: string, extraData?: Record<string, unknown>) => void;
  updateBoardTitle: (title: string) => void;
  performSearch: (query: string) => void;
  applyLayout: (mode: LayoutMode) => void;
}

function cloneState(
  nodes: Node[],
  edges: Edge[],
  relationships: NodeRelationship[],
  relationshipFans: RelationshipFanState[]
): HistoryEntry {
  return {
    nodes: structuredClone(nodes),
    edges: structuredClone(edges),
    relationships: structuredClone(relationships),
    relationshipFans: structuredClone(relationshipFans),
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
        node.type !== "relationshipDiagram"
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

function clearSunburstNodes(nodes: Node[]): Node[] {
  return nodes
    .filter((node) => !isAutoSunburstNode(node))
    .map((node) => {
      const data = (node.data ?? {}) as Record<string, unknown>;
      if (!data.sunburstHiddenFor) return node;
      const { sunburstHiddenFor: _sunburstHiddenFor, ...nextData } = data;
      void _sunburstHiddenFor;
      return { ...node, hidden: false, data: nextData };
    });
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

function withMatrixFrame(nodes: Node[], scopeIds: Set<string>, key: string, enabled: boolean): Node[] {
  const withoutCurrentFrame = nodes.filter((n) => {
    const frameKey = autoMatrixFrameKey(n);
    if (!frameKey) return true;
    return key !== BOARD_MATRIX_FRAME_KEY && frameKey !== key;
  });

  if (!enabled) return withoutCurrentFrame;

  const scopedNodes = withoutCurrentFrame.filter((n) => scopeIds.has(n.id));
  if (!scopedNodes.length) return withoutCurrentFrame;

  const rects = scopedNodes.map(getNodeRect);
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.width));
  const maxY = Math.max(...rects.map((r) => r.y + r.height));
  const pad = 3;
  const frame: Node = {
    id: `matrix-frame-${key}`,
    type: "frame",
    position: { x: minX - pad, y: minY - pad },
    data: {
      title: "",
      color: "#334155",
      background: "rgba(15, 23, 42, 0.015)",
      borderStyle: "solid",
      locked: true,
      matrixFrameFor: key,
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
  const chartSize = sunburstChartSize(rootId, hierarchy);
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
    position: { x: rootCenter.x - chartSize / 2, y: rootCenter.y - chartSize / 2 },
    data: {
      rootId,
      sunburstFor: key,
      chartSize,
      title,
      locked: true,
      tags: [],
    },
    style: { width: chartSize, height: chartSize },
    zIndex: 20,
    selectable: false,
    draggable: false,
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
    delete data.radialChartDiameter;
    delete data.radialRingWidth;
    if (n.type === "relationshipDiagram") {
      return {
        ...n,
        data: {
          ...data,
          relationshipDiagramSpec: normalizeRelationshipDiagramSpec(
            data.relationshipDiagramSpec ?? data.spec
          ),
        },
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
    "borderColor", "borderWidth", "borderStyle", "borderRadius",
    "fontFamily", "fontSize", "textColor", "scriptMode", "petalCount",
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
  "shapeType", "petalCount", "borderWidth", "borderRadius", "borderStyle",
]);
const MIN_AUTO_NODE_WIDTH = 160;
const MIN_AUTO_NODE_HEIGHT = 56;
const MAX_AUTO_TEXT_WIDTH = 520;
const MAX_AUTO_CARD_WIDTH = 560;
const AUTOFIT_TEXT_PADDING_X = 28;
const AUTOFIT_TEXT_PADDING_Y = 22;

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
    if (shapeType === "leaf") return { w: 160, h: 96 };
    if (["document", "database", "predefinedProcess", "delay", "cloud"].includes(shapeType ?? "")) {
      return { w: 170, h: 96 };
    }
    return { w: 140, h: 80 };
  }
  return { w: 180, h: 80 };
}

function styleSizeOf(node: Node): { w: number; h: number } {
  const fallback = defaultVisualSize(node);
  const style = node.style as Record<string, unknown> | undefined;
  return {
    w: numericDimension(style?.width, fallback.w),
    h: numericDimension(style?.height, fallback.h),
  };
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

function textPaddingFor(node: Node, data: Record<string, unknown>): { x: number; y: number } {
  const borderWidth = typeof data.borderWidth === "number" ? data.borderWidth : 2;
  if (node.type === "sticky") return { x: 58 + AUTOFIT_TEXT_PADDING_X + borderWidth * 2, y: 42 + AUTOFIT_TEXT_PADDING_Y + borderWidth * 2 };
  if (node.type === "text") return { x: 34 + AUTOFIT_TEXT_PADDING_X + borderWidth * 2, y: 30 + AUTOFIT_TEXT_PADDING_Y + borderWidth * 2 };
  if (node.type === "mindmap") return { x: 40 + AUTOFIT_TEXT_PADDING_X + borderWidth * 2, y: 34 + AUTOFIT_TEXT_PADDING_Y + borderWidth * 2 };
  return { x: 48 + AUTOFIT_TEXT_PADDING_X + borderWidth * 2, y: 42 + AUTOFIT_TEXT_PADDING_Y + borderWidth * 2 };
}

function shapeFitFactor(shapeType: string): { width: number; height: number } {
  switch (shapeType) {
    case "circle":
      return { width: 1.42, height: 1.42 };
    case "star":
      return { width: 1.62, height: 1.62 };
    case "flower":
      return { width: 1.72, height: 1.72 };
    case "diamond":
      return { width: 1.52, height: 1.52 };
    case "triangle":
      return { width: 1.36, height: 1.68 };
    case "hexagon":
      return { width: 1.2, height: 1.2 };
    case "arrow":
      return { width: 1.42, height: 1.28 };
    case "callout":
    case "offPageConnector":
      return { width: 1.26, height: 1.36 };
    case "parallelogram":
    case "trapezoid":
      return { width: 1.28, height: 1.18 };
    case "document":
    case "database":
    case "predefinedProcess":
    case "delay":
    case "cloud":
    case "leaf":
      return { width: 1.22, height: 1.24 };
    case "capsule":
      return { width: 1.1, height: 1.08 };
    default:
      return { width: 1, height: 1 };
  }
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

function contentFitSize(node: Node, measuredContent?: ContentSize): { width: number; height: number } | null {
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

  const baseFontSize = typeof data.fontSize === "number" ? data.fontSize : 14;
  const fontSize = clampValue(Math.max(baseFontSize, maxInlineFontSize(data) ?? 0), 10, 96);
  const charWidth = Math.max(6, fontSize * 0.58);
  const lineHeight = fontSize * 1.38;
  const text = lines.join(" ");
  const words = text.split(/\s+/).filter(Boolean);
  const longestWord = words.reduce((max, word) => Math.max(max, word.length), 0);

  const minWidth = node.type === "text" ? MIN_AUTO_NODE_WIDTH : node.type === "sticky" ? 180 : 140;
  const minHeight = node.type === "sticky" ? 90 : node.type === "shape" ? 70 : MIN_AUTO_NODE_HEIGHT;
  const maxWidth = node.type === "text" ? MAX_AUTO_TEXT_WIDTH : MAX_AUTO_CARD_WIDTH;
  const padding = textPaddingFor(node, data);
  const padX = padding.x;
  const padY = padding.y;
  const preferredChars = clampValue(
    Math.ceil(Math.max(longestWord + 3, Math.sqrt(Math.max(text.length, 1)) * 4.2)),
    18,
    64
  );
  const width = clampValue(Math.ceil(preferredChars * charWidth + padX), minWidth, maxWidth);
  const charsPerLine = Math.max(8, Math.floor((width - padX) / charWidth));
  const currentCharsPerLine = Math.max(8, Math.floor((currentWidth - padX) / charWidth));
  const measuredLineHeight = measuredContent?.lineHeight && Number.isFinite(measuredContent.lineHeight)
    ? measuredContent.lineHeight
    : lineHeight;
  const measuredLineCount = measuredContent?.lineCount && Number.isFinite(measuredContent.lineCount)
    ? measuredContent.lineCount
    : 0;
  const lineAwareCount = Math.max(
    wrappedLineCount(lines, charsPerLine),
    wrappedLineCount(lines, currentCharsPerLine),
    measuredLineCount
  );
  const height = Math.ceil(lineAwareCount * Math.max(lineHeight, measuredLineHeight) + padY);

  let targetWidth = Math.max(currentWidth, width);
  let targetHeight = Math.max(currentHeight, Math.max(minHeight, height));
  if (measuredContent) {
    const measuredWidth = Number.isFinite(measuredContent.width) ? measuredContent.width : 0;
    const measuredHeight = Number.isFinite(measuredContent.height) ? measuredContent.height : 0;
    if (measuredWidth > 0) {
      targetWidth = Math.max(targetWidth, Math.min(maxWidth, Math.ceil(measuredWidth + padX)));
    }
    if (measuredHeight > 0) {
      targetHeight = Math.max(targetHeight, Math.ceil(measuredHeight + padY));
    }
  }
  if (node.type === "shape" && shapeType) {
    const factor = shapeFitFactor(shapeType);
    targetWidth = Math.max(targetWidth, Math.ceil(width * factor.width));
    targetHeight = Math.max(targetHeight, Math.ceil(height * factor.height));
  }
  if (shapeType === "circle" || shapeType === "diamond" || shapeType === "star" || shapeType === "flower") {
    const size = Math.max(targetWidth, targetHeight);
    targetWidth = size;
    targetHeight = size;
  }

  if (targetWidth <= currentWidth && targetHeight <= currentHeight) return null;
  return { width: Math.ceil(targetWidth), height: Math.ceil(targetHeight) };
}

function nodeRectWithSize(node: Node, position = node.position) {
  const { w, h } = styleSizeOf(node);
  return { id: node.id, x: position.x, y: position.y, width: w, height: h };
}

function findFreeResizedPosition(node: Node, nodes: Node[]) {
  const obstacles = nodes
    .filter((candidate) => candidate.id !== node.id && candidate.type !== "frame" && !isAutoMatrixFrame(candidate))
    .map(getNodeRect);
  const padding = 32;
  const rectAt = (position: { x: number; y: number }) => nodeRectWithSize(node, position);
  const isFree = (position: { x: number; y: number }) =>
    obstacles.every((obstacle) => !rectsOverlap(rectAt(position), obstacle, padding));

  if (isFree(node.position)) return node.position;

  const { w, h } = styleSizeOf(node);
  const stepX = Math.max(w + padding * 2, 140);
  const stepY = Math.max(h + padding * 2, 120);
  const base = node.position;
  const candidates: Array<{ x: number; y: number }> = [
    { x: base.x + stepX, y: base.y },
    { x: base.x, y: base.y + stepY },
    { x: base.x + stepX, y: base.y + stepY },
    { x: base.x - stepX, y: base.y },
    { x: base.x, y: base.y - stepY },
    { x: base.x + stepX, y: base.y - stepY },
    { x: base.x - stepX, y: base.y + stepY },
  ];

  for (let ring = 2; ring <= 7; ring++) {
    candidates.push(
      { x: base.x + stepX * ring, y: base.y },
      { x: base.x, y: base.y + stepY * ring },
      { x: base.x + stepX * ring, y: base.y + stepY },
      { x: base.x - stepX * ring, y: base.y },
      { x: base.x, y: base.y - stepY * ring }
    );
  }

  return candidates.find(isFree) ?? node.position;
}

function patchNeedsContentFit(patch: Record<string, unknown>): boolean {
  // Rich-text edits are measured from the rendered ProseMirror DOM. Applying
  // the text-length heuristic first causes paste to resize twice with two
  // different measurements.
  if (Object.prototype.hasOwnProperty.call(patch, "richText")) return false;
  return Object.keys(patch).some((key) => AUTOFIT_FIELDS.has(key));
}

function normalizeSunburstChartSizes(
  nodes: Node[],
  hierarchy: ReturnType<typeof buildHierarchy>
): Node[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return nodes.map((node) => {
    const data = (node.data ?? {}) as Record<string, unknown>;
    if (node.type !== "sunburst" || typeof data.rootId !== "string" || !byId.has(data.rootId)) return node;
    const nextSize = sunburstChartSize(data.rootId, hierarchy);
    const current = styleSizeOf(node);
    const visualBounds = data.relationshipVisualBounds && typeof data.relationshipVisualBounds === "object"
      ? data.relationshipVisualBounds as Partial<{ minX: number; minY: number }>
      : null;
    const visualMinX = typeof visualBounds?.minX === "number" && Number.isFinite(visualBounds.minX)
      ? visualBounds.minX
      : 0;
    const visualMinY = typeof visualBounds?.minY === "number" && Number.isFinite(visualBounds.minY)
      ? visualBounds.minY
      : 0;
    const previousChartSize = typeof data.chartSize === "number" && Number.isFinite(data.chartSize)
      ? data.chartSize
      : visualBounds ? nextSize : current.w;
    const normalizedData: Record<string, unknown> = { ...data, chartSize: nextSize };
    delete normalizedData.relationshipVisualBounds;
    return resetNodeDimensions({
      ...node,
      position: {
        x: node.position.x - visualMinX - (nextSize - previousChartSize) / 2,
        y: node.position.y - visualMinY - (nextSize - previousChartSize) / 2,
      },
      data: normalizedData,
    }, nextSize, nextSize);
  });
}

function fitNodeAfterContentChange(node: Node, measuredContent?: ContentSize): Node {
  const fit = contentFitSize(node, measuredContent);
  if (!fit) return node;
  const current = styleSizeOf(node);
  const widthGrowth = Math.max(0, fit.width - current.w);
  const heightGrowth = Math.max(0, fit.height - current.h);
  return {
    ...node,
    style: { ...(node.style ?? {}), width: fit.width, height: fit.height },
    // Keep the visual center stable. Content growth should never search for a
    // different location or make the node jump across the canvas.
    position: {
      x: node.position.x - widthGrowth / 2,
      y: node.position.y - heightGrowth / 2,
    },
  };
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
  history: [],
  historyIndex: -1,
  clipboard: null,
  searchQuery: "",
  searchResults: [],

  setBoard: (board) => {
    const migrated = migrateNodes(board.content.nodes);
    // Infer + persist parentId from directed edges (for old boards).
    const hierarchy = buildHierarchy(migrated, board.content.edges);
    const parentedNodes = migrated.map((n) => {
      const h = hierarchy.get(n.id);
      const existing = (n.data as { parentId?: string | null }).parentId;
      return { ...n, data: { ...n.data, parentId: existing ?? h?.parentId ?? null } };
    });
    // Ensure every edge has explicit handles so multi-handle nodes render cleanly.
    const edges = assignDefaultHandles(parentedNodes, board.content.edges);
    const nodes = normalizeSunburstChartSizes(parentedNodes, buildHierarchy(parentedNodes, edges));
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
    const normalizedBoard: VidyaBoard = {
      ...board,
      content: {
        ...board.content,
        version: BOARD_CONTENT_VERSION,
        nodes: nodes as VidyaBoard["content"]["nodes"],
        edges,
        relationships,
        relationshipFans,
      },
    };
    set({
      board: normalizedBoard,
      nodes,
      edges,
      relationships,
      relationshipFans,
      viewport: board.content.viewport ?? { x: 0, y: 0, zoom: 1 },
      settings: board.content.settings ?? DEFAULT_BOARD_SETTINGS,
      saveStatus: relationshipMigrationRequired || structuralMigrationRequired ? "unsaved" : "saved",
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

  setViewport: (viewport) => set({ viewport, saveStatus: "unsaved" }),

  setSettings: (partial) =>
    set((state) => ({
      settings: { ...state.settings, ...partial },
      saveStatus: "unsaved",
    })),

  setSaveStatus: (status) => set({ saveStatus: status }),

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
          node.type !== "relationshipDiagram"
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
    const { nodes, edges, relationships, relationshipFans, history, historyIndex } = get();
    const entry = cloneState(nodes, edges, relationships, relationshipFans);
    const newHistory = history.slice(0, historyIndex + 1);
    if (!newHistory.length || !sameHistoryEntry(newHistory[newHistory.length - 1], entry)) {
      newHistory.push(entry);
    }
    if (newHistory.length > HISTORY_LIMIT) newHistory.shift();
    set({ history: newHistory, historyIndex: newHistory.length - 1 });
  },

  undo: () => {
    const { history, historyIndex, nodes, edges, relationships, relationshipFans } = get();
    if (historyIndex < 0) return;
    const current = cloneState(nodes, edges, relationships, relationshipFans);
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
      selectedNodeIds: restoredNodes.filter((node) => node.selected).map((node) => node.id),
      selectedEdgeIds: restoredEdges.filter((edge) => edge.selected).map((edge) => edge.id),
      history: nextHistory,
      historyIndex: targetIndex,
      saveStatus: "unsaved",
    });
  },

  redo: () => {
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

  paste: () => {
    const { clipboard, nodes, edges } = get();
    if (!clipboard) return;
    get().pushHistory();
    const idMap = new Map(clipboard.nodes.map((node) => [node.id, generateId()]));
    const preparedNodes = clipboard.nodes.map((n) => {
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
    const newEdges = clipboard.edges.map((e) => ({
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
    set({
      nodes: nodes.filter((n) => !selectedNodes.has(n.id)),
      edges: edges.filter(
        (e) => !selectedEdges.has(e.id) && !selectedNodes.has(e.source) && !selectedNodes.has(e.target)
      ),
      relationships: nextRelationships,
      relationshipFans: nextRelationshipFans,
      selectedNodeIds: [],
      selectedEdgeIds: [],
      saveStatus: "unsaved",
    });
  },

  deleteEdges: (ids) => {
    if (!ids.length) return;
    const { edges, selectedEdgeIds } = get();
    const removeIds = new Set(ids);
    if (!edges.some((edge) => removeIds.has(edge.id))) return;
    get().pushHistory();
    set({
      edges: edges.filter((edge) => !removeIds.has(edge.id)),
      selectedEdgeIds: selectedEdgeIds.filter((id) => !removeIds.has(id)),
      saveStatus: "unsaved",
    });
  },

  createChildNode: (parentId) => get().createChildNodes(parentId, 1),

  createChildNodes: (parentId, count, keepParentSelected = false) => {
    const { nodes, edges } = get();
    const parent = nodes.find((n) => n.id === parentId);
    if (!parent || ["relationshipDiagram", "sunburst", "frame"].includes(parent.type ?? "")) return;
    const safeCount = Math.max(1, Math.min(48, Math.round(count)));
    get().pushHistory();
    const currentHierarchy = buildHierarchy(nodes, edges);
    const currentLayoutRoot = findLayoutRoot(parentId, nodes, currentHierarchy);
    const childIds = Array.from({ length: safeCount }, () => generateId());
    const existingChildCount = currentHierarchy.get(parentId)?.childIds.length ?? 0;
    const parentData = parent.data as Record<string, unknown>;
    const childType = childTypeFor(parent.type);
    const mode = currentLayoutRoot.mode ?? (parentData.layoutMode as LayoutMode) ?? "horizontal";
    const hiddenInMatrix = mode === "matrix";
    const hiddenInSunburst = mode === "radial";
    const newNodes = childIds.map<Node>((childId, index) => ({
      id: childId,
      type: childType,
      position: {
        x: parent.position.x + 240,
        y: parent.position.y + (existingChildCount + index) * 90 - 40,
      },
      data: {
        ...inheritStyle(parentData),
        text: "New Idea",
        tags: [],
        parentId,
        ...(childType === "shape" && { shapeType: (parentData.shapeType as string) ?? "rounded" }),
      },
      style: parent.style ? { ...parent.style, height: undefined } : undefined,
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
          curveStyle: route.curveStyle,
          hiddenInMatrix,
          hiddenInSunburst,
          hiddenInSunburstFor: hiddenInSunburst ? sunburstFrameKey(currentLayoutRoot.id) : undefined,
          layoutMode: mode,
        },
      };
    });
    // Record child in the parent's sibling order.
    const storedOrder = parentData.childOrder as string[] | undefined;
    const prevOrder = storedOrder?.length
      ? storedOrder
      : currentHierarchy.get(parentId)?.childIds ?? [];
    const nextNodes = [
      ...nodes.map((n) =>
        n.id === parentId
          ? { ...n, data: { ...n.data, childOrder: [...prevOrder, ...childIds] } }
          : n
      ),
      ...newNodes,
    ];
    const nextEdges = [...edges, ...newEdges];
    const nextHierarchy = buildHierarchy(nextNodes, nextEdges);
    const layoutRoot = findLayoutRoot(parentId, nextNodes, nextHierarchy);
    const useSunburst = layoutRoot.mode === "radial";
    let placedNodes = nextNodes;
    if (layoutRoot.mode && !useSunburst) {
      placedNodes = applyPlacements(
        nextNodes,
        computeLayout(nextNodes, nextEdges, layoutRoot.mode, { rootId: layoutRoot.id })
      );
    } else if (!useSunburst) {
      for (const childId of childIds) {
        placedNodes = applyPlacements(placedNodes, resolveInsertedNodeCollisions(placedNodes, childId));
      }
    }
    const rootScope = new Set(getSubtree(layoutRoot.id, nextHierarchy));
    const matrixNodes = layoutRoot.mode === "matrix"
      ? withMatrixFrame(placedNodes, rootScope, matrixFrameKey(layoutRoot.id), true)
      : placedNodes;
    const finalNodes = useSunburst
      ? withSunburstNode(matrixNodes, nextHierarchy, rootScope, sunburstFrameKey(layoutRoot.id), layoutRoot.id, true)
      : matrixNodes;

    set({
      nodes: finalNodes,
      edges: nextEdges,
      selectedNodeIds: keepParentSelected ? [parentId] : [childIds[childIds.length - 1]],
      saveStatus: "unsaved",
    });
  },

  createSiblingNode: (nodeId) => {
    const { nodes, edges } = get();
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const currentHierarchy = buildHierarchy(nodes, edges);
    const parentId = currentHierarchy.get(nodeId)?.parentId;
    if (!parentId) return;
    const parentNode = nodes.find((candidate) => candidate.id === parentId);
    if (!parentNode) return;
    const layoutRoot = findLayoutRoot(nodeId, nodes, currentHierarchy);
    get().pushHistory();
    const siblingId = generateId();
    const nodeData = node.data as Record<string, unknown>;
    const sibType = childTypeFor(node.type);
    const parentData = (parentNode.data ?? {}) as Record<string, unknown>;
    const edgeMode = layoutRoot.mode ?? (parentData.layoutMode as LayoutMode | undefined) ?? "horizontal";
    const newNode: Node = {
      id: siblingId,
      type: sibType,
      position: { x: node.position.x, y: node.position.y + 110 },
      data: {
        ...inheritStyle(nodeData),
        text: "New Idea",
        tags: [],
        parentId,
        ...(sibType === "shape" && { shapeType: (nodeData.shapeType as string) ?? "rounded" }),
      },
      style: node.style ? { ...node.style, height: undefined } : undefined,
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
        curveStyle: route.curveStyle,
        hiddenInMatrix,
        hiddenInSunburst,
        hiddenInSunburstFor: hiddenInSunburst ? sunburstFrameKey(layoutRoot.id) : undefined,
        layoutMode: edgeMode,
      },
    });
    const siblingOrder = [...(currentHierarchy.get(parentId)?.childIds ?? [])];
    const insertionIndex = Math.max(0, siblingOrder.indexOf(nodeId) + 1);
    siblingOrder.splice(insertionIndex, 0, siblingId);
    const nextNodes = [
      ...nodes.map((candidate) => candidate.id === parentId
        ? { ...candidate, data: { ...(candidate.data ?? {}), childOrder: siblingOrder } }
        : candidate),
      newNode,
    ];
    const nextHierarchy = buildHierarchy(nextNodes, newEdges);
    const nextLayoutRoot = findLayoutRoot(parentId, nextNodes, nextHierarchy);
    const useSunburst = nextLayoutRoot.mode === "radial";
    const placements = nextLayoutRoot.mode && !useSunburst
      ? computeLayout(nextNodes, newEdges, nextLayoutRoot.mode, { rootId: nextLayoutRoot.id })
      : resolveInsertedNodeCollisions(nextNodes, siblingId);
    const placedNodes = applyPlacements(nextNodes, placements);
    const rootScope = new Set(getSubtree(nextLayoutRoot.id, nextHierarchy));
    const matrixNodes = nextLayoutRoot.mode === "matrix"
      ? withMatrixFrame(placedNodes, rootScope, matrixFrameKey(nextLayoutRoot.id), true)
      : placedNodes;
    const finalNodes = useSunburst
      ? withSunburstNode(matrixNodes, nextHierarchy, rootScope, sunburstFrameKey(nextLayoutRoot.id), nextLayoutRoot.id, true)
      : matrixNodes;

    set({
      nodes: finalNodes,
      edges: newEdges,
      selectedNodeIds: [siblingId],
      saveStatus: "unsaved",
    });
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
  },

  updateNodeData: (nodeId, data) => {
    set((state) => {
      const sourceNode = state.nodes.find((node) => node.id === nodeId);
      const updatedNode: Node | null = sourceNode
        ? { ...sourceNode, data: { ...sourceNode.data, ...data } }
        : null;
      let nodes = state.nodes.map((node) => node.id === nodeId && updatedNode ? updatedNode : node);

      if (updatedNode && patchNeedsContentFit(data)) {
        const fitted = fitNodeAfterContentChange(updatedNode);
        nodes = nodes.map((n) => (n.id === nodeId ? fitted : n));
      }

      return { nodes, saveStatus: "unsaved" };
    });
  },

  fitNodeToContent: (nodeId, contentSize) => {
    set((state) => {
      const node = state.nodes.find((n) => n.id === nodeId);
      if (!node) return {};

      const fitted = fitNodeAfterContentChange(node, contentSize);
      if (fitted === node) return {};

      const prevStyle = (node.style ?? {}) as Record<string, unknown>;
      const nextStyle = (fitted.style ?? {}) as Record<string, unknown>;
      const geometryChanged =
        node.position.x !== fitted.position.x ||
        node.position.y !== fitted.position.y ||
        prevStyle.width !== nextStyle.width ||
        prevStyle.height !== nextStyle.height;

      if (!geometryChanged) return {};

      return {
        nodes: state.nodes.map((n) => (n.id === nodeId ? fitted : n)),
        saveStatus: "unsaved" as SaveStatus,
      };
    });
  },

  resizeNodeToFitBounds: (nodeId, bounds) => {
    set((state) => {
      const node = state.nodes.find((n) => n.id === nodeId);
      if (!node) return {};

      const current = styleSizeOf(node);
      let width = Math.max(current.w, Math.ceil(bounds.width));
      let height = Math.max(current.h, Math.ceil(bounds.height));
      const shapeType = ((node.data ?? {}) as Record<string, unknown>).shapeType as string | undefined;
      if (shapeType === "circle" || shapeType === "diamond" || shapeType === "star" || shapeType === "flower") {
        const size = Math.max(width, height);
        width = size;
        height = size;
      }

      if (width <= current.w + 1 && height <= current.h + 1) return {};

      const resized = {
        ...node,
        style: { ...(node.style ?? {}), width, height },
      };
      const fitted = { ...resized, position: findFreeResizedPosition(resized, state.nodes) };

      return {
        nodes: state.nodes.map((n) => (n.id === nodeId ? fitted : n)),
        saveStatus: "unsaved" as SaveStatus,
      };
    });
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

    // Resize to fit text when switching to shapes that need more room
    const curW = (node.measured?.width  ?? (node.style?.width  as number) ?? 180) as number;
    const curH = (node.measured?.height ?? (node.style?.height as number) ?? 80)  as number;
    const shapeType = (newData.shapeType as string) ?? "";
    let newStyle = { ...node.style };
    if (shapeType === "diamond")  { newStyle = { ...newStyle, width: Math.max(curW * 1.5, 180), height: Math.max(curH * 1.5, 120) }; }
    if (shapeType === "circle" || shapeType === "flower")   { const s = Math.max(curW, curH, 120); newStyle = { ...newStyle, width: s, height: s }; }
    if (shapeType === "star")     { const s = Math.max(curW, curH, 120); newStyle = { ...newStyle, width: s, height: s }; }
    if (shapeType === "triangle") { newStyle = { ...newStyle, width: Math.max(curW * 1.3, 160), height: Math.max(curH * 1.3, 100) }; }
    // Ensure a minimum size for shapes
    if (newType === "shape" && !newStyle.height) newStyle = { ...newStyle, height: Math.max(curH, 80) };

    set({
      nodes: nodes.map((n) => n.id === nodeId ? { ...n, type: newType, data: newData, style: newStyle } : n),
      saveStatus: "unsaved",
    });
  },

  applyLayout: (mode) => {
    const { nodes, edges, selectedNodeIds } = get();
    if (!nodes.length) return;
    const layoutNodes = nodes.filter((n) =>
      !isAutoMatrixFrame(n) &&
      !isAutoSunburstNode(n) &&
      n.type !== "relationshipDiagram"
    );
    const selectedRootId = selectedNodeIds.length === 1 ? selectedNodeIds[0] : undefined;
    const rootId = selectedRootId && layoutNodes.some((n) => n.id === selectedRootId) ? selectedRootId : undefined;
    if (!rootId) return;
    const sunburstEnabled = mode === "radial" && !!rootId;
    const sunburstKey = sunburstFrameKey(rootId);

    const hierarchy = buildHierarchy(layoutNodes, edges);
    const positions = sunburstEnabled ? {} : computeLayout(layoutNodes, edges, mode, { rootId });

    // Nodes in scope: the selected subtree, or the whole board when nothing selected.
    const scopeIds = rootId
      ? new Set(getSubtree(rootId, hierarchy))
      : new Set(layoutNodes.map((n) => n.id));

    get().pushHistory();

    const byId = new Map(layoutNodes.map((n) => [n.id, n]));

    // Reroute parent→child edges within scope, using post-layout geometry.
    const newEdges = edges.map((e) => {
      const originalData = (e.data ?? {}) as Record<string, unknown>;
      let edge = e;
      if (originalData.hiddenInSunburst && (!sunburstEnabled || originalData.hiddenInSunburstFor !== sunburstKey)) {
        const { hiddenInSunburst: _hiddenInSunburst, hiddenInSunburstFor: _hiddenInSunburstFor, ...restData } = originalData;
        void _hiddenInSunburst;
        void _hiddenInSunburstFor;
        edge = {
          ...e,
          hidden: !!restData.hiddenInMatrix,
          data: restData,
        };
      }

      const touchesScope = scopeIds.has(e.source) || scopeIds.has(e.target);
      const insideScope = scopeIds.has(e.source) && scopeIds.has(e.target);
      if (!touchesScope) return edge;
      if (!insideScope) {
        const hiddenInMatrix = mode === "matrix";
        const hiddenInSunburst = false;
        return {
          ...edge,
          hidden: hiddenInMatrix || hiddenInSunburst,
          data: { ...(edge.data ?? {}), hiddenInMatrix, hiddenInSunburst, layoutMode: mode },
        };
      }
      const parent = byId.get(edge.source);
      const child = byId.get(edge.target);
      if (!parent || !child) return edge;
      const pParent = positions[edge.source] ? { ...parent, position: positions[edge.source] } : parent;
      const pChild = positions[edge.target] ? { ...child, position: positions[edge.target] } : child;
      const route = routeForMode(mode, pParent, pChild);
      const hiddenInMatrix = mode === "matrix";
      const hiddenInSunburst = !!sunburstEnabled && hierarchy.get(edge.target)?.parentId === edge.source;
      return {
        ...edge,
        hidden: hiddenInMatrix || hiddenInSunburst,
        sourceHandle: route.sourceHandle,
        targetHandle: route.targetHandle,
        markerEnd: edge.markerEnd ?? { type: MarkerType.ArrowClosed, color: "#6366f1" },
        data: {
          ...(edge.data ?? {}),
          edgeType: "branch",
          curveStyle: route.curveStyle,
          hiddenInMatrix,
          hiddenInSunburst,
          hiddenInSunburstFor: hiddenInSunburst ? sunburstKey : undefined,
          layoutMode: mode,
        },
      };
    });

    // Apply positions + persist hierarchy metadata for in-scope nodes.
    const laidOutNodes = layoutNodes.map((n) => {
      const inScope = scopeIds.has(n.id);
      const pos = positions[n.id];
      let data = n.data as Record<string, unknown>;
      if (inScope) {
        const h = hierarchy.get(n.id);
        data = { ...data, parentId: h?.parentId ?? null, childOrder: h?.childIds ?? [] };
        if (n.id === rootId) data.layoutMode = mode;
        if (mode === "matrix") {
          data.matrixCell = true;
          data.matrixCellRole = n.id === rootId ? "header" : h?.parentId === rootId ? "category" : "cell";
        } else if (data.matrixCell || data.matrixCellRole) {
          const { matrixCell: _matrixCell, matrixCellRole: _matrixCellRole, ...rest } = data;
          void _matrixCell;
          void _matrixCellRole;
          data = rest;
        }
      }
      const style = pos?.width || pos?.height
        ? { ...(n.style ?? {}), width: pos.width, height: pos.height }
        : n.style;
      return { ...n, ...(pos ? { position: { x: pos.x, y: pos.y } } : {}), style, data };
    });
    const existingMatrixFrames = nodes.filter(isAutoMatrixFrame);
    const frameKey = matrixFrameKey(rootId);
    const framedNodes = withMatrixFrame(
      [...laidOutNodes, ...existingMatrixFrames],
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

    set({ nodes: newNodes, edges: newEdges, saveStatus: "unsaved" });
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
