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

/** A row owns one image and any number of independently editable note columns. */
export function imageNoteRows(nodes: Node[]) {
  const rows = new Map<string, { image: Node; notes: Node[]; batch: string }>();
  for (const { image, note, batch } of imageNotePairs(nodes)) {
    const row = rows.get(image.id) ?? { image, notes: [], batch };
    row.notes.push(note); rows.set(image.id, row);
  }
  return [...rows.values()].map(row => ({ ...row, note: row.notes[0] }));
}

type ImageNoteRow = ReturnType<typeof imageNoteRows>[number];
const members = (row: ImageNoteRow) => [row.image, ...row.notes];
const top = (row: ImageNoteRow) => Math.min(...members(row).map(node => getNodeRect(node).top));
const bottom = (row: ImageNoteRow) => Math.max(...members(row).map(node => getNodeRect(node).bottom));
function batches(nodes: Node[]) {
  const result = new Map<string, ImageNoteRow[]>();
  for (const row of imageNoteRows(nodes)) result.set(row.batch, [...(result.get(row.batch) ?? []), row]);
  for (const rows of result.values()) rows.sort((a,b) => a.image.position.y - b.image.position.y);
  return result;
}

/** Resizing/content growth changes row height, never the image's size or the user's note offsets. */
export function reflowImageNoteRows(before: Node[], after: Node[], lockedLayerIds: Set<string> = new Set()): Node[] {
  const oldRows = new Map(imageNoteRows(before).map(row => [row.image.id, row]));
  const shifts = new Map<string, { x: number; y: number }>();
  for (const rows of batches(after).values()) {
    let active = false, previous: ImageNoteRow | undefined, previousShift = 0;
    for (const row of rows) {
      const old = oldRows.get(row.image.id);
      const resized = !!old && members(row).some(node => {
        const prior = members(old).find(item => item.id === node.id);
        return !prior || Math.abs(getNodeRect(prior).height-getNodeRect(node).height) > .5 || Math.abs(getNodeRect(prior).width-getNodeRect(node).width) > .5;
      });
      const locked = members(row).some(node => node.data.locked || lockedLayerIds.has(String(node.data.layerId)));
      let shift = 0;
      if (active && previous && old && !locked) {
        const oldPrevious = oldRows.get(previous.image.id);
        const gap = oldPrevious ? Math.max(48, top(old)-bottom(oldPrevious)) : 48;
        shift = bottom(previous) + previousShift + gap - top(row);
        if (Math.abs(shift) > .5) for (const node of members(row)) shifts.set(node.id,{ x: 0, y: shift });
      }
      // Keep horizontal note columns apart after a width change, retaining custom gaps.
      const widthChanged = !!old && members(row).some(node => {
        const prior = members(old).find(item => item.id === node.id);
        return !prior || Math.abs(getNodeRect(prior).width-getNodeRect(node).width) > .5;
      });
      if (widthChanged && old && !locked) {
        const columns = [...row.notes].sort((a,b) => a.position.x-b.position.x);
        let right = getNodeRect(row.image).right, oldRight = getNodeRect(old.image).right;
        for (const note of columns) {
          const prior = old.notes.find(node => node.id === note.id);
          const gap = prior ? Math.max(32,getNodeRect(prior).left-oldRight) : 32;
          const xShift = Math.max(0,right + gap-getNodeRect(note).left);
          if (xShift > .5) shifts.set(note.id,{x:xShift,y:shift});
          right = getNodeRect(note).right+xShift;
          oldRight = prior ? getNodeRect(prior).right : right;
        }
      }
      active = locked ? false : active || resized;
      previous = row; previousShift = shift;
    }
  }
  if (!shifts.size) return after;
  return after.map(node => {
    const shift = shifts.get(node.id);
    return shift ? {...node,position:{x:node.position.x+shift.x,y:node.position.y+shift.y}} : node;
  });
}

/** Close only completely removed rows, retaining custom offsets inside surviving rows. */
export function closeDeletedImageNoteGaps(before: Node[], after: Node[], lockedLayerIds: Set<string> = new Set()): Node[] {
  const remaining = new Set(after.map(node => node.id)), shifts = new Map<string,number>();
  for (const rows of batches(before).values()) {
    let shift = 0;
    rows.forEach((row,index) => {
      if (members(row).every(node => !remaining.has(node.id))) {
        const next = rows[index+1];
        if (next) shift += Math.max(0,next.image.position.y-row.image.position.y);
      } else {
        if (members(row).some(node => !remaining.has(node.id) || node.data.locked || lockedLayerIds.has(String(node.data.layerId)))) {shift=0;return;}
        if (shift) for(const node of members(row)) shifts.set(node.id,shift);
      }
    });
  }
  return after.map(node => shifts.has(node.id) ? {...node,position:{...node.position,y:node.position.y-shifts.get(node.id)!}} : node);
}

/** Find the insertion slot in an image column, never in its separately editable notes. */
export function imageNoteInsertion(nodes: Node[], point: { x: number; y: number }) {
  for (const rows of batches(nodes.filter(node => !node.hidden)).values()) {
    const rects = rows.map(row => getNodeRect(row.image));
    const left = Math.min(...rects.map(rect => rect.left)), right = Math.max(...rects.map(rect => rect.right));
    const lastBottom = Math.max(...rows.map(bottom));
    if (point.x < left-24 || point.x > right+24 || point.y < rects[0].top-48 || point.y > lastBottom+96) continue;
    const index = rows.findIndex(row => point.y < getNodeRect(row.image).top+getNodeRect(row.image).height/2);
    const reference = rows[index < 0 ? rows.length-1 : index];
    const previous = index > 0 ? rows[index-1] : index < 0 ? rows[rows.length-1] : undefined;
    const y = index < 0 ? lastBottom+48 : Math.max(reference.image.position.y,previous ? bottom(previous)+48 : -Infinity);
    return { pairs:rows,following:index < 0 ? [] : rows.slice(index),reference,x:reference.image.position.x,y };
  }
  return null;
}
