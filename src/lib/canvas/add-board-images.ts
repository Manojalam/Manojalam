"use client";

import { toast } from "sonner";
import { useCanvasStore } from "@/store/canvas-store";
import { useUIStore } from "@/store/ui-store";
import { createMediaAttachment, normalizeMediaAttachments, MAX_MEDIA_ATTACHMENTS } from "./node-media";

/** File picker and clipboard share validation, placement, history and persistence. */
export async function addBoardImages(files: File[], targetNodeId?: string) {
  const initial = useCanvasStore.getState();
  if (!files.length || !initial.board || initial.board.accessRole === "viewer" || useUIStore.getState().presentationMode) return;
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
    for (const file of files) images.push(await createMediaAttachment(file, "image"));
    const state = useCanvasStore.getState();
    if (state.board?.id !== boardId || state.board?.accessRole === "viewer" || useUIStore.getState().presentationMode) return;
    if (targetNodeId) {
      const attachments = attachmentTarget();
      state.pushHistory();
      state.updateNodeData(targetNodeId, { mediaAttachments: [...attachments, ...images] });
      toast.success(images.length === 1 ? "Image attached to selected element" : "Images attached to selected element");
      return;
    }
    const added = images.map((image, index) => {
      const scale = Math.min(1, 480 / Math.max(image.width!, image.height!));
      const width = image.width! * scale, height = image.height! * scale;
      return { id: crypto.randomUUID(), type: "image", selected: true,
        position: { x: position.x - width / 2 + index * 24, y: position.y - height / 2 + index * 24 },
        style: { width, height }, data: { image } };
    });
    state.pushHistory();
    state.setNodes(nodes => [...nodes.map(n => ({ ...n, selected: false })), ...added]);
    useCanvasStore.setState({ selectedNodeIds: added.map(n => n.id), selectedEdgeIds: [] });
    useUIStore.getState().setActiveTool("select");
    toast.success(added.length === 1 ? "Image added to board" : "Images added to board");
  } catch (error) {
    toast.error("Could not add image", { description: error instanceof Error ? error.message : "Choose another file." });
  }
}
