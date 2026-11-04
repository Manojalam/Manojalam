"use client";

import type { Node } from "@xyflow/react";
import { getNodeRect } from "@/lib/layout";
import { toast } from "sonner";
import { useCanvasStore } from "@/store/canvas-store";
import { useUIStore } from "@/store/ui-store";
import { createMediaAttachment, normalizeMediaAttachments, MAX_MEDIA_ATTACHMENTS, mediaFileMimeType } from "./node-media";

/** File picker and clipboard share validation, placement, history and persistence. */
export async function addBoardImages(files: File[], targetNodeId?: string, layout?: "vertical-notes") {
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
  const position = { x: ((canvas?.width ?? innerWidth) / 2 - viewport.x) / viewport.zoom, y: ((canvas?.height ?? innerHeight) / 2 - viewport.y) / viewport.zoom };
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
    let added: Node[];
    if (layout === "vertical-notes") {
      const existing = state.nodes.filter(node => !node.hidden).map(getNodeRect);
      const x = existing.length ? Math.max(...existing.map(rect => rect.right)) + 80 : position.x - 520;
      let y = existing.length ? Math.min(...existing.map(rect => rect.top)) : position.y - 160;
      const imageNotesBatchId = crypto.randomUUID();
      const imageColumnWidth = Math.max(...images.map(image => image.width! * Math.min(1, 640 / image.width!, 900 / image.height!)));
      added = images.flatMap(image => {
        const scale = Math.min(1, 640 / image.width!, 900 / image.height!);
        const width = image.width! * scale, height = image.height! * scale;
        const rowHeight = Math.max(220, height);
        const imageId = crypto.randomUUID();
        const nodes: Node[] = [
          { id: imageId, type: "image", position: { x, y }, style: { width, height }, data: { image, imageNotesBatchId } },
          { id: crypto.randomUUID(), type: "shape", position: { x: x + imageColumnWidth + 48, y }, style: { width: 400, height: rowHeight },
            data: { shapeType: "rounded", text: "", fontSize: 22, textAlign: "left", textVerticalAlign: "top", autoSizeMode: "fixed", userSize: { width: 400, height: rowHeight }, imageNotesFor: image.name, noteForNodeId: imageId, imageNotesBatchId } },
        ];
        y += rowHeight + 48;
        return nodes;
      });
    } else {
      added = images.map((image, index) => {
        const scale = Math.min(1, 480 / Math.max(image.width!, image.height!));
        const width = image.width! * scale, height = image.height! * scale;
        return { id: crypto.randomUUID(), type: "image", selected: true,
          position: { x: position.x - width / 2 + index * 24, y: position.y - height / 2 + index * 24 },
          style: { width, height }, data: { image } };
      });
    }
    state.pushHistory();
    state.setNodes(nodes => [...nodes.map(n => ({ ...n, selected: false })), ...added]);
    useCanvasStore.setState({ selectedNodeIds: layout ? [] : added.map(n => n.id), selectedEdgeIds: [] });
    useUIStore.getState().setActiveTool("select");
    if (layout) toast.success(`${images.length} images arranged with note boxes`, { description: `Sorted by filename. Double-click a note box to write.${skipped ? ` ${skipped} unreadable or oversized images skipped.` : ""}` });
    else toast.success(added.length === 1 ? "Image added to board" : "Images added to board");
    return added;
  } catch (error) {
    toast.error("Could not add image", { description: error instanceof Error ? error.message : "Choose another file." });
  }
}
