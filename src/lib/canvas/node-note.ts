import type { Node } from "@xyflow/react";
import type { ScriptMode } from "../types";
import { getNodeRect, rectsOverlap } from "../layout";
import {
  normalizeTextCalloutAnchor,
  translateTextCalloutAnchor,
} from "./text-callout";

export const EXTERNAL_NOTE_SIZE = { width: 220, height: 72 };
const NOTE_GAP = 32;
const CLICK_NOTE_GAP = 12;
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

/**
 * Keep attached notes and their speech tips at the same visual offset when an
 * owning shape moves through dragging, keyboard movement, resizing, or layout.
 * A note that was explicitly moved in the same update retains that position.
 */
export function preserveAttachedExternalNoteOffsets(
  previousNodes: Node[],
  nextNodes: Node[]
): Node[] {
  const previousById = new Map(previousNodes.map((node) => [node.id, node]));
  const nextById = new Map(nextNodes.map((node) => [node.id, node]));
  let changed = false;

  const result = nextNodes.map((note) => {
    if (!isExternalNoteNode(note)) return note;
    const noteData = (note.data ?? {}) as Record<string, unknown>;
    const sourceId = typeof noteData.noteForNodeId === "string" ? noteData.noteForNodeId : null;
    if (!sourceId) return note;

    const previousNote = previousById.get(note.id);
    const previousSource = previousById.get(sourceId);
    const nextSource = nextById.get(sourceId);
    if (!previousNote || !previousSource || !nextSource) return note;

    const previousSourceRect = getNodeRect(previousSource);
    const nextSourceRect = getNodeRect(nextSource);
    const sourceDelta = {
      x: nextSourceRect.centerX - previousSourceRect.centerX,
      y: nextSourceRect.centerY - previousSourceRect.centerY,
    };
    if (Math.abs(sourceDelta.x) < 0.01 && Math.abs(sourceDelta.y) < 0.01) return note;

    const noteDelta = {
      x: note.position.x - previousNote.position.x,
      y: note.position.y - previousNote.position.y,
    };
    const noteWasExplicitlyMoved = Math.abs(noteDelta.x) > 0.5 || Math.abs(noteDelta.y) > 0.5;
    const position = noteWasExplicitlyMoved
      ? note.position
      : {
          x: note.position.x + sourceDelta.x,
          y: note.position.y + sourceDelta.y,
        };

    const previousData = (previousNote.data ?? {}) as Record<string, unknown>;
    const previousAnchor = normalizeTextCalloutAnchor(previousData.textCalloutAnchor);
    const nextAnchor = normalizeTextCalloutAnchor(noteData.textCalloutAnchor);
    const anchorWasUnchanged = !!previousAnchor
      && !!nextAnchor
      && Math.abs(previousAnchor.x - nextAnchor.x) < 0.01
      && Math.abs(previousAnchor.y - nextAnchor.y) < 0.01;
    const translatedAnchor = anchorWasUnchanged
      ? translateTextCalloutAnchor(nextAnchor, sourceDelta)
      : undefined;

    if (!translatedAnchor && position === note.position) return note;
    changed = true;
    return {
      ...note,
      position,
      ...(translatedAnchor
        ? { data: { ...noteData, textCalloutAnchor: translatedAnchor } }
        : {}),
    };
  });

  return changed ? result : nextNodes;
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
  scriptMode: ScriptMode,
  nearPoint?: { x: number; y: number },
  fontSize = 14
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
  const position = nearPoint
    ? { x: nearPoint.x + CLICK_NOTE_GAP, y: nearPoint.y + CLICK_NOTE_GAP }
    : candidates.find((candidate) => candidateIsFree(candidate, source.id, nodes))
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
      fontSize,
      textColor: "#475569",
      textAlign: "left",
    },
    selected: true,
    selectable: true,
    draggable: true,
  };
}
