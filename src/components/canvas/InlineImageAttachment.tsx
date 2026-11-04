"use client";
import { useRef, useState, type PointerEvent } from "react";
import { useReactFlow, type Node } from "@xyflow/react";
import type { MediaAttachment } from "@/lib/types";
import { useCanvasStore } from "@/store/canvas-store";
import { useUIStore } from "@/store/ui-store";
import { normalizeMediaAttachments, imageAttachmentPlacement } from "@/lib/canvas/node-media";
import { getNodeRect } from "@/lib/layout";
import { resolveObjectRotation } from "@/lib/canvas/object-rotation";

type Placement = NonNullable<MediaAttachment["placement"]>;
export function InlineImageAttachment({ node, attachment, index, count, width, height, active, onSelect }: {
  node: Node; attachment: MediaAttachment; index: number; count: number; width: number; height: number; active: boolean; onSelect: () => void;
}) {
  const { getZoom } = useReactFlow();
  const [draft, setDraft] = useState<Placement | null>(null);
  const latestDraft = useRef<Placement | null>(null);
  const gesture = useRef<{ x: number; y: number; placement: Placement; resize: string | null; boardId?: string } | null>(null);
  const presenting = useUIStore(s => s.presentationMode);
  const readonly = useCanvasStore(s => s.board?.accessRole === "viewer" || !!node.data.locked || s.layers.some(l => l.id === node.data.layerId && l.locked));
  const placement = draft ?? imageAttachmentPlacement(attachment, index, count, width, height);
  const begin = (event: PointerEvent<HTMLDivElement>, resize: string | null) => {
    event.stopPropagation();
    if (readonly || presenting || event.button !== 0) return;
    event.preventDefault();
    const state = useCanvasStore.getState();
    state.setNodes(nodes => nodes.map(n => n.selected ? { ...n, selected: false } : n));
    state.setEdges(edges => edges.map(edge => edge.selected ? { ...edge, selected: false } : edge));
    useCanvasStore.setState({ selectedNodeIds: [], selectedEdgeIds: [] });
    onSelect();
    latestDraft.current = null;
    gesture.current = { x: event.clientX, y: event.clientY, placement, resize, boardId: state.board?.id };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const start = gesture.current;
    if (!start) return;
    const zoom = getZoom();
    const angle = -resolveObjectRotation(node.type, node.data) * Math.PI / 180;
    const dx = (event.clientX - start.x) / zoom, dy = (event.clientY - start.y) / zoom;
    const x = (dx * Math.cos(angle) - dy * Math.sin(angle)) / width;
    const y = (dx * Math.sin(angle) + dy * Math.cos(angle)) / height;
    const p = start.placement;
    if (start.resize) {
      const left = start.resize.includes("left"), top = start.resize.includes("top");
      const w = p.width * width, h = p.height * height;
      const change = ((left ? -x : x) * width * w + (top ? -y : y) * height * h) / (w * w + h * h);
      const factor = Math.max(24 / Math.min(w, h), 1 + change);
      const nextWidth = p.width * factor, nextHeight = p.height * factor;
      latestDraft.current = { x: left ? p.x + p.width - nextWidth : p.x, y: top ? p.y + p.height - nextHeight : p.y, width: nextWidth, height: nextHeight };
    } else latestDraft.current = { ...p, x: p.x + x, y: p.y + y };
    setDraft(latestDraft.current);
  };
  const finish = () => {
    const start = gesture.current; gesture.current = null;
    const draft = latestDraft.current;
    const state = useCanvasStore.getState(), target = state.nodes.find(n => n.id === node.id);
    if (start && draft && target && state.board?.id === start.boardId && state.board?.accessRole !== "viewer" && !target.data.locked
      && !useUIStore.getState().presentationMode && !state.layers.some(l => l.id === target.data.layerId && l.locked)) {
      const attachments = normalizeMediaAttachments(target.data.mediaAttachments);
      if (attachments.some(a => a.id === attachment.id)) {
        state.pushHistory();
        const outside = draft.x < -0.000001 || draft.y < -0.000001 || draft.x + draft.width > 1.000001 || draft.y + draft.height > 1.000001;
        if (outside) {
          // Once an image leaves its owner, use the existing standalone image node.
          const rect = getNodeRect(target), angle = resolveObjectRotation(target.type, target.data) * Math.PI / 180;
          const w = draft.width * width, h = draft.height * height;
          const cx = (draft.x + draft.width / 2) * width - width / 2;
          const cy = (draft.y + draft.height / 2) * height - height / 2;
          const image = { ...attachment }; delete image.placement;
          const id = crypto.randomUUID();
          state.setNodes(nodes => [...nodes.map(n => n.id === node.id ? { ...n, selected: false, data: { ...n.data, mediaAttachments: attachments.filter(a => a.id !== attachment.id) } } : n), {
            id, type: "image", selected: true,
            position: { x: rect.centerX + cx * Math.cos(angle) - cy * Math.sin(angle) - w / 2, y: rect.centerY + cx * Math.sin(angle) + cy * Math.cos(angle) - h / 2 },
            style: { width: w, height: h },
            data: { image, layerId: target.data.layerId, objectRotation: resolveObjectRotation(target.type, target.data) },
          }]);
          useCanvasStore.setState({ selectedNodeIds: [id], selectedEdgeIds: [] });
        } else state.updateNodeData(node.id, { mediaAttachments: attachments.map(a => a.id === attachment.id ? { ...a, placement: draft } : a) });
      }
    }
    setDraft(null);
  };
  const controls = active && !readonly && !presenting;
  return <div data-inline-image={attachment.id} aria-label={`Image: ${attachment.name}`} className="nodrag nopan absolute pointer-events-auto" style={{ left: `${placement.x * 100}%`, top: `${placement.y * 100}%`, width: `${placement.width * 100}%`, height: `${placement.height * 100}%`, cursor: readonly || presenting ? "default" : "move", touchAction: "none" }}
    onPointerDown={e => begin(e, (e.target as HTMLElement).getAttribute("data-image-resize"))}
    onPointerMove={move} onPointerUp={finish} onPointerCancel={() => { gesture.current = null; setDraft(null); }}
    onLostPointerCapture={() => { gesture.current = null; setDraft(null); }} onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={attachment.dataUrl} alt={attachment.name} draggable={false} className="h-full w-full select-none object-contain" />
    {controls && <div data-export-ignore className="pointer-events-none absolute inset-0 border-2 border-primary">
      {(["top-left", "top-right", "bottom-left", "bottom-right"] as const).map(corner => <button key={corner} type="button" data-image-resize={corner} aria-label={`Resize image ${attachment.name} ${corner}`} className="pointer-events-auto absolute h-4 w-4 border-2 border-primary bg-white" style={{ [corner.includes("left") ? "left" : "right"]: -8, [corner.includes("top") ? "top" : "bottom"]: -8, cursor: corner === "top-left" || corner === "bottom-right" ? "nwse-resize" : "nesw-resize" }} />)}
    </div>}
  </div>;
}
