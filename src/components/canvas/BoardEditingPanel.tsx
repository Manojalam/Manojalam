"use client";

import { useCallback, useEffect } from "react";
import { Pin, X, Lock, Unlock, Trash2 } from "lucide-react";
import { useCanvasStore } from "@/store/canvas-store";
import { useUIStore } from "@/store/ui-store";
import { CanvasInspector, type InspectorTab } from "./CanvasInspector";
import { CrossBoardTemplateLibrary } from "./CrossBoardTemplateLibrary";
import { SampleTemplatesPanel } from "./SampleTemplatesPanel";
import { BoardStyleTemplatesPanel } from "./BoardStyleTemplatesPanel";
import { TemplateLauncher } from "./TemplateLauncher";
import { SaveBoxTemplateButton } from "./SaveBoxTemplateButton";
import { LayoutPanel } from "./LayoutPanel";
import { CanvasLayersPanel } from "./CanvasLayersPanel";
import { ChildOrderControls } from "./ChildOrderControls";
import { normalizeTable } from "@/lib/canvas/table";
import { objectPropertiesLabel } from "@/lib/canvas/property-tabs";
import { objectCapabilities } from "@/lib/canvas/object-capabilities";
import { TableCellFillPanel } from "./TableCellFillPanel";
import { FillCardDialog } from "./FillCardDialog";

function ObjectToolsSlot({ nodeId, hidden }: { nodeId: string; hidden: boolean }) {
  const attach = useCallback((element: HTMLDivElement | null) => {
    if (element) useUIStore.setState({ objectToolsHost: { nodeId, element } });
    else if (useUIStore.getState().objectToolsHost?.nodeId === nodeId) useUIStore.setState({ objectToolsHost: null });
  }, [nodeId]);
  return <div id="properties-table-tools" ref={attach} hidden={hidden} />;
}

function ObjectPosition({ nodeId }: { nodeId: string }) {
  const node = useCanvasStore(state => state.nodes.find(item => item.id === nodeId));
  const readonly = useCanvasStore(state => state.board?.accessRole === "viewer" || state.layers.some(layer => layer.id === node?.data.layerId && layer.locked));
  if (!node) return null;
  return <section className="grid grid-cols-2 gap-2 border-b p-3" aria-label="Object position">
    <h3 className="col-span-2 text-xs font-medium">Position{node.parentId ? " within parent" : " on board"}</h3>
    {(["x", "y"] as const).map(axis => <label key={axis} className="text-xs uppercase">{axis}<input
      key={node.position[axis]} type="number" step="any" aria-label={`Object position ${axis}`} disabled={readonly || !!node.data.locked}
      className="mt-1 h-8 w-full rounded border bg-background px-2" defaultValue={Math.round(node.position[axis] * 100) / 100}
      onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }}
      onBlur={event => { const value = Number(event.currentTarget.value); if (!event.currentTarget.value || !Number.isFinite(value) || value === node.position[axis]) return; const state = useCanvasStore.getState(); state.pushHistory(); state.setNodes(items => items.map(item => item.id === nodeId ? { ...item, position: { ...item.position, [axis]: value } } : item)); }}
    /></label>)}
  </section>;
}

