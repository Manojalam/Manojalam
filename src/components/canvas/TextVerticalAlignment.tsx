"use client";
import { AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal } from "lucide-react";
import { useCanvasStore } from "@/store/canvas-store";
import { useUIStore } from "@/store/ui-store";
import type { CanvasTable } from "@/lib/canvas/table";

/** Container alignment stays available alongside the shared inline text toolbar. */
export function TextVerticalAlignment({ nodeId }: { nodeId: string }) {
  const node = useCanvasStore(state => state.nodes.find(item => item.id === nodeId));
  const readonly = useCanvasStore(state => state.board?.accessRole === "viewer" || state.layers.some(layer => layer.id === node?.data.layerId && layer.locked));
  const cell = useUIStore(state => state.tableTextCell);
  if (!node) return null;
  const table = node.type === "table";
  const target = cell?.nodeId === nodeId ? cell : null;
  const value = table && target ? (node.data.table as CanvasTable)?.cellVerticalAlign?.[target.rowId]?.[target.columnId] ?? node.data.textVerticalAlign ?? "top" : node.data.textVerticalAlign ?? "middle";
  return <div className="flex items-center justify-between gap-2 px-2 py-2" aria-label="Vertical text alignment">
    <span className="text-xs text-muted-foreground">Vertical</span>
    <div className="flex gap-1">{([
      ["top", "Top", AlignStartHorizontal], ["middle", "Middle", AlignCenterHorizontal], ["bottom", "Bottom", AlignEndHorizontal],
    ] as const).map(([align, label, Icon]) => <button key={align} type="button" title={label} aria-label={`Align text ${align}`} aria-pressed={value === align}
      disabled={readonly || !!node.data.locked || (table && !target)} onMouseDown={event => event.preventDefault()}
      className="rounded-md border p-2 aria-pressed:bg-primary aria-pressed:text-primary-foreground disabled:opacity-40"
      onClick={() => {
        if (table) window.dispatchEvent(new CustomEvent("vidya:vertical-align-table-cells", { detail: { nodeIds: [nodeId], value: align } }));
        else { const state = useCanvasStore.getState(); state.pushHistory(); state.updateNodeData(nodeId, { textVerticalAlign: align }); }
      }}><Icon className="h-4 w-4" /></button>)}</div>
  </div>;
}
