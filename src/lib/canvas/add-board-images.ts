"use client";

import { toast } from "sonner";
import { useCanvasStore } from "@/store/canvas-store";
import { useUIStore } from "@/store/ui-store";
import { createMediaAttachment } from "./node-media";

/** File picker and clipboard share validation, placement, history and persistence. */
export async function addBoardImages(files: File[]) {
  const initial = useCanvasStore.getState();
  if (!files.length || !initial.board || initial.board.accessRole === "viewer" || useUIStore.getState().presentationMode) return;
  const boardId = initial.board.id;
  const canvas = document.querySelector(".react-flow")?.getBoundingClientRect();
  const viewport = initial.viewport;
  const position = { x: ((canvas?.width ?? innerWidth) / 2 - viewport.x) / viewport.zoom, y: ((canvas?.height ?? innerHeight) / 2 - viewport.y) / viewport.zoom };
  try {
    const images = [];
    for (const file of files) images.push(await createMediaAttachment(file, "image"));
    const state = useCanvasStore.getState();
    if (state.board?.id !== boardId || state.board?.accessRole === "viewer" || useUIStore.getState().presentationMode) return;
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
