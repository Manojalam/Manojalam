"use client";
import { objectTextDefaults, OBJECT_TEXT_DEFAULTS_CLASS } from "@/lib/canvas/object-text-style";
import { useState, useRef } from "react";
import { RichTextEditor } from "./RichTextEditor";
import { useCanvasStore } from "@/store/canvas-store";
import { textEntryPoint } from "@/lib/canvas/text-entry";
import { plainTextToRichText, richTextToPlainText } from "@/lib/canvas/rich-text-paste";
import { useUIStore } from "@/store/ui-store";

/** An independent text surface. Its owner supplies storage, not formatting behavior. */
export function EditableObjectText({ nodeId, field, value, fallback = "" }: { nodeId: string; field: string; value: string; fallback?: string }) {
  const node = useCanvasStore(state => state.nodes.find(item => item.id === nodeId));
  const viewer = useCanvasStore(state => state.board?.accessRole === "viewer");
  const layerLocked = useCanvasStore(state => state.layers.some(layer => layer.id === node?.data.layerId && layer.locked));
  const presenting = useUIStore(state => state.presentationMode);
  const [editing, setEditing] = useState(false);
  const [point, setPoint] = useState<ReturnType<typeof textEntryPoint> | null>(null);
  const history = useRef(false);
  const locked = viewer || layerLocked || presenting || !!node?.data.locked;
  const rich = node?.data[`${field}RichText`];
  const content = typeof rich === "string" && richTextToPlainText(rich) === value ? rich : plainTextToRichText(value);
  return <div style={objectTextDefaults(node?.data ?? {})} className={`nodrag nopan cursor-text [&_p]:m-0 ${OBJECT_TEXT_DEFAULTS_CLASS}`} data-object-text-field={field} onDoubleClick={event => {
    event.stopPropagation();
    if (locked || (event.target as HTMLElement).closest("[contenteditable=true]")) return;
    const state = useCanvasStore.getState();
    state.setNodes(nodes => nodes.map(node => ({ ...node, selected: node.id === nodeId })));
    useCanvasStore.setState({ selectedNodeIds: [nodeId], selectedEdgeIds: [] });
    useUIStore.getState().setBoardPanel("selection");
    history.current = false; setPoint(textEntryPoint(event)); setEditing(true);
  }}>
    <RichTextEditor nodeId={editing ? nodeId : undefined} initialContent={content} placeholder={fallback} initialFocusPoint={point} editable={editing && !locked} onBlur={() => setEditing(false)} onChange={html => {
      const state = useCanvasStore.getState();
      if (locked) return;
      if (!history.current) { state.pushHistory(); history.current = true; }
      state.updateNodeData(nodeId, { [field]: richTextToPlainText(html), [`${field}RichText`]: html });
    }} />
  </div>;
}
