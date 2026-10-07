"use client";
import { useCanvasStore } from "@/store/canvas-store";
import { useUIStore } from "@/store/ui-store";
import { columnSections, normalizeTable } from "@/lib/canvas/table";
import { CardForm } from "./FillCardDialog";

export function TableColumnFillPanel() {
  const target = useUIStore(state => state.fillingTableColumn);
  const node = useCanvasStore(state => state.nodes.find(node => node.id === target?.nodeId));
  const templates = useCanvasStore(state => state.settings.cardTemplates);
  const viewer = useCanvasStore(state => state.board?.accessRole === "viewer");
  const layerLocked = useCanvasStore(state => state.layers.some(layer => layer.id === node?.data.layerId && layer.locked));
  const table = normalizeTable(node?.data.table);
  const column = table.columns.find(column => column.id === target?.columnId);
  const close = () => useUIStore.setState({ fillingTableColumn: null });
  if (!target || !node || !column?.card) return <div className="p-3"><p>Select a template column to fill.</p><button onClick={close}>Back to templates</button></div>;
  const template = templates?.find(template => template.id === column.card!.template.id) ?? column.card.template;
  return <div className="flex h-full min-h-0 flex-col">
    <div className="space-y-2 border-b p-3"><button className="text-xs underline" onClick={close}>Back to templates</button>
      <label className="block text-xs">Column to fill<select aria-label="Column to fill" className="mt-1 w-full rounded border bg-background p-2" value={column.id} onChange={event => useUIStore.setState({ fillingTableColumn: { nodeId: node.id, columnId: event.target.value } })}>{table.columns.filter(column => column.card).map(column => <option key={column.id} value={column.id}>{column.name}</option>)}</select></label>
      <p className="text-xs text-muted-foreground">Each section fills one body row. Headers and row labels stay separate.</p>
    </div>
    <CardForm key={`${node.id}:${column.id}:${target.rowId ?? ""}`} columnId={column.id} initialSectionId={target.rowId} nodeId={node.id} template={template} sections={columnSections(table, column.id)} locked={viewer || layerLocked || !!node.data.locked} onClose={close} onNext={() => {}} embedded />
  </div>;
}
