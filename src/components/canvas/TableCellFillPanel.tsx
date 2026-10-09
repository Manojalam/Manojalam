"use client";
import { useCanvasStore } from "@/store/canvas-store";
import { useUIStore } from "@/store/ui-store";
import { cellSections, normalizeTable } from "@/lib/canvas/table";
import { CardForm } from "./FillCardDialog";

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
  if (!target || !node || !column || !row || !content) return null;
  const template = templates?.find(template => template.id === content!.template.id) ?? content.template;
  return <div>
    <CardForm key={`${node.id}:${row.id}:${column.id}`} columnId={column.id} cellRowId={row.id} nodeId={node.id} template={template} sections={cellSections(table, column.id, row.id)} locked={viewer || layerLocked || !!node.data.locked} onClose={close} onNext={() => {}} embedded />
  </div>;
}
