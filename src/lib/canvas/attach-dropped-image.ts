"use client";

import { useCanvasStore } from "@/store/canvas-store";
import { useUIStore } from "@/store/ui-store";
import { getNodeRect } from "@/lib/layout";
import { resolveObjectRotation } from "./object-rotation";
import { MAX_MEDIA_ATTACHMENTS, normalizeMediaAttachments } from "./node-media";

/** A single free image dropped inside an editable object uses its attachment storage. */
export function attachDroppedImage(imageId: string, movedIds: Set<string>): boolean {
  const state = useCanvasStore.getState();
  const imageNode = state.nodes.find(node => node.id === imageId);
  if (!imageNode || imageNode.type !== "image" || movedIds.size !== 1 || state.board?.accessRole === "viewer" || useUIStore.getState().presentationMode) return false;
  // Connected/grouped images carry structure that must not be discarded by attachment.
  if (imageNode.data.locked || imageNode.data.groupId || imageNode.parentId || state.edges.some(edge => edge.source === imageId || edge.target === imageId)) return false;
  const image = normalizeMediaAttachments([imageNode.data.image])[0];
  if (!image || image.kind !== "image") return false;
  const source = getNodeRect(imageNode);
  const candidates = state.nodes.flatMap((node, index) => {
    const layer = state.layers.find(layer => layer.id === node.data.layerId);
    if (node.id === imageId || node.type === "image" || node.type === "frame" || node.hidden || node.data.locked || layer?.locked || layer?.visible === false) return [];
    const attachments = normalizeMediaAttachments(node.data.mediaAttachments);
    if (attachments.length >= MAX_MEDIA_ATTACHMENTS) return [];
    const rect = getNodeRect(node), angle = -resolveObjectRotation(node.type, node.data) * Math.PI / 180;
    const dx = source.centerX - rect.centerX, dy = source.centerY - rect.centerY;
    const x = dx * Math.cos(angle) - dy * Math.sin(angle) + rect.width / 2;
    const y = dx * Math.sin(angle) + dy * Math.cos(angle) + rect.height / 2;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return [];
    return [{ node, index, attachments, rect, x, y }];
  }).sort((a, b) => (b.node.zIndex ?? 0) - (a.node.zIndex ?? 0) || a.rect.width * a.rect.height - b.rect.width * b.rect.height || b.index - a.index);
  const target = candidates[0];
  if (!target) return false;
  const scale = Math.min(1, target.rect.width / source.width, target.rect.height / source.height);
  const width = source.width * scale, height = source.height * scale;
  const placement = {
    x: Math.max(0, Math.min(target.rect.width - width, target.x - width / 2)) / target.rect.width,
    y: Math.max(0, Math.min(target.rect.height - height, target.y - height / 2)) / target.rect.height,
    width: width / target.rect.width, height: height / target.rect.height,
  };
  // Drag start already captured the undo snapshot; attachment is the same action.
  state.setNodes(nodes => nodes.filter(node => node.id !== imageId).map(node => node.id === target.node.id
    ? { ...node, selected: false, data: { ...node.data, mediaAttachments: [...target.attachments, { ...image, id: crypto.randomUUID(), placement }] } }
    : node));
  useCanvasStore.setState({ selectedNodeIds: [], selectedEdgeIds: [] });
  return true;
}
