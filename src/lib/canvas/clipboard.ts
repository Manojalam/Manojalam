import type { Edge, Node } from "@xyflow/react";

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

export interface DuplicateContentOptions {
  clearContent?: boolean;
}

const DUPLICATED_CONTENT_FIELDS = [
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

const DUPLICATED_CONTENT_COLLECTIONS = [
  "examples",
  "tags",
  "collapsedSections",
] as const;

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
 * Clone a node's data for duplication while remapping its selected hierarchy.
 * Content is preserved unless the caller explicitly requests a blank copy.
 */
export function prepareDuplicatedNodeData(
  data: Record<string, unknown>,
  originalId: string,
  idMap: ReadonlyMap<string, string>,
  options: DuplicateContentOptions = {}
): Record<string, unknown> {
  const next = structuredClone(data);

  if (options.clearContent) {
    for (const field of DUPLICATED_CONTENT_FIELDS) {
      if (field in next) next[field] = "";
    }
    for (const field of DUPLICATED_CONTENT_COLLECTIONS) {
      if (Array.isArray(next[field])) next[field] = [];
    }
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
