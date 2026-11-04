"use client";
import { useCanvasStore } from "@/store/canvas-store";
import { useUIStore } from "@/store/ui-store";
import { useNodeManualResize } from "./useNodeManualResize";
import { memo, useEffect } from "react";
import { NodeResizer, type NodeProps } from "@xyflow/react";
import { fitImageBounds, normalizeMediaAttachments } from "@/lib/canvas/node-media";
import { objectRotationStyle } from "@/lib/canvas/object-rotation";

/** Board images share attachment validation/storage and the canvas selection/resize tools. */
export const ImageNode = memo(function ImageNode({ id, data, selected, width, height }: NodeProps) {
  const resize = useNodeManualResize(id);
  const presenting = useUIStore(s => s.presentationMode);
  const readonly = useCanvasStore(s => s.board?.accessRole === "viewer" || !!data.locked || s.layers.some(l => l.id === data.layerId && l.locked));
  const image = normalizeMediaAttachments([data.image])[0];
  const imageWidth = image?.width, imageHeight = image?.height;
  useEffect(() => {
    if (!width || !height || readonly || presenting) return;
    const fitted = fitImageBounds(width, height, imageWidth, imageHeight);
    if (Math.abs(fitted.width - width) < .5 && Math.abs(fitted.height - height) < .5) return;
    const state = useCanvasStore.getState();
    const current = state.nodes.find(n => n.id === id);
    if (!current || current.resizing) return;
    // Repair old letterboxed containers without changing the visible image's center or scale.
    state.setNodes(nodes => nodes.map(n => n.id === id ? {
      ...n, position: { x: n.position.x + fitted.x * (1 - 2 * (n.origin?.[0] ?? 0)), y: n.position.y + fitted.y * (1 - 2 * (n.origin?.[1] ?? 0)) },
      width: fitted.width, height: fitted.height,
      measured: { ...n.measured, width: fitted.width, height: fitted.height },
      style: { ...n.style, width: fitted.width, height: fitted.height },
      data: { ...n.data, userSize: { width: fitted.width, height: fitted.height } },
    } : n));
  }, [id, width, height, imageWidth, imageHeight, readonly, presenting]);
  if (!image || image.kind !== "image") return null;
  // User-selected data URLs are already decoded and validated by createMediaAttachment.
  // eslint-disable-next-line @next/next/no-img-element
  return <><NodeResizer isVisible={!!selected && !readonly && !presenting} keepAspectRatio minWidth={24} minHeight={24} onResizeStart={resize.onResizeStart} onResizeEnd={resize.onResizeEnd} /><img src={image.dataUrl} alt={image.name} draggable={false} className="h-full w-full select-none object-contain" style={objectRotationStyle("image", data)} /></>;
});
