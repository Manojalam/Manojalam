import type { Node } from "@xyflow/react";
import type { ScriptMode } from "../types";
import {
  getNodeRect,
  nodePositionFromTopLeft,
  rectsOverlap,
  type NodeRect,
} from "../layout";
import { nodeShapeConnectionPoint } from "./shape-connection-geometry";

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

type AttachmentSide = "top" | "right" | "bottom" | "left";

function attachmentSide(source: NodeRect, note: NodeRect): AttachmentSide {
  const horizontalScore = Math.abs(note.centerX - source.centerX) / Math.max(1, source.width / 2);
  const verticalScore = Math.abs(note.centerY - source.centerY) / Math.max(1, source.height / 2);
  if (horizontalScore >= verticalScore) {
    return note.centerX < source.centerX ? "left" : "right";
  }
  return note.centerY < source.centerY ? "top" : "bottom";
}

/**
 * Resolve an attached callout tip from its owner every time it is rendered.
 * The tip is never an independent canvas anchor: moving the note chooses the
 * nearest owner side, while moving or resizing the owner updates the outline
 * point automatically.
 */
export function attachedExternalNoteCalloutAnchor(
  note: Node,
  source: Node | undefined
): { x: number; y: number } | null {
  if (!isExternalNoteNode(note) || !source) return null;
  const sourceId = ((note.data ?? {}) as Record<string, unknown>).noteForNodeId;
  if (sourceId !== source.id) return null;

  const sourceRect = getNodeRect(source);
  const noteRect = getNodeRect(note);
  return nodeShapeConnectionPoint(
    source,
    sourceRect,
    attachmentSide(sourceRect, noteRect)
  );
}

/**
 * Keep attached notes at the same parent-relative offset when their owner
 * moves. Owner size changes never reposition the note body, avoiding the
 * repeated jumps caused by layout measurement and Matrix/List reflow.
 * A note explicitly moved in the same update retains that authored position.
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
      x: nextSourceRect.left - previousSourceRect.left,
      y: nextSourceRect.top - previousSourceRect.top,
    };
    const sourceMoved = Math.abs(sourceDelta.x) >= 0.01 || Math.abs(sourceDelta.y) >= 0.01;
    if (!sourceMoved) return note;

    const previousNoteRect = getNodeRect(previousNote);
    const nextNoteRect = getNodeRect(note);
    const noteDelta = {
      x: nextNoteRect.left - previousNoteRect.left,
      y: nextNoteRect.top - previousNoteRect.top,
    };
    const noteWasExplicitlyMoved = Math.abs(noteDelta.x) > 0.5 || Math.abs(noteDelta.y) > 0.5;
    if (noteWasExplicitlyMoved) return note;

    const position = nodePositionFromTopLeft(note, {
      x: previousNoteRect.left + sourceDelta.x,
      y: previousNoteRect.top + sourceDelta.y,
    }, {
      width: nextNoteRect.width,
      height: nextNoteRect.height,
    });
    if (
      Math.abs(position.x - note.position.x) < 0.01
      && Math.abs(position.y - note.position.y) < 0.01
    ) return note;
    changed = true;
    return {
      ...note,
      position,
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
