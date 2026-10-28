"use client";
import { useCanvasStore } from "@/store/canvas-store";
import { useUIStore } from "@/store/ui-store";
import { useNodeManualResize } from "./useNodeManualResize";
import { memo } from "react";
import { NodeResizer, type NodeProps } from "@xyflow/react";
import { normalizeMediaAttachments } from "@/lib/canvas/node-media";
import { objectRotationStyle } from "@/lib/canvas/object-rotation";

/** Board images share attachment validation/storage and the canvas selection/resize tools. */
export const ImageNode = memo(function ImageNode({ id, data, selected }: NodeProps) {
  const resize = useNodeManualResize(id);
  const presenting = useUIStore(s => s.presentationMode);
  const readonly = useCanvasStore(s => s.board?.accessRole === "viewer" || !!data.locked || s.layers.some(l => l.id === data.layerId && l.locked));
  const image = normalizeMediaAttachments([data.image])[0];
  if (!image || image.kind !== "image") return null;
  // User-selected data URLs are already decoded and validated by createMediaAttachment.
  // eslint-disable-next-line @next/next/no-img-element
  return <><NodeResizer isVisible={!!selected && !readonly && !presenting} keepAspectRatio minWidth={24} minHeight={24} onResizeStart={resize.onResizeStart} onResizeEnd={resize.onResizeEnd} /><img src={image.dataUrl} alt={image.name} draggable={false} className="h-full w-full select-none object-contain" style={objectRotationStyle("image", data)} /></>;
});
