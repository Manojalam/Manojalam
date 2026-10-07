"use client";

import { toast } from "sonner";
import type { BoardCardTemplate, SampleCardTemplate } from "@/lib/types";
import { supportsContentTemplate } from "@/lib/canvas/apply-content-template";
import { useCanvasStore } from "@/store/canvas-store";
import { useUIStore } from "@/store/ui-store";
import { Button } from "@/components/ui/button";

export function TemplateUseActions({ kind, template, prepare }: { kind: "card" | "sample"; template: BoardCardTemplate | SampleCardTemplate; prepare?: () => void }) {
  const node = useCanvasStore(state => state.selectedNodeIds.length === 1 ? state.nodes.find(item => item.id === state.selectedNodeIds[0]) : undefined);
  const viewer = useCanvasStore(state => state.board?.accessRole === "viewer");
  const layerLocked = useCanvasStore(state => state.layers.some(layer => layer.id === node?.data.layerId && layer.locked));
  const tableDesign = kind === "sample" && !!(template as SampleCardTemplate).table;
  const applicable = node && supportsContentTemplate(node) && !node.data.locked && !layerLocked && (!tableDesign || node.type === "table");
  return <div className="space-y-2">
    <div className="flex flex-wrap gap-1">
      <Button size="sm" disabled={viewer || !applicable} onClick={() => {
        if (!node || !applicable) return;
        prepare?.();
        const state = useCanvasStore.getState();
        if (!state.applyContentTemplateToNode(kind, template.id, node.id)) return;
        const updated = useCanvasStore.getState().nodes.find(item => item.id === node.id);
        useUIStore.getState().setFillingCardNodeId(null);
        if (updated?.data.cardTemplateId && !updated.data.freeCardLayout) useUIStore.getState().setFillingCardNodeId(node.id);
        toast.success("Template applied", { description: node.type === "table" ? "Edit the table cells directly. Existing values were kept." : updated?.data.freeCardLayout ? "Your content was kept. Edit it directly on the box." : "Fill the fields in this box." });
      }}>Apply to selected {node?.type === "table" ? "table" : "box"}</Button>
      <Button size="sm" variant="outline" disabled={viewer} onClick={() => {
        prepare?.();
        const state = useCanvasStore.getState();
        const id = kind === "card" ? state.createCardFromTemplate(template.id) : state.createSampleCard(template.id);
        if (id) useUIStore.getState().setFillingCardNodeId(kind === "card" ? id : null);
      }}>Create new {tableDesign ? "table" : "card"}</Button>
    </div>
    <p className="text-[10px] text-muted-foreground">{!applicable ? `Select an unlocked ${tableDesign ? "table" : "table or box"} to apply here, or create a new one.` : node?.type === "table" ? tableDesign ? "Applies the saved table headings and styling; keeps existing cells." : "Each template field becomes a column. The table widens to fit; existing values stay. Fill cells directly." : "Applies here without adding a box. Existing text stays editable."}</p>
  </div>;
}
