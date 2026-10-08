"use client";

import { useEffect, useRef } from "react";
import { Pin, X } from "lucide-react";
import { useCanvasStore } from "@/store/canvas-store";
import { useUIStore } from "@/store/ui-store";
import { CanvasInspector } from "./CanvasInspector";
import { TemplateLauncher } from "./TemplateLauncher";
import { SaveBoxTemplateButton } from "./SaveBoxTemplateButton";
import { LayoutPanel } from "./LayoutPanel";
import { CanvasLayersPanel } from "./CanvasLayersPanel";
import { ChildOrderControls } from "./ChildOrderControls";
import { normalizeTable } from "@/lib/canvas/table";
import { TableCellFillPanel } from "./TableCellFillPanel";
import { FillCardDialog } from "./FillCardDialog";

/** Template filling is an accessory to selection editing, never a replacement for it. */
export function BoardEditingPanel({ setToolbarHost }: { setToolbarHost: (host: HTMLDivElement | null) => void }) {
  const ui = useUIStore();
  const templateSection = useRef<HTMLDetailsElement>(null);
  const nodes = useCanvasStore(state => state.nodes);
  const ids = useCanvasStore(state => state.selectedNodeIds);
  const edgeIds = useCanvasStore(state => state.selectedEdgeIds);
  const selected = nodes.filter(node => ids.includes(node.id));
  const candidate = selected.length === 1 ? selected[0] : undefined;
  const card = nodes.find(node => node.id === ui.fillingCardNodeId) ?? (candidate?.data.cardTemplateId ? candidate : undefined);
  const target = ui.fillingTableColumn;
  const table = normalizeTable(nodes.find(node => node.id === target?.nodeId)?.data.table);
  const cell = target && table.columns.some(column => column.id === target.columnId) && table.rows.some(row => row.id === target.rowId);
  const auxiliary = ui.layoutPanelOpen || ui.layersPanelOpen;
  const library = ui.boardPanel === "templates" && !cell && !card;
  const editing = !auxiliary && ui.boardPanel !== "board" && !library;
  useEffect(() => {
    const unsubscribe = useCanvasStore.subscribe((next, previous) => {
      if (next.selectedNodeIds.join() === previous.selectedNodeIds.join() && next.selectedEdgeIds.join() === previous.selectedEdgeIds.join()) return;
      const state = useUIStore.getState();
      if (!state.layoutPanelOpen && !state.layersPanelOpen && (next.selectedNodeIds.length || next.selectedEdgeIds.length)) state.setBoardPanel("selection");
      if (state.selectedTableCell && !next.selectedNodeIds.includes(state.selectedTableCell.nodeId)) useUIStore.setState({ selectedTableCell: null });
      if (state.fillingTableColumn && !next.selectedNodeIds.includes(state.fillingTableColumn.nodeId)) useUIStore.setState({ fillingTableColumn: null });
    });
    return () => { unsubscribe(); useUIStore.setState({ fillingTableColumn: null, selectedTableCell: null, fillingCardNodeId: null }); };
  }, []);
  const close = () => { ui.setBoardPanel(null); ui.setLayoutPanelOpen(false); ui.setLayersPanelOpen(false); ui.setFillingCardNodeId(null); useUIStore.setState({ fillingTableColumn: null }); };
  return <>
    <header className="flex shrink-0 items-center justify-between border-b px-3 py-2">
      <h2 className="text-sm font-semibold">{library ? "Templates" : ui.boardPanel === "board" ? "Board settings" : "Properties"}</h2>
      <button type="button" title="Close panel" aria-label="Close editing panel" onClick={close} className="rounded p-1.5 hover:bg-accent"><X size={16} /></button>
    </header>
    {auxiliary && <div className="min-h-0 flex-1 overflow-y-auto"><LayoutPanel /><CanvasLayersPanel /></div>}
    <div className="min-h-0 flex-1 overflow-y-auto" hidden={!library || auxiliary}><TemplateLauncher /></div>
    {ui.boardPanel === "board" && !auxiliary && <div className="min-h-0 flex-1 overflow-y-auto"><CanvasInspector boardOnly /></div>}
    <div hidden={!editing} className="min-h-0 flex-1 overflow-y-auto">
      {(card || cell) && <details ref={templateSection} key={cell ? `${target!.nodeId}:${target!.rowId}:${target!.columnId}` : card!.id} open className="group/template border-b" data-template-accessory>
        <summary className="sticky top-0 z-20 flex cursor-pointer list-none items-center gap-2 bg-background px-3 py-2 text-sm font-semibold [&::-webkit-details-marker]:hidden"><span aria-hidden="true" className="group-open/template:hidden">+</span><span aria-hidden="true" className="hidden group-open/template:inline">−</span>Template fields</summary>
        {card && !cell && <button className="mx-3 flex items-center gap-1 text-xs" aria-label="Keep this template open" aria-pressed={!!ui.fillingCardNodeId} onClick={() => ui.setFillingCardNodeId(ui.fillingCardNodeId ? null : card.id)}><Pin size={12} />Keep open while copying</button>}
        <div className="h-72 overflow-y-auto">{cell ? <TableCellFillPanel /> : <FillCardDialog embedded key={card!.id} nodeId={card!.id} onClose={() => { ui.setFillingCardNodeId(null); if (templateSection.current) templateSection.current.open = false; }} />}</div>
      </details>}
      <ChildOrderControls />
      {selected.length || edgeIds.length ? <CanvasInspector showTemplates={false} /> : <p className="p-4 text-sm text-muted-foreground">Select an object to edit it.</p>}
      {selected.length === 1 && <div className="border-b px-2"><SaveBoxTemplateButton node={selected[0]} /></div>}
      <div ref={setToolbarHost} className="board-selection-dock" />
    </div>
  </>;
}
