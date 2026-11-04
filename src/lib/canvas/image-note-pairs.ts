import type { Node } from "@xyflow/react";
import { getNodeRect } from "../layout/geometry";

export function imageNotePairs(nodes: Node[]) {
  const byId = new Map(nodes.map(node => [node.id, node]));
  return nodes.flatMap(note => {
    if (typeof note.data.imageNotesFor !== "string") return [];
    const image = typeof note.data.noteForNodeId === "string" ? byId.get(note.data.noteForNodeId)
      : nodes.find(candidate => candidate.type === "image" && (candidate.data.image as { name?: string } | undefined)?.name === note.data.imageNotesFor && Math.abs(candidate.position.y - note.position.y) < 1 && candidate.position.x < note.position.x);
    return image ? [{ image, note, batch: String(image.data.imageNotesBatchId ?? `legacy:${Math.round(image.position.x)}`) }] : [];
  });
}

/** Close only completely removed rows, retaining custom offsets inside surviving pairs. */
export function closeDeletedImageNoteGaps(before: Node[], after: Node[], lockedLayerIds: Set<string> = new Set()): Node[] {
  const remaining = new Set(after.map(node => node.id));
  const batches = new Map<string, ReturnType<typeof imageNotePairs>>();
  for (const pair of imageNotePairs(before)) batches.set(pair.batch, [...(batches.get(pair.batch) ?? []), pair]);
  const shifts = new Map<string, number>();
  for (const pairs of batches.values()) {
    pairs.sort((a, b) => a.image.position.y - b.image.position.y);
    let shift = 0;
    pairs.forEach((pair, index) => {
      if (!remaining.has(pair.image.id) && !remaining.has(pair.note.id)) {
        const next = pairs[index + 1];
        if (next) shift += Math.max(0, next.image.position.y - pair.image.position.y);
      } else {
        // A locked or partial row is a barrier; do not move following rows through it.
        if (!remaining.has(pair.image.id) || !remaining.has(pair.note.id) || [pair.image, pair.note].some(node => node.data.locked || lockedLayerIds.has(String(node.data.layerId)))) { shift = 0; return; }
        if (shift) { shifts.set(pair.image.id, shift); shifts.set(pair.note.id, shift); }
      }
    });
  }
  return after.map(node => shifts.has(node.id) ? { ...node, position: { ...node.position, y: node.position.y - shifts.get(node.id)! } } : node);
}

/** Find the insertion slot in an image column, never in its separately editable notes. */
export function imageNoteInsertion(nodes: Node[], point: { x: number; y: number }) {
  const batches = new Map<string, ReturnType<typeof imageNotePairs>>();
  for (const pair of imageNotePairs(nodes.filter(node => !node.hidden))) {
    batches.set(pair.batch, [...(batches.get(pair.batch) ?? []), pair]);
  }
  for (const pairs of batches.values()) {
    pairs.sort((a, b) => a.image.position.y - b.image.position.y);
    const rects = pairs.map(pair => getNodeRect(pair.image));
    const left = Math.min(...rects.map(rect => rect.left));
    const right = Math.max(...rects.map(rect => rect.right));
    const bottom = Math.max(...pairs.flatMap(pair => [getNodeRect(pair.image).bottom, getNodeRect(pair.note).bottom]));
    if (point.x < left - 24 || point.x > right + 24 || point.y < rects[0].top - 48 || point.y > bottom + 96) continue;
    const index = pairs.findIndex(pair => point.y < getNodeRect(pair.image).top + getNodeRect(pair.image).height / 2);
    const reference = pairs[index < 0 ? pairs.length - 1 : index];
    const previous = index > 0 ? pairs[index - 1] : index < 0 ? pairs[pairs.length - 1] : undefined;
    const previousBottom = previous ? Math.max(getNodeRect(previous.image).bottom, getNodeRect(previous.note).bottom) + 48 : -Infinity;
    const y = index < 0 ? bottom + 48 : Math.max(reference.image.position.y, previousBottom);
    return { pairs, following: index < 0 ? [] : pairs.slice(index), reference, x: reference.image.position.x, y };
  }
  return null;
}
