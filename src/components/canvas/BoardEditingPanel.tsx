"use client";

import { useEffect, useState } from "react";
import { isMetallicColor } from "@/lib/canvas/custom-colors";
import { surfaceEffectLayerPatch } from "@/lib/canvas/surface-effects";
import { resolveSurfaceEffectData } from "@/lib/style-utils";
import { ChildOrderControls } from "./ChildOrderControls";
import { Pin, X } from "lucide-react";
import { useCanvasStore } from "@/store/canvas-store";
import { useUIStore } from "@/store/ui-store";
import { CanvasInspector, fieldPatch } from "./CanvasInspector";
import { TemplateLauncher } from "./TemplateLauncher";
import { SaveBoxTemplateButton } from "./SaveBoxTemplateButton";
import { LayoutPanel } from "./LayoutPanel";
import { CanvasLayersPanel } from "./CanvasLayersPanel";
import { AppColorPicker } from "./AppColorPicker";
import { QuickTextFormat } from "./QuickTextFormat";
import { normalizeTable } from "@/lib/canvas/table";
import { TableColumnFillPanel } from "./TableColumnFillPanel";
import { FillCardDialog } from "./FillCardDialog";

export function BoardEditingPanel({ setToolbarHost }: { setToolbarHost: (host: HTMLDivElement | null) => void }) {
  const columnTarget = useUIStore(state => state.fillingTableColumn);
  const panel = useUIStore(state => state.boardPanel);
  const layoutOpen = useUIStore(state => state.layoutPanelOpen);
  const layersOpen = useUIStore(state => state.layersPanelOpen);
  const auxiliary = layoutOpen || layersOpen;
  const setPanel = useUIStore(state => state.setBoardPanel);
  const pinnedId = useUIStore(state => state.fillingCardNodeId);
  const setPinned = useUIStore(state => state.setFillingCardNodeId);
  const nodes = useCanvasStore(state => state.nodes);
  const hasColumnTarget = columnTarget && normalizeTable(nodes.find(node => node.id === columnTarget.nodeId)?.data.table).columns.some(column => column.id === columnTarget.columnId);
  const ids = useCanvasStore(state => state.selectedNodeIds);
  const edgeIds = useCanvasStore(state => state.selectedEdgeIds);
  const selected = nodes.filter(node => ids.includes(node.id));
  const candidate = selected.length === 1 ? selected[0] : undefined;
  const card = nodes.find(node => node.id === pinnedId) ?? (candidate?.data.cardTemplateId && !candidate.data.freeCardLayout ? candidate : undefined);
  const [cardTab, setCardTab] = useState<"fill" | "style">("fill");
  useEffect(() => {
    const selection = useCanvasStore.subscribe((next, previous) => {
      if (next.selectedNodeIds.join() === previous.selectedNodeIds.join() && next.selectedEdgeIds.join() === previous.selectedEdgeIds.join()) return;
      const ui = useUIStore.getState();
      if (ui.fillingCardNodeId) setCardTab("fill");
      if (!ui.fillingCardNodeId && !ui.layoutPanelOpen && !ui.layersPanelOpen && (next.selectedNodeIds.length || next.selectedEdgeIds.length)) { ui.setBoardPanel("selection"); setCardTab("fill"); }
    });
    const filling = useUIStore.subscribe((next, previous) => {
      if ((next.layoutPanelOpen && !previous.layoutPanelOpen) || (next.layersPanelOpen && !previous.layersPanelOpen)) useUIStore.setState({ boardPanel: "selection" });
      if (next.fillingCardNodeId && next.fillingCardNodeId !== previous.fillingCardNodeId) { next.setBoardPanel("selection"); setCardTab("fill"); }
    });
    return () => { selection(); filling(); useUIStore.setState({ fillingTableColumn: null }); useUIStore.getState().setFillingCardNodeId(null); };
  }, []);
  const close = () => { useUIStore.setState({ fillingTableColumn: null }); setPanel(null); setPinned(null); useUIStore.getState().setLayoutPanelOpen(false); useUIStore.getState().setLayersPanelOpen(false); };
  return <>
    <header className="flex shrink-0 items-center justify-between border-b px-3 py-2">
      <h2 className="text-sm font-semibold">{panel === "templates" ? "Templates" : panel === "board" ? "Board settings" : card ? "Template fields" : selected.length === 1 ? String(selected[0].type ?? "Object") : selected.length + edgeIds.length ? `${selected.length + edgeIds.length} selected` : "Properties"}</h2>
      <button type="button" title="Close panel" aria-label="Close editing panel" onClick={close} className="rounded p-1.5 hover:bg-accent"><X size={16} /></button>
    </header>
    {auxiliary && <div className="min-h-0 flex-1 overflow-y-auto"><LayoutPanel /><CanvasLayersPanel /></div>}
    <div className="min-h-0 flex-1 overflow-y-auto" hidden={panel !== "templates" || auxiliary}>{hasColumnTarget ? <TableColumnFillPanel /> : <TemplateLauncher />}</div>
    {panel === "board" && !auxiliary && <div className="min-h-0 flex-1 overflow-y-auto"><CanvasInspector boardOnly /></div>}
    <div hidden={panel !== "selection" || auxiliary} className="min-h-0 flex-1 flex-col data-[visible=true]:flex" data-visible={panel === "selection"}>
      {card && <div className="flex shrink-0 items-center gap-1 border-b p-2" aria-label="Template controls">
        <button className="rounded px-3 py-1.5 text-xs aria-pressed:bg-primary/10 aria-pressed:text-primary" aria-pressed={cardTab === "fill"} onClick={() => setCardTab("fill")}>Fill</button>
        <button className="rounded px-3 py-1.5 text-xs aria-pressed:bg-primary/10 aria-pressed:text-primary" aria-pressed={cardTab === "style"} onClick={() => { useCanvasStore.setState({ selectedNodeIds: [card.id], selectedEdgeIds: [], nodes: nodes.map(node => ({ ...node, selected: node.id === card.id })) }); setCardTab("style"); }}>Style</button>
        <button className="ml-auto flex items-center gap-1 rounded px-2 py-1.5 text-xs aria-pressed:bg-primary/10" aria-label="Keep this card open" aria-pressed={!!pinnedId} title="Keep this card open while selecting and copying other objects" onClick={() => setPinned(pinnedId ? null : card.id)}><Pin size={14} />{pinnedId ? "Pinned" : "Pin"}</button>
      </div>}
      {card && <div className="min-h-0 flex-1" hidden={cardTab !== "fill"}><FillCardDialog embedded key={card.id} nodeId={card.id} onClose={close} /></div>}
      <div className="min-h-0 flex-1 overflow-y-auto" hidden={!!card && cardTab === "fill"}>
        <ChildOrderControls />
        {!!selected.length && <div className="border-b p-3"><QuickTextFormat nodes={selected} />
          {selected.some(node => ["shape", "sticky", "text", "mindmap", "table", "frame"].includes(node.type ?? "")) && <div className="mt-2 flex gap-2">{(["fillColor", "borderColor"] as const).map(key => <AppColorPicker key={key} value={typeof selected[0].data[key] === "string" ? selected[0].data[key] as string : undefined} onChange={value => {
            const state = useCanvasStore.getState(); state.pushHistory(); selected.filter(node => !node.data.locked && !state.layers.some(layer => layer.id === node.data.layerId && layer.locked)).forEach(node => state.updateNodeData(node.id, { ...fieldPatch(node.data, key, value || undefined), ...(key === "fillColor" && isMetallicColor(value) ? surfaceEffectLayerPatch(resolveSurfaceEffectData(node.data), "metallic", true) : {}) }));
          }}><button className="flex items-center gap-2 rounded border px-2 py-1 text-xs" type="button"><span className="h-4 w-4 rounded border" style={{ background: String(selected[0].data[key] || "transparent") }} />{key === "fillColor" ? "Fill colour" : "Border colour"}</button></AppColorPicker>)}</div>}
        </div>}
        {selected.length === 1 && <div className="border-b px-2"><SaveBoxTemplateButton node={selected[0]} /></div>}
        <div ref={setToolbarHost} className="board-selection-dock" />
        {selected.length || edgeIds.length ? <CanvasInspector showTemplates={false} /> : <p className="p-4 text-sm text-muted-foreground">Select an object to edit it. Use the left toolbar to add text, shapes, tables, or templates.</p>}
      </div>
    </div>
  </>;
}
