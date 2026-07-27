import type { Edge, Node } from "@xyflow/react";
import { buildHierarchy, getSubtree } from "../layout/hierarchy";

export const MANOJALAM_NODES_MIME = "application/x-manojalam-nodes";
export const MANOJALAM_CLIPBOARD_VERSION = 1;

export interface ManojalamClipboardPayload {
  version: typeof MANOJALAM_CLIPBOARD_VERSION;
  nodes: Node[];
  edges: Edge[];
}

export interface BoardSelectionIds {
  nodeIds: string[];
  edgeIds: string[];
}

export interface CanvasObjectSelection {
  nodes: Node[];
  edges: Edge[];
}

const NODE_CONTENT_FIELDS = [
  "text",
  "richText",
  "label",
  "title",
  "topic",
  "devanagari",
  "iast",
  "translation",
  "rule",
  "source",
  "sourceText",
  "padaccheda",
  "anvaya",
  "padartha",
  "chandas",
  "grammarNotes",
  "exceptions",
  "notes",
] as const;

const NODE_CONTENT_COLLECTIONS = [
  "examples",
  "tags",
] as const;

export interface ClearNodeContentsResult {
  nodes: Node[];
  clearedNodeIds: string[];
}

const TEXT_EDITING_SELECTOR = [
  "input",
  "textarea",
  "[contenteditable='true']",
  "[contenteditable='']",
  "[data-rich-text-editor='true']",
].join(", ");

type ClosestTarget = EventTarget & { closest?: (selector: string) => Element | null };

/** Return true for both native fields and any descendant of the TipTap editor. */
export function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as ClosestTarget).closest !== "function") return false;
  return Boolean((target as ClosestTarget).closest?.(TEXT_EDITING_SELECTOR));
}

export function shouldHandleCanvasClipboard(
  eventTarget: EventTarget | null,
  activeElement: EventTarget | null
): boolean {
  return !isTextEditingTarget(eventTarget) && !isTextEditingTarget(activeElement);
}

/** Return the visible board objects addressed by the canvas select-all shortcut. */
export function visibleBoardSelection(nodes: readonly Node[], edges: readonly Edge[]): BoardSelectionIds {
  return {
    nodeIds: nodes.filter((node) => !node.hidden).map((node) => node.id),
    edgeIds: edges.filter((edge) => !edge.hidden).map((edge) => edge.id),
  };
}

/**
 * Expand selected hierarchy parents to their complete descendant branches.
 * Connections are copied only when both endpoints belong to the copied branch,
 * so the duplicate never remains attached to an object outside the selection.
 */
export function selectionWithHierarchyDescendants(
  nodes: Node[],
  edges: Edge[],
  selectedNodeIds: readonly string[]
): CanvasObjectSelection {
  const existingNodeIds = new Set(nodes.map((node) => node.id));
  const copiedNodeIds = new Set(
    selectedNodeIds.filter((nodeId) => existingNodeIds.has(nodeId))
  );
  if (!copiedNodeIds.size) return { nodes: [], edges: [] };

  const hierarchy = buildHierarchy(nodes, edges);
  for (const selectedNodeId of [...copiedNodeIds]) {
    for (const descendantId of getSubtree(selectedNodeId, hierarchy)) {
      copiedNodeIds.add(descendantId);
    }
  }

  return {
    nodes: nodes.filter((node) => copiedNodeIds.has(node.id)),
    edges: edges.filter(
      (edge) => copiedNodeIds.has(edge.source) && copiedNodeIds.has(edge.target)
    ),
  };
}

export function createManojalamClipboardPayload(
  nodes: Node[],
  edges: Edge[]
): ManojalamClipboardPayload {
  return {
    version: MANOJALAM_CLIPBOARD_VERSION,
    nodes: structuredClone(nodes),
    edges: structuredClone(edges),
  };
}

/**
 * Clone a node's complete data for duplication while remapping its selected hierarchy.
 */
export function prepareDuplicatedNodeData(
  data: Record<string, unknown>,
  originalId: string,
  idMap: ReadonlyMap<string, string>
): Record<string, unknown> {
  const next = structuredClone(data);

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
  for (const field of [
    "matrixRootId",
    "matrixFrameFor",
    "rootId",
    "sunburstFor",
    "sunburstHiddenFor",
  ]) {
    const referencedId = next[field];
    if (typeof referencedId !== "string") continue;
    const duplicatedId = idMap.get(referencedId);
    if (duplicatedId) next[field] = duplicatedId;
    else if (referencedId !== "__board__") delete next[field];
  }
  if (originalId === parentId || mappedChildOrder.length === 0) delete next.layoutMode;

  return next;
}

export function hasNodeContent(data: Record<string, unknown>): boolean {
  return NODE_CONTENT_FIELDS.some((field) =>
    typeof data[field] === "string" && data[field].length > 0
  ) || NODE_CONTENT_COLLECTIONS.some((field) =>
    Array.isArray(data[field]) && data[field].length > 0
  );
}

/** Clear authored content while retaining every style, geometry, and hierarchy field. */
export function clearNodeContent(data: Record<string, unknown>): Record<string, unknown> {
  const next = structuredClone(data);
  for (const field of NODE_CONTENT_FIELDS) {
    if (field in next) next[field] = "";
  }
  for (const field of NODE_CONTENT_COLLECTIONS) {
    if (Array.isArray(next[field])) next[field] = [];
  }
  return next;
}

/** Clear content from every selected content-bearing node in one immutable update. */
export function clearSelectedNodeContents(
  nodes: readonly Node[],
  selectedNodeIds: ReadonlySet<string>
): ClearNodeContentsResult {
  const clearedNodeIds: string[] = [];
  const nextNodes = nodes.map((node) => {
    if (!selectedNodeIds.has(node.id)) return node;
    const data = (node.data ?? {}) as Record<string, unknown>;
    if (!hasNodeContent(data)) return node;
    clearedNodeIds.push(node.id);
    return { ...node, data: clearNodeContent(data) };
  });
  return { nodes: nextNodes, clearedNodeIds };
}

export function serializeManojalamClipboard(payload: ManojalamClipboardPayload): string {
  return JSON.stringify(payload);
}

export function parseManojalamClipboard(value: string): ManojalamClipboardPayload | null {
  if (!value.trim()) return null;
  try {
    const parsed = JSON.parse(value) as Partial<ManojalamClipboardPayload>;
    if (
      parsed.version !== MANOJALAM_CLIPBOARD_VERSION
      || !Array.isArray(parsed.nodes)
      || !Array.isArray(parsed.edges)
      || parsed.nodes.some((node) => !node || typeof node.id !== "string" || !node.position)
      || parsed.edges.some((edge) => !edge || typeof edge.id !== "string")
    ) return null;
    return parsed as ManojalamClipboardPayload;
  } catch {
    return null;
  }
}
