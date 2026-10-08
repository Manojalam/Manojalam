"use client";
import { useCanvasStore } from "@/store/canvas-store";
import { useUIStore } from "@/store/ui-store";
import { cellSections, normalizeTable } from "@/lib/canvas/table";
import { CardForm } from "./FillCardDialog";
import { CrossBoardTemplateLibrary } from "./CrossBoardTemplateLibrary";

export function TableCellFillPanel() {
  const target = useUIStore(state => state.fillingTableColumn);
  const node = useCanvasStore(state => state.nodes.find(node => node.id === target?.nodeId));
  const templates = useCanvasStore(state => state.settings.cardTemplates);
  const viewer = useCanvasStore(state => state.board?.accessRole === "viewer");
  const layerLocked = useCanvasStore(state => state.layers.some(layer => layer.id === node?.data.layerId && layer.locked));
  const table = normalizeTable(node?.data.table);
  const column = table.columns.find(column => column.id === target?.columnId);
  const row = table.rows.find(row => row.id === target?.rowId);
  const content = row?.templates?.[column?.id ?? ""];
  const close = () => useUIStore.setState({ fillingTableColumn: null });
  if (!target || !node || !column || !row) return <div className="p-3"><p>Select a table cell to fill.</p><button onClick={close}>Back to templates</button></div>;
  const locked = viewer || layerLocked || !!node.data.locked;
  if (!content) return <div className="space-y-3 p-3">
    <button className="text-xs underline" onClick={close}>Back to templates</button>
    <p className="text-xs text-muted-foreground">Choose a template to enter text and look up sūtras.</p>
    <label className="block text-sm">Template<select aria-label="Template" className="mt-1 w-full rounded border bg-background p-2" value="" disabled={locked} onChange={event => {
      useCanvasStore.getState().applyContentTemplateToNode("card", event.target.value, node.id, column.id, row.id);
      useUIStore.setState({ fillingTableColumn: target, boardPanel: "templates" });
    }}><option value="" disabled>Choose a template…</option>{templates?.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>
    <details><summary className="cursor-pointer text-xs">From other boards</summary><CrossBoardTemplateLibrary /></details>
    {!templates?.length && <p className="text-xs text-muted-foreground">No templates on this board yet. Open Templates to create one or use one from your library.</p>}
  </div>;
  const template = templates?.find(template => template.id === content!.template.id) ?? content.template;
  return <div className="flex h-full min-h-0 flex-col">
    <div className="space-y-2 border-b p-3"><button className="text-xs underline" onClick={close}>Back to templates</button>
    </div>
    <CardForm key={`${node.id}:${row.id}:${column.id}`} columnId={column.id} cellRowId={row.id} nodeId={node.id} template={template} sections={cellSections(table, column.id, row.id)} locked={viewer || layerLocked || !!node.data.locked} onClose={close} onNext={() => {}} embedded />
  </div>;
}
