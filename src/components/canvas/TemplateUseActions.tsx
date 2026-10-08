"use client";

import { normalizeTable } from "@/lib/canvas/table";
import { toast } from "sonner";
import type { BoardCardTemplate, SampleCardTemplate } from "@/lib/types";
import { supportsContentTemplate } from "@/lib/canvas/apply-content-template";
import { useCanvasStore } from "@/store/canvas-store";
import { useUIStore } from "@/store/ui-store";
import { Button } from "@/components/ui/button";

export function TemplateUseActions({ kind, template, prepare }: { kind: "card" | "sample"; template: BoardCardTemplate | SampleCardTemplate; prepare?: () => void }) {
  const node = useCanvasStore(state => state.selectedNodeIds.length === 1 ? state.nodes.find(item => item.id === state.selectedNodeIds[0]) : undefined);
  const columnTarget = useUIStore(state => state.selectedTableCell ?? state.fillingTableColumn);
  const table = node?.type === "table" ? normalizeTable(node.data.table) : undefined;
  const targetCell = columnTarget?.nodeId === node?.id && table?.columns.some(column => column.id === columnTarget?.columnId) && table.rows.some(row => row.id === columnTarget?.rowId) ? columnTarget : undefined;
  const columnMode = node?.type === "table" && kind === "card";
  const viewer = useCanvasStore(state => state.board?.accessRole === "viewer");
  const layerLocked = useCanvasStore(state => state.layers.some(layer => layer.id === node?.data.layerId && layer.locked));
  const tableDesign = kind === "sample" && !!(template as SampleCardTemplate).table;
  const applicable = (!columnMode || !!targetCell) && node && supportsContentTemplate(node) && !node.data.locked && !layerLocked && (!tableDesign || node.type === "table") && (node.type !== "table" || kind === "card" || tableDesign);
  return <div className="space-y-2">
    <div className="flex flex-wrap gap-1">
      <Button size="sm" disabled={viewer || !applicable} onClick={() => {
        if (!node || !applicable) return;
        prepare?.();
        const state = useCanvasStore.getState();
        const alreadyUsing = kind === "card" ? node.data.cardTemplateId === template.id : node.data.sampleTemplateId === template.id;
        if (!alreadyUsing && !state.applyContentTemplateToNode(kind, template.id, node.id, columnMode ? targetCell?.columnId : undefined, columnMode ? targetCell?.rowId : undefined)) return;
        if (columnMode) {
          useUIStore.setState({ fillingCardNodeId: null, fillingTableColumn: targetCell!, boardPanel: "templates" });
          toast.success("Template ready", { description: "Fill this cell. Other cells and table styling stay unchanged." });
          return;
        }
        const updated = useCanvasStore.getState().nodes.find(item => item.id === node.id);
        useUIStore.getState().setFillingCardNodeId(null);
        if (updated?.data.cardTemplateId && !updated.data.freeCardLayout) useUIStore.getState().setFillingCardNodeId(node.id);
        toast.success("Template applied", { description: node.type === "table" ? "Edit the table cells directly. Existing values were kept." : updated?.data.freeCardLayout ? "Your content was kept. Edit it directly on the box." : "Fill the fields for this object." });
      }}>{columnMode ? "Use in selected cell" : `Use in selected ${node?.type === "table" ? "table" : "object"}`}</Button>
      <Button size="sm" variant="outline" disabled={viewer} onClick={() => {
        prepare?.();
        const state = useCanvasStore.getState();
        const id = kind === "card" ? state.createCardFromTemplate(template.id) : state.createSampleCard(template.id);
        if (id) useUIStore.getState().setFillingCardNodeId(kind === "card" ? id : null);
      }}>Create new {tableDesign ? "table" : kind === "card" ? "text" : "object"}</Button>
    </div>
    <p className="text-[10px] text-muted-foreground">{columnMode && !targetCell ? "Click a table cell to use a template there." : !applicable ? `Select an unlocked ${tableDesign ? "table" : "table or text object"} to apply here, or create a new one.` : node?.type === "table" ? tableDesign ? "Applies the saved table headings and styling; keeps existing cells." : "Uses the template text in the selected cell. Each cell has independent values and sections." : kind === "card" ? "Uses the template text here. Object styling stays unchanged. Existing text stays editable." : "Applies the saved object design. Existing text stays editable."}</p>
  </div>;
}
