import type { Node } from "@xyflow/react";
import type { ScriptMode } from "../types";
import { getNodeRect, rectsOverlap } from "../layout";

export const EXTERNAL_NOTE_SIZE = { width: 220, height: 72 };
const NOTE_GAP = 32;
const COLLISION_PADDING = 12;

export function isExternalNoteNode(node: Node | undefined): boolean {
  return (node?.data as { externalNote?: unknown } | undefined)?.externalNote === true;
}

/** Keep freely positioned notes at the same relative offset when their source moves. */
export function includeAttachedExternalNoteIds(nodes: Node[], movingIds: string[]): string[] {
  const included = new Set(movingIds);
  for (const node of nodes) {
    if (!isExternalNoteNode(node) || included.has(node.id)) continue;
    const data = (node.data ?? {}) as Record<string, unknown>;
    if (typeof data.noteForNodeId !== "string") continue;
    if (included.has(data.noteForNodeId)) included.add(node.id);
  }
  return Array.from(included);
}

function candidateIsFree(
  candidate: { x: number; y: number },
  sourceId: string,
  nodes: Node[]
): boolean {
  const rect = { id: "external-note-candidate", ...candidate, ...EXTERNAL_NOTE_SIZE };
  return nodes.every((node) => (
    node.id === sourceId
    || node.hidden
    || !rectsOverlap(rect, getNodeRect(node), COLLISION_PADDING)
  ));
}

/** Creates an unconnected, movable text note beside a canvas object. */
export function createExternalNoteNode(
  source: Node,
  nodes: Node[],
  id: string,
  scriptMode: ScriptMode
): Node {
  const sourceRect = getNodeRect(source);
  const candidates = [
    { x: sourceRect.right + NOTE_GAP, y: sourceRect.top },
    { x: sourceRect.left, y: sourceRect.bottom + NOTE_GAP },
    { x: sourceRect.left - EXTERNAL_NOTE_SIZE.width - NOTE_GAP, y: sourceRect.top },
    { x: sourceRect.left, y: sourceRect.top - EXTERNAL_NOTE_SIZE.height - NOTE_GAP },
    ...Array.from({ length: 8 }, (_, index) => ({
      x: sourceRect.right + NOTE_GAP,
      y: sourceRect.top + (index + 1) * (EXTERNAL_NOTE_SIZE.height + NOTE_GAP),
    })),
  ];
  const position = candidates.find((candidate) => candidateIsFree(candidate, source.id, nodes))
    ?? candidates[candidates.length - 1];

  return {
    id,
    type: "text",
    position: { x: Math.round(position.x), y: Math.round(position.y) },
    style: { width: EXTERNAL_NOTE_SIZE.width, height: EXTERNAL_NOTE_SIZE.height },
    data: {
      text: "Note",
      tags: [],
      scriptMode,
      noteForNodeId: source.id,
      externalNote: true,
      autoSizeMode: "fixed",
      fillColor: "transparent",
      fillOpacity: 0,
      borderWidth: 0,
      fontSize: 14,
      textColor: "#475569",
      textAlign: "left",
    },
    selected: true,
    selectable: true,
    draggable: true,
  };
}
