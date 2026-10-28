"use client";
import { useRef, useState, type PointerEvent } from "react";
import { useReactFlow, type Node } from "@xyflow/react";
import type { MediaAttachment } from "@/lib/types";
import { useCanvasStore } from "@/store/canvas-store";
import { useUIStore } from "@/store/ui-store";
import { normalizeMediaAttachments, imageAttachmentPlacement } from "@/lib/canvas/node-media";
import { resolveObjectRotation } from "@/lib/canvas/object-rotation";

type Placement = NonNullable<MediaAttachment["placement"]>;
export function InlineImageAttachment({ node, attachment, index, count, width, height, active, onSelect }: {
  node: Node; attachment: MediaAttachment; index: number; count: number; width: number; height: number; active: boolean; onSelect: () => void;
}) {
  const { getZoom } = useReactFlow();
  const [draft, setDraft] = useState<Placement | null>(null);
  const latestDraft = useRef<Placement | null>(null);
  const gesture = useRef<{ x: number; y: number; placement: Placement; resize: boolean; boardId?: string } | null>(null);
  const presenting = useUIStore(s => s.presentationMode);
  const readonly = useCanvasStore(s => s.board?.accessRole === "viewer" || !!node.data.locked || s.layers.some(l => l.id === node.data.layerId && l.locked));
  const selected = useCanvasStore(s => s.selectedNodeIds.includes(node.id));
  const placement = draft ?? imageAttachmentPlacement(attachment, index, count, width, height);
  const begin = (event: PointerEvent<HTMLDivElement>, resize: boolean) => {
    event.stopPropagation();
    if (readonly || presenting || event.button !== 0) return;
    event.preventDefault();
    const state = useCanvasStore.getState();
    state.setNodes(nodes => nodes.map(n => ({ ...n, selected: n.id === node.id })));
    useCanvasStore.setState({ selectedNodeIds: [node.id], selectedEdgeIds: [] });
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
      const factor = Math.min((1 - p.x) / p.width, (1 - p.y) / p.height, Math.max(.1, 1 + Math.max(x / p.width, y / p.height)));
      latestDraft.current = { ...p, width: p.width * factor, height: p.height * factor };
    } else latestDraft.current = { ...p, x: Math.max(0, Math.min(1 - p.width, p.x + x)), y: Math.max(0, Math.min(1 - p.height, p.y + y)) };
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
        state.updateNodeData(node.id, { mediaAttachments: attachments.map(a => a.id === attachment.id ? { ...a, placement: draft } : a) });
      }
    }
    setDraft(null);
  };
  const controls = active && selected && !readonly && !presenting;
  return <div data-inline-image={attachment.id} aria-label={`Image: ${attachment.name}`} className="nodrag nopan absolute pointer-events-auto" style={{ left: `${placement.x * 100}%`, top: `${placement.y * 100}%`, width: `${placement.width * 100}%`, height: `${placement.height * 100}%`, cursor: readonly || presenting ? "default" : "move", touchAction: "none" }}
    onPointerDown={e => begin(e, (e.target as HTMLElement).hasAttribute("data-image-resize"))}
    onPointerMove={move} onPointerUp={finish} onPointerCancel={() => { gesture.current = null; setDraft(null); }}
    onLostPointerCapture={() => { gesture.current = null; setDraft(null); }} onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={attachment.dataUrl} alt={attachment.name} draggable={false} className="h-full w-full select-none object-contain" />
    {controls && <div data-export-ignore className="pointer-events-none absolute inset-0 border-2 border-primary">
      <span className="absolute -left-1 -top-1 h-2 w-2 bg-white border border-primary" />
      <span className="absolute -right-1 -top-1 h-2 w-2 bg-white border border-primary" />
      <span className="absolute -left-1 -bottom-1 h-2 w-2 bg-white border border-primary" />
      <button type="button" data-image-resize aria-label={`Resize image ${attachment.name}`} className="pointer-events-auto absolute -right-2 -bottom-2 h-4 w-4 border-2 border-primary bg-white cursor-se-resize" />
    </div>}
  </div>;
}
