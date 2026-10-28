"use client";
import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { normalizeMediaAttachments } from "@/lib/canvas/node-media";
import { objectRotationStyle } from "@/lib/canvas/object-rotation";

/** Board images share attachment validation/storage and the canvas selection/resize tools. */
export const ImageNode = memo(function ImageNode({ data }: NodeProps) {
  const image = normalizeMediaAttachments([data.image])[0];
  if (!image || image.kind !== "image") return null;
  // User-selected data URLs are already decoded and validated by createMediaAttachment.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={image.dataUrl} alt={image.name} draggable={false} className="h-full w-full select-none object-contain" style={objectRotationStyle("image", data)} />;
});
