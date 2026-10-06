"use client";

import { ArrowUp, ArrowDown } from "lucide-react";
import { useCanvasStore } from "@/store/canvas-store";
import { buildHierarchy } from "@/lib/layout/hierarchy";

/** Child order belongs beside the selection, not inside object stacking menus. */
export function ChildOrderControls() {
  const nodes = useCanvasStore(state => state.nodes);
  const edges = useCanvasStore(state => state.edges);
  const ids = useCanvasStore(state => state.selectedNodeIds);
  const layers = useCanvasStore(state => state.layers);
  const viewer = useCanvasStore(state => state.board?.accessRole === "viewer");
  const move = useCanvasStore(state => state.moveSiblingNode);
  if (ids.length !== 1) return null;
  const child = nodes.find(node => node.id === ids[0]);
  if (!child) return null;
  const hierarchy = buildHierarchy(nodes, edges);
  const parentId = hierarchy.get(child.id)?.parentId;
  if (!parentId) return null;
  const parent = nodes.find(node => node.id === parentId);
  const siblings = hierarchy.get(parentId)?.childIds ?? [];
  const index = siblings.indexOf(child.id);
  if (index < 0) return null;
  const locked = viewer || [child, parent].some(node => node?.data.locked || layers.some(layer => layer.id === node?.data.layerId && layer.locked));
  return <section aria-label="Child order" className="space-y-2 border-b p-3">
    <div className="flex items-center justify-between"><h3 className="text-xs font-semibold">Child order</h3><span className="text-xs text-muted-foreground">{index + 1} of {siblings.length}</span></div>
    <div className="grid grid-cols-2 gap-2">
      <button type="button" aria-label="Move child earlier" disabled={locked || index === 0} className="flex items-center justify-center gap-1 rounded border px-2 py-1.5 text-xs hover:bg-accent disabled:opacity-40" onClick={() => move(child.id, -1)}><ArrowUp size={14} />Move earlier</button>
      <button type="button" aria-label="Move child later" disabled={locked || index === siblings.length - 1} className="flex items-center justify-center gap-1 rounded border px-2 py-1.5 text-xs hover:bg-accent disabled:opacity-40" onClick={() => move(child.id, 1)}><ArrowDown size={14} />Move later</button>
    </div>
    <p className="text-[10px] text-muted-foreground">Changes this child’s position among its siblings in the chart.</p>
  </section>;
}
