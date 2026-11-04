"use client";

import type { Node } from "@xyflow/react";
import { imageNoteInsertion } from "./image-note-pairs";
import { getNodeRect } from "@/lib/layout";
import { toast } from "sonner";
import { useCanvasStore } from "@/store/canvas-store";
import { useUIStore } from "@/store/ui-store";
import { createMediaAttachment, normalizeMediaAttachments, MAX_MEDIA_ATTACHMENTS, mediaFileMimeType } from "./node-media";

let insertionCursor: { boardId: string; position: { x: number; y: number } } | undefined;

export function rememberImageInsertionPoint(boardId: string, position: { x: number; y: number }) {
  insertionCursor = { boardId, position };
}

/** File picker and clipboard share validation, placement, history and persistence. */
export async function addBoardImages(files: File[], targetNodeId?: string, layout?: "vertical-notes", cursor?: { x: number; y: number }) {
  const initial = useCanvasStore.getState();
  if (!files.length || !initial.board || initial.board.accessRole === "viewer" || useUIStore.getState().presentationMode) return;
  if (layout === "vertical-notes") {
    files = files.filter(file => /^image\/(png|jpeg|webp|gif)$/.test(mediaFileMimeType(file)))
      .sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name, undefined, { numeric: true, sensitivity: "base" }));
    if (!files.length) { toast.error("No supported images in this folder", { description: "Choose a folder containing PNG, JPG, WebP or GIF images." }); return; }
  }
  const boardId = initial.board.id;
  const canvas = document.querySelector(".react-flow")?.getBoundingClientRect();
  const viewport = initial.viewport;
  const requestedPosition = cursor ?? (insertionCursor?.boardId === boardId ? insertionCursor.position : undefined);
  const position = requestedPosition ?? { x: ((canvas?.width ?? innerWidth) / 2 - viewport.x) / viewport.zoom, y: ((canvas?.height ?? innerHeight) / 2 - viewport.y) / viewport.zoom };
  try {
    const attachmentTarget = () => {
      const state = useCanvasStore.getState();
      const target = state.nodes.find(node => node.id === targetNodeId);
      if (!target) throw new Error("The selected element no longer exists.");
      if (target.data.locked || state.layers.some(layer => layer.id === target.data.layerId && layer.locked)) {
        throw new Error("Unlock the selected element before attaching an image.");
      }
      const attachments = normalizeMediaAttachments(target.data.mediaAttachments);
      if (attachments.length + files.length > MAX_MEDIA_ATTACHMENTS) {
        throw new Error(`An element can have up to ${MAX_MEDIA_ATTACHMENTS} attachments.`);
      }
      return attachments;
    };
    if (targetNodeId) attachmentTarget();
    const images = [];
    let skipped = 0;
    for (const file of files) {
      try { images.push(await createMediaAttachment(file, "image")); }
      catch (error) { if (!layout) throw error; skipped++; }
    }
    if (!images.length) throw new Error("None of the images could be read. Check their format and file size.");
    const state = useCanvasStore.getState();
    if (state.board?.id !== boardId || state.board?.accessRole === "viewer" || useUIStore.getState().presentationMode) return;
    if (targetNodeId) {
      const attachments = attachmentTarget();
      state.pushHistory();
      state.updateNodeData(targetNodeId, { mediaAttachments: [...attachments, ...images] });
      toast.success(images.length === 1 ? "Image attached to selected element" : "Images attached to selected element");
      return;
    }
    const insertion = requestedPosition ? imageNoteInsertion(state.nodes, requestedPosition) : null;
    if (insertion?.following.some(pair => [pair.image, pair.note].some(node => node.data.locked || state.layers.some(layer => layer.id === node.data.layerId && layer.locked)))) {
      throw new Error("Unlock the following image and note rows before inserting here.");
    }
    let added: Node[];
    let shifted = state.nodes;
    if (layout === "vertical-notes" || insertion) {
      const existing = state.nodes.filter(node => !node.hidden).map(getNodeRect);
      const x = insertion?.x ?? requestedPosition?.x ?? (existing.length ? Math.max(...existing.map(rect => rect.right)) + 80 : position.x - 520);
      let y = insertion?.y ?? requestedPosition?.y ?? (existing.length ? Math.min(...existing.map(rect => rect.top)) : position.y - 160);
      const imageNotesBatchId = insertion?.reference.batch ?? crypto.randomUUID();
      const imageColumnWidth = insertion ? getNodeRect(insertion.reference.image).width : Math.max(...images.map(image => image.width! * Math.min(1, 640 / image.width!, 900 / image.height!)));
      added = images.flatMap(image => {
        const scale = Math.min(1, (insertion ? imageColumnWidth : 640) / image.width!, 900 / image.height!);
        const width = image.width! * scale, height = image.height! * scale;
        const rowHeight = Math.max(220, height);
        const imageId = crypto.randomUUID();
        const nodes: Node[] = [
          { id: imageId, type: "image", position: { x, y }, style: { width, height }, data: { image, imageNotesBatchId } },
          { id: crypto.randomUUID(), type: "shape", position: { x: insertion ? insertion.reference.note.position.x : x + imageColumnWidth + 48, y }, style: { width: 400, height: rowHeight },
            data: { shapeType: "rounded", text: "", fontSize: 22, textAlign: "left", textVerticalAlign: "top", autoSizeMode: "fixed", userSize: { width: 400, height: rowHeight }, imageNotesFor: image.name, noteForNodeId: imageId, imageNotesBatchId } },
        ];
        y += rowHeight + 48;
        return nodes;
      });
      if (insertion) {
        const moving = new Set(insertion.following.flatMap(pair => [pair.image.id, pair.note.id]));
        const shift = insertion.following.length ? y - Math.min(insertion.following[0].image.position.y, insertion.following[0].note.position.y) : 0;
        shifted = state.nodes.map(node => {
          const pair = insertion.pairs.find(pair => pair.image.id === node.id || pair.note.id === node.id);
          return pair ? { ...node, position: moving.has(node.id) ? { ...node.position, y: node.position.y + shift } : node.position,
            data: { ...node.data, imageNotesBatchId, ...(pair.note.id === node.id ? { noteForNodeId: pair.image.id } : {}) } } : node;
        });
      }
    } else {
      added = images.map((image, index) => {
        const scale = Math.min(1, 480 / Math.max(image.width!, image.height!));
        const width = image.width! * scale, height = image.height! * scale;
        return { id: crypto.randomUUID(), type: "image", selected: true,
          position: { x: position.x - (requestedPosition ? 0 : width / 2) + index * 24, y: position.y - (requestedPosition ? 0 : height / 2) + index * 24 },
          style: { width, height }, data: { image } };
      });
    }
    added = added.map(node => ({ ...node, selected: !layout && node.type === "image" }));
    state.pushHistory();
    state.setNodes(() => [...shifted.map(n => ({ ...n, selected: false })), ...added]);
    useCanvasStore.setState({ selectedNodeIds: added.filter(node => node.selected).map(node => node.id), selectedEdgeIds: [] });
    useUIStore.getState().setActiveTool("select");
    if (insertion) toast.success("Images inserted with notes", { description: "Following image and note rows moved down together." });
    else if (layout) toast.success(`${images.length} images arranged with note boxes`, { description: `Sorted by filename. Double-click a note box to write.${skipped ? ` ${skipped} unreadable or oversized images skipped.` : ""}` });
    else toast.success(added.length === 1 ? "Image added to board" : "Images added to board");
    return added;
  } catch (error) {
    toast.error("Could not add image", { description: error instanceof Error ? error.message : "Choose another file." });
  }
}
