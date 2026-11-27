"use client";
import { useEffect, useState } from "react";
import { useCanvasStore } from "@/store/canvas-store";

/** One content-level control shared by every canvas object, including tables. */
export function ContentCollapseControls({ nodeId }: { nodeId: string }) {
  const [available, setAvailable] = useState(false);
  const node = useCanvasStore(state => state.nodes.find(item => item.id === nodeId));
  const readonly = useCanvasStore(state => state.board?.accessRole === "viewer" || !!node?.data.locked || state.layers.some(layer => layer.id === node?.data.layerId && layer.locked));
  const root = () => document.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(nodeId)}"]`);
  useEffect(() => {
    const element = document.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(nodeId)}"]`);
    if (!element) { setAvailable(false); return; }
    let frame = 0;
    const refresh = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => setAvailable(!!element.querySelector('[data-template-toggle]'))); };
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(element, { childList: true, subtree: true });
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [nodeId]);
  if (!available) return null;
  return <div className="flex flex-wrap items-center gap-2 border-t px-3 py-2" aria-label="Collapsible contents">
    <span className="w-full text-xs text-muted-foreground">All contents in this {node?.type === "table" ? "table" : "object"}</span>
    {[true, false].map(collapsed => <button key={String(collapsed)} type="button" disabled={readonly}
      className="rounded border px-2 py-1 text-xs hover:bg-accent disabled:opacity-40" onMouseDown={event => event.preventDefault()}
      onClick={() => {
        root()?.querySelectorAll<HTMLElement>('.tiptap').forEach(editor => {
          if (editor.querySelector('[data-template-collapsible="true"]')) editor.dispatchEvent(new CustomEvent("template-collapse-all", { detail: { collapsed } }));
        });
      }}>{collapsed ? "Collapse all" : "Expand all"}</button>)}
  </div>;
}
