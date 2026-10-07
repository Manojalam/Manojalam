"use client";

import { useState } from "react";
import { normalizeTable } from "@/lib/canvas/table";
import { toast } from "sonner";
import type { BoardCardTemplate, SampleCardTemplate } from "@/lib/types";
import { supportsContentTemplate } from "@/lib/canvas/apply-content-template";
import { useCanvasStore } from "@/store/canvas-store";
import { useUIStore } from "@/store/ui-store";
import { Button } from "@/components/ui/button";

export function TemplateUseActions({ kind, template, prepare }: { kind: "card" | "sample"; template: BoardCardTemplate | SampleCardTemplate; prepare?: () => void }) {
  const node = useCanvasStore(state => state.selectedNodeIds.length === 1 ? state.nodes.find(item => item.id === state.selectedNodeIds[0]) : undefined);
  const columnTarget = useUIStore(state => state.fillingTableColumn);
  const [choice, setChoice] = useState("all");
  const columns = node?.type === "table" ? normalizeTable(node.data.table).columns : [];
  const targetColumn = columnTarget && columnTarget.nodeId === node?.id && columns.some(column => column.id === columnTarget.columnId) ? columnTarget.columnId : columns.some(column => column.id === choice) ? choice : "all";
  const columnMode = node?.type === "table" && kind === "card";
  const viewer = useCanvasStore(state => state.board?.accessRole === "viewer");
  const layerLocked = useCanvasStore(state => state.layers.some(layer => layer.id === node?.data.layerId && layer.locked));
  const tableDesign = kind === "sample" && !!(template as SampleCardTemplate).table;
  const applicable = node && supportsContentTemplate(node) && !node.data.locked && !layerLocked && (!tableDesign || node.type === "table") && (node.type !== "table" || kind === "card" || tableDesign);
  return <div className="space-y-2">
    {columnMode && <label className="block text-xs">Apply inside<select aria-label="Template target column" className="mt-1 w-full rounded border bg-background p-2" value={targetColumn} onChange={event => { setChoice(event.target.value); useUIStore.setState({ fillingTableColumn: null }); }}><option value="all">All body columns</option>{columns.map(column => <option key={column.id} value={column.id}>{column.name}</option>)}</select></label>}
    <div className="flex flex-wrap gap-1">
      <Button size="sm" disabled={viewer || !applicable} onClick={() => {
        if (!node || !applicable) return;
        prepare?.();
        const state = useCanvasStore.getState();
        const alreadyUsing = kind === "card" ? node.data.cardTemplateId === template.id : node.data.sampleTemplateId === template.id;
        if (!alreadyUsing && !state.applyContentTemplateToNode(kind, template.id, node.id, columnMode && targetColumn !== "all" ? targetColumn : undefined)) return;
        if (columnMode) {
          useUIStore.setState({ fillingCardNodeId: null, fillingTableColumn: { nodeId: node.id, columnId: targetColumn === "all" ? columns[0].id : targetColumn }, boardPanel: "templates" });
          toast.success("Template applied to column bodies", { description: "Fill each column independently. Headings and existing cells were kept." });
          return;
        }
        const updated = useCanvasStore.getState().nodes.find(item => item.id === node.id);
        useUIStore.getState().setFillingCardNodeId(null);
        if (updated?.data.cardTemplateId && !updated.data.freeCardLayout) useUIStore.getState().setFillingCardNodeId(node.id);
        toast.success("Template applied", { description: node.type === "table" ? "Edit the table cells directly. Existing values were kept." : updated?.data.freeCardLayout ? "Your content was kept. Edit it directly on the box." : "Fill the fields for this object." });
      }}>{columnMode ? targetColumn === "all" ? "Apply to all columns" : "Use in this column" : `Use in selected ${node?.type === "table" ? "table" : "object"}`}</Button>
      <Button size="sm" variant="outline" disabled={viewer} onClick={() => {
        prepare?.();
        const state = useCanvasStore.getState();
        const id = kind === "card" ? state.createCardFromTemplate(template.id) : state.createSampleCard(template.id);
        if (id) useUIStore.getState().setFillingCardNodeId(kind === "card" ? id : null);
      }}>Create new {tableDesign ? "table" : kind === "card" ? "text" : "object"}</Button>
    </div>
    <p className="text-[10px] text-muted-foreground">{!applicable ? `Select an unlocked ${tableDesign ? "table" : "table or text object"} to apply here, or create a new one.` : node?.type === "table" ? tableDesign ? "Applies the saved table headings and styling; keeps existing cells." : "Uses the template inside each chosen column. Headers and row labels stay unchanged. Each section is a body row." : kind === "card" ? "Uses the template text here. Object styling stays unchanged. Existing text stays editable." : "Applies the saved object design. Existing text stays editable."}</p>
  </div>;
}
