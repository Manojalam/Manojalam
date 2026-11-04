import type { Node } from "@xyflow/react";
import { getNodeRect } from "../layout/geometry";
import { normalizeMediaAttachments, imageAttachmentPlacement } from "./node-media";
import { resolveObjectRotation } from "./object-rotation";

/** Resolve an inline image in board coordinates without detaching or duplicating it. */
export function attachmentImageNode(owner: Node, attachmentId: string): Node | undefined {
  const images = normalizeMediaAttachments(owner.data.mediaAttachments).filter(image => image.kind === "image");
  const index = images.findIndex(image => image.id === attachmentId);
  if (index < 0) return;
  const image = images[index], rect = getNodeRect(owner);
  const p = imageAttachmentPlacement(image, index, images.length, rect.width, rect.height);
  const width = p.width * rect.width, height = p.height * rect.height;
  const cx = (p.x + p.width / 2 - .5) * rect.width, cy = (p.y + p.height / 2 - .5) * rect.height;
  const angle = resolveObjectRotation(owner.type, owner.data) * Math.PI / 180;
  return { id: owner.id, type: "image", position: {
    x: rect.centerX + cx * Math.cos(angle) - cy * Math.sin(angle) - width / 2,
    y: rect.centerY + cx * Math.sin(angle) + cy * Math.cos(angle) - height / 2,
  }, style: { width, height }, data: { image } };
}
