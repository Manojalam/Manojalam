import type { Edge, Node } from "@xyflow/react";

export const MANOJALAM_NODES_MIME = "application/x-manojalam-nodes";
export const MANOJALAM_CLIPBOARD_VERSION = 1;

export interface ManojalamClipboardPayload {
  version: typeof MANOJALAM_CLIPBOARD_VERSION;
  nodes: Node[];
  edges: Edge[];
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