/** One fixed navigation header. Each tool uses the available panel height. */
export function BoardEditingPanel({ setToolbarHost }: { setToolbarHost: (host: HTMLDivElement | null) => void }) {
  const ui = useUIStore();
  const nodes = useCanvasStore(state => state.nodes);
  const edges = useCanvasStore(state => state.edges);
  const ids = useCanvasStore(state => state.selectedNodeIds);
  const edgeIds = useCanvasStore(state => state.selectedEdgeIds);
  const selected = nodes.filter(node => ids.includes(node.id));
  const viewer = useCanvasStore(state => state.board?.accessRole === "viewer");
  const anyLocked = selected.some(node => node.data.locked === true);
  const candidate = selected.length === 1 ? selected[0] : undefined;
  const card = nodes.find(node => node.id === ui.fillingCardNodeId) ?? (candidate?.data.cardTemplateId ? candidate : undefined);
  const target = ui.fillingTableColumn;
  const table = normalizeTable(nodes.find(node => node.id === target?.nodeId)?.data.table);
  const cell = target && table.columns.some(column => column.id === target.columnId) && table.rows.some(row => row.id === target.rowId);
  const auxiliary = ui.layoutPanelOpen || ui.layersPanelOpen;
  const editing = !auxiliary && ui.boardPanel !== "board";
  const labels = selected.map(node => objectPropertiesLabel(node, nodes, edges));
  const specific = labels.length && labels.every(label => label === labels[0]) && (selected.length === 1 || labels[0] === "Matrix") ? labels[0] : null;
  const supportsText = !!edgeIds.length || !selected.length || selected.some(node => objectCapabilities(node.type).text);
  const supportsStyle = !!edgeIds.length || !selected.length || selected.some(node => objectCapabilities(node.type).surface);

  // Old saved Size selections resolve to their new home.
  const requestedTab = ui.propertiesTab === "shape" ? (specific ? "specific" : "layout") : ui.propertiesTab === "specific" && !specific ? "layout" : ui.propertiesTab;
  const changeInspectorTab = useCallback((tab: InspectorTab) => useUIStore.setState({ propertiesTab: tab }), []);
  useEffect(() => {
    const selection = useCanvasStore.subscribe((next, previous) => {
      if (next.selectedNodeIds.join() === previous.selectedNodeIds.join() && next.selectedEdgeIds.join() === previous.selectedEdgeIds.join()) return;
      const state = useUIStore.getState();
      const node = next.selectedNodeIds.length === 1 ? next.nodes.find(node => node.id === next.selectedNodeIds[0]) : undefined;
      if (!state.layoutPanelOpen && !state.layersPanelOpen && (next.selectedNodeIds.length || next.selectedEdgeIds.length)) {
        state.setBoardPanel("selection");
        if (!state.fillingCardNodeId) useUIStore.setState({ propertiesTab: node?.data.cardTemplateId ? "template" : "style" });
      }
      if (state.selectedTableCell && !next.selectedNodeIds.includes(state.selectedTableCell.nodeId)) useUIStore.setState({ selectedTableCell: null });
      if (state.fillingTableColumn && !next.selectedNodeIds.includes(state.fillingTableColumn.nodeId)) useUIStore.setState({ fillingTableColumn: null });
    });
    const filling = useUIStore.subscribe((next, previous) => {
      const key = (state: typeof next) => state.fillingCardNodeId || (state.fillingTableColumn ? JSON.stringify(state.fillingTableColumn) : "");
      if (key(next) && key(next) !== key(previous)) useUIStore.setState({ propertiesTab: "template" });
    });
    return () => { selection(); filling(); useUIStore.setState({ fillingTableColumn: null, selectedTableCell: null, fillingCardNodeId: null, objectToolsHost: null }); };
  }, []);
  const close = () => { ui.setBoardPanel(null); ui.setLayoutPanelOpen(false); ui.setLayersPanelOpen(false); ui.setFillingCardNodeId(null); useUIStore.setState({ fillingTableColumn: null }); };
  const tabs: { id: typeof ui.propertiesTab; label: string }[] = [
    ...(supportsStyle ? [{ id: "style" as const, label: "Style" }] : []), ...(supportsText ? [{ id: "text" as const, label: "Text" }] : []),
    ...(supportsText && !edgeIds.length ? [{ id: "template" as const, label: "Template" }] : []),
    ...(specific ? [{ id: "specific" as const, label: specific }] : []),
    { id: "layout", label: "Arrange" }, { id: "data", label: "More" },
  ];
  const activeTab = tabs.some(tab => tab.id === requestedTab) ? requestedTab : tabs[0]?.id ?? "data";
  // Portalled action groups read the store tab too. Keep it aligned with the
  // visible tab when a previous selection's contextual tab no longer exists.
  useEffect(() => {
    if (ui.propertiesTab !== activeTab) useUIStore.setState({ propertiesTab: activeTab });
  }, [activeTab, ui.propertiesTab]);
  return <>
    <header className="shrink-0 border-b bg-background" data-properties-header>
      <div className="flex items-center justify-between px-3 py-2">
        <h2 className="text-sm font-semibold">{ui.boardPanel === "board" ? "Board settings" : "Properties"}</h2>
        <div className="flex gap-1">
          {!!selected.length && <button type="button" disabled={viewer} title={anyLocked ? "Unlock selected objects" : "Lock selected objects"} aria-label={anyLocked ? "Unlock selected objects" : "Lock selected objects"} className="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-accent disabled:opacity-50" onClick={() => {
            const state = useCanvasStore.getState();
            if (state.board?.accessRole === "viewer") return;
            state.pushHistory();
            state.setNodes(items => items.map(node => ids.includes(node.id) ? { ...node, draggable: anyLocked, selectable: true, data: { ...node.data, locked: !anyLocked } } : node));
          }}>{anyLocked ? <Unlock size={14} /> : <Lock size={14} />}{anyLocked ? "Unlock" : "Lock"}</button>}
          {candidate && <button type="button" disabled={viewer} aria-label="Delete selected object" className="rounded p-1.5 text-destructive hover:bg-accent" onClick={() => useCanvasStore.getState().deleteSelected()}><Trash2 size={14} /></button>}
          <button type="button" title="Close panel" aria-label="Close editing panel" onClick={close} className="rounded p-1.5 hover:bg-accent"><X size={16} /></button>
        </div>
      </div>
      {ui.boardPanel !== "board" && <div role="tablist" aria-label="Properties tabs" className="grid grid-cols-3 gap-1 px-2 pb-2">{tabs.map(tab => <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={`properties-${tab.id}`} onMouseDown={event => event.preventDefault()} onClick={() => { ui.setBoardPanel("selection"); useUIStore.setState({ propertiesTab: tab.id }); }} className="rounded-md px-1 py-2 text-xs font-medium aria-selected:bg-primary aria-selected:text-primary-foreground">{tab.label}</button>)}</div>}
    </header>
    {auxiliary && <div className="min-h-0 flex-1 overflow-y-auto"><LayoutPanel /><CanvasLayersPanel /></div>}
    {ui.boardPanel === "board" && !auxiliary && <div className="min-h-0 flex-1 overflow-y-auto"><CanvasInspector boardOnly /></div>}
    <div id="properties-template" role="tabpanel" aria-label="Template" className={editing && activeTab === "template" ? "min-h-0 flex-1 overflow-y-auto" : "hidden"}>
      <TemplateLauncher />
      {card && !cell && <button className="m-2 flex shrink-0 items-center gap-1 text-xs" aria-label="Keep this template open" aria-pressed={!!ui.fillingCardNodeId} onClick={() => ui.setFillingCardNodeId(ui.fillingCardNodeId ? null : card.id)}><Pin size={12} />Keep open while copying</button>}
      {cell ? <TableCellFillPanel /> : card ? <FillCardDialog embedded key={card.id} nodeId={card.id} onClose={() => { ui.setFillingCardNodeId(null); useUIStore.setState({ propertiesTab: "style" }); }} /> : null}
    </div>
    <div role="tabpanel" id={`properties-${activeTab === "template" ? "style" : activeTab}`} aria-label={specific && activeTab === "specific" ? specific : activeTab} className={editing && activeTab !== "template" ? "min-h-0 flex-1 overflow-y-auto" : "hidden"}>
      {(activeTab === "specific" || (!specific && activeTab === "layout")) && <ChildOrderControls />}
      {activeTab === "layout" && candidate && <ObjectPosition nodeId={candidate.id} />}
      <div>
        {selected.length || edgeIds.length ? <CanvasInspector embedded tab={activeTab === "template" ? "style" : activeTab} onTabChange={changeInspectorTab} showTemplates={false} /> : <p className="p-4 text-sm text-muted-foreground">Select an object to edit it.</p>}
      </div>
      {candidate?.type === "table" && <ObjectToolsSlot nodeId={candidate.id} hidden={activeTab !== "specific"} />}
      {selected.length === 1 && activeTab === "style" && <div className="border-b px-2"><SaveBoxTemplateButton node={selected[0]} /></div>}
      {activeTab === "style" && <>
        <details className="border-b"><summary className="cursor-pointer p-3 text-xs font-semibold">Saved appearances</summary><SampleTemplatesPanel /><CrossBoardTemplateLibrary kind="sample" /></details>
        <details className="border-b"><summary className="cursor-pointer p-3 text-xs font-semibold">Shared styles</summary><BoardStyleTemplatesPanel /><CrossBoardTemplateLibrary kind="style" /></details>
      </>}
      <div hidden={activeTab === "template"} ref={setToolbarHost} className="board-selection-dock" />
    </div>
  </>;
}
