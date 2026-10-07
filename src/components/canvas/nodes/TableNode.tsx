"use client";

import { memo, useLayoutEffect, useRef, type TextareaHTMLAttributes } from "react";
import { NodeResizeControl, type NodeProps } from "@xyflow/react";
import { Plus, Trash2 } from "lucide-react";
import { useCanvasStore } from "@/store/canvas-store";
import { useUIStore } from "@/store/ui-store";
import { NodeHandles } from "./NodeHandles";
import { NodeQuickActions } from "./NodeQuickActions";
import { renderCardSections } from "@/lib/canvas/card-templates";
import { FONT_OPTIONS } from "@/lib/fonts";
import { objectRotationStyle } from "@/lib/canvas/object-rotation";
import { useNodeManualResize } from "./useNodeManualResize";
import { tableMinimumWidth, tableTemplateDesign, addTableColumn, addTableRow, MAX_TABLE_COLUMNS, MAX_TABLE_ROWS, normalizeTable, parseTablePaste, pasteTableCells, removeTableColumn, removeTableRow, tablePlainText, type CanvasTable } from "@/lib/canvas/table";

function TableInput(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const input = ref.current;
    if (!input) return;
    const fit = () => { input.style.height = "0px"; input.style.height = `${Math.max(36, input.scrollHeight)}px`; };
    fit();
    const observer = new ResizeObserver(() => { if (input.clientWidth !== lastWidth) { lastWidth = input.clientWidth; fit(); } });
    let lastWidth = input.clientWidth;
    observer.observe(input);
    return () => observer.disconnect();
  }, [props.value]);
  return <textarea {...props} ref={ref} data-table-input rows={1} className="nodrag nopan nowheel block w-full resize-none overflow-hidden bg-transparent px-2 py-2 outline-none focus:bg-primary/5 focus:ring-2 focus:ring-inset focus:ring-primary" style={{ font: "inherit", lineHeight: 1.5, ...props.style }} />;
}

function TableNodeComponent({ id, data, selected }: NodeProps) {
  const resizeControls = useNodeManualResize(id);
  const root = useRef<HTMLDivElement>(null);
  const tableElement = useRef<HTMLTableElement>(null);
  const table = normalizeTable(data.table);
  const settings = useCanvasStore(state => state.settings);
  const viewer = useCanvasStore(state => state.board?.accessRole === "viewer");
  const layerLocked = useCanvasStore(state => state.layers.some(layer => layer.id === data.layerId && layer.locked));
  const presentation = useUIStore(state => state.presentationMode);
  const editable = !viewer && !layerLocked && !data.locked && !presentation;
  const editingHistory = useRef(false);
  const focus = (rowId: string, columnId: string) => requestAnimationFrame(() => {
    const target = Array.from(root.current?.querySelectorAll<HTMLElement>("[data-row][data-column]") ?? []).find(input => input.dataset.row === rowId && input.dataset.column === columnId);
    target?.focus();
  });
  const openCell = (columnId: string, rowId: string) => {
    if (!editable) return;
    useUIStore.setState({ fillingCardNodeId: null, fillingTableColumn: { nodeId: id, columnId, rowId }, boardPanel: "templates", layoutPanelOpen: false, layersPanelOpen: false });
  };
  const current = () => normalizeTable(useCanvasStore.getState().nodes.find(node => node.id === id)?.data.table);
  const write = (next: CanvasTable, history = true) => {
    const state = useCanvasStore.getState();
    const node = state.nodes.find(node => node.id === id);
    if (!editable || !node || node.data.locked || state.board?.accessRole === "viewer" || state.layers.some(layer => layer.id === node.data.layerId && layer.locked) || useUIStore.getState().presentationMode) return;
    if (history) state.pushHistory();
    state.updateNodeData(id, { table: next, text: tablePlainText(next) });
    if (typeof node.data.sampleDesignId === "string") state.updateSampleTemplate(node.data.sampleDesignId, { table: tableTemplateDesign(next) }, false);
    const minWidth = tableMinimumWidth(next, Number(node.data.fontSize) || settings.defaultFontSize);
    if (Number(node.style?.width) < minWidth) {
      state.setNodes(nodes => nodes.map(item => item.id === id ? { ...item, style: { ...item.style, width: Math.max(Number(item.style?.width) || 600, minWidth) } } : item));
    }
  };
  const beginTyping = () => { if (!editingHistory.current && editable) { useCanvasStore.getState().pushHistory(); editingHistory.current = true; } };
  const addRow = (after?: number) => { const next = addTableRow(current(), after); write(next); focus(next.rows[Math.min((after ?? next.rows.length - 2) + 1, next.rows.length - 1)].id, next.columns[0].id); };
  const color = typeof data.borderColor === "string" ? data.borderColor : "#94a3b8";
  const defaultFont = FONT_OPTIONS.find(font => font.label === settings.defaultFont)?.value ?? `${settings.defaultFont}, system-ui, sans-serif`;
  const minimumWidth = tableMinimumWidth(table, Number(data.fontSize) || settings.defaultFontSize);
  useLayoutEffect(() => {
    const element = tableElement.current;
    if (!element) return;
    let frame = 0;
    const fit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const state = useCanvasStore.getState();
        const node = state.nodes.find(item => item.id === id);
        if (!node || node.resizing) return;
        // Measure natural rows, not the fixed React Flow wrapper. Reserve the footer
        // even while deselected so selection does not repeatedly resize the node.
        const header = element.previousElementSibling as HTMLElement | null;
        const height = Math.ceil(element.offsetHeight + (header?.offsetHeight ?? 34) + 46);
        const width = Math.max(Number(node.style?.width) || node.width || 0, minimumWidth);
        const minimumHeight = typeof node.data.tableMinHeight === "number" ? node.data.tableMinHeight : Number(node.style?.height) || node.height || 0;
        const nextHeight = width !== Number(node.style?.width)
          ? Number(node.style?.height) || node.height || height
          : Math.max(minimumHeight, height);
        if (width === Number(node.style?.width) && nextHeight === Number(node.style?.height)) return;
        state.setNodes(nodes => nodes.map(item => item.id === id ? { ...item, data: { ...item.data, tableMinHeight: minimumHeight }, style: { ...item.style, width, height: nextHeight } } : item));
      });
    };
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    fit();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [id, minimumWidth, data.tableMinHeight]);
  return <div ref={root} className="relative h-full w-full" onFocus={() => {
    if (!editable) return;
    const state = useCanvasStore.getState();
    if (!state.selectedNodeIds.includes(id)) useCanvasStore.setState({ nodes: state.nodes.map(node => ({ ...node, selected: node.id === id })), selectedNodeIds: [id], selectedEdgeIds: [] });
  }} style={{ ...objectRotationStyle("table", data), fontFamily: String(data.fontFamily || defaultFont), fontSize: Number(data.fontSize) || settings.defaultFontSize, fontWeight: data.fontWeight === "bold" ? 700 : undefined, fontStyle: data.fontStyle === "italic" ? "italic" : undefined, color: typeof data.textColor === "string" ? data.textColor : undefined }}>
    {selected && editable && <NodeResizeControl minWidth={minimumWidth} minHeight={(table.rows.length + 1) * 38 + 70} position="bottom-right" onResizeStart={resizeControls.onResizeStart} onResizeEnd={(event, params) => { useCanvasStore.getState().updateNodeData(id, { tableMinHeight: params.height }); resizeControls.onResizeEnd(event, params); }} />}
    <NodeHandles nodeId={id} color={color} selected={selected} />
    {editable && <NodeQuickActions nodeId={id} color={color} selected={selected} />}
    <div className={`flex h-full flex-col rounded-lg border bg-background shadow-sm ${selected ? "ring-2 ring-primary" : ""}`} style={{ borderColor: color, backgroundColor: typeof data.fillColor === "string" ? data.fillColor : undefined }}>
      <div className="shrink-0 cursor-grab border-b px-3 py-2 text-xs font-semibold text-muted-foreground" style={{ borderColor: color }}>Table · {table.rows.length} rows × {table.columns.length} columns</div>
      <table ref={tableElement} className="w-full shrink-0 border-collapse" style={{ tableLayout: "fixed" }} aria-label="Editable table">
        <thead><tr>{table.showRowLabels && <th scope="col" className="border-b border-r bg-muted/50 px-2 text-left" style={{ borderColor: color }}>Row label</th>}{table.columns.map((column, columnIndex) => <th key={column.id} scope="col" className="relative border-b border-r bg-muted/50 text-left font-semibold last:border-r-0" style={{ borderColor: color }}>
          <TableInput aria-label={`Column ${columnIndex + 1} name`} value={column.name} readOnly={!editable} onBlur={() => { editingHistory.current = false; }} onChange={event => { beginTyping(); write({ ...current(), columns: current().columns.map(item => item.id === column.id ? { ...item, name: event.target.value } : item) }, false); }} />
          {selected && editable && <button data-export-ignore type="button" title={`Delete column ${columnIndex + 1}`} aria-label={`Delete column ${columnIndex + 1}`} disabled={table.columns.length <= 1} className="nodrag nopan absolute -top-5 right-1 rounded bg-background p-1 text-muted-foreground hover:text-destructive disabled:opacity-30" onClick={() => write(removeTableColumn(current(), column.id))}><Trash2 size={12} /></button>}
        </th>)}</tr></thead>
        <tbody>{table.rows.map((row, rowIndex) => <tr key={row.id}>{table.showRowLabels && <th scope="row" className="border-b border-r text-left align-top" style={{ borderColor: color }}><TableInput aria-label={`Row ${rowIndex + 1} label`} value={row.label ?? ""} readOnly={!editable} onBlur={() => { editingHistory.current = false; }} onChange={event => { beginTyping(); write({ ...current(), rows: current().rows.map(item => item.id === row.id ? { ...item, label: event.target.value } : item) }, false); }} /></th>}{row.cells.map((cell, columnIndex) => <td key={table.columns[columnIndex].id} className="nodrag nopan relative border-b border-r align-top last:border-r-0" style={{ borderColor: color }}
              onKeyDown={event => {
                if (!editable || !(event.target as HTMLElement).matches('[role="group"][data-row]')) return;
                if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openCell(table.columns[columnIndex].id, row.id); }
                if (event.key === "Tab") {
                  const next = rowIndex * table.columns.length + columnIndex + (event.shiftKey ? -1 : 1);
                  if (next >= 0 && next < table.rows.length * table.columns.length) { event.preventDefault(); focus(table.rows[Math.floor(next / table.columns.length)].id, table.columns[next % table.columns.length].id); }
                  else if (!event.shiftKey && table.rows.length < MAX_TABLE_ROWS) { event.preventDefault(); addRow(); }
                }
              }}
          onClick={event => { if (!(event.target as HTMLElement).closest("a, button, [data-export-ignore]")) openCell(table.columns[columnIndex].id, row.id); }}>

          {table.columns[columnIndex].card && (() => {
            const card = table.columns[columnIndex].card!;
            const template = settings.cardTemplates?.find(item => item.id === card.template.id) ?? card.template;
            const rendered = renderCardSections(template, card.sections.filter(section => section.id === row.id));
            return <div className="min-h-9 p-2 outline-none focus:ring-2 focus:ring-inset focus:ring-primary" tabIndex={editable ? 0 : undefined} role="group" aria-label={`Row ${rowIndex + 1}, ${table.columns[columnIndex].name}`} data-row={row.id} data-column={table.columns[columnIndex].id}
              onFocus={() => openCell(table.columns[columnIndex].id, row.id)}
              style={{ fontWeight: "normal", fontStyle: "normal", color: template.style.textColor || undefined, fontSize: template.style.fontSize, fontFamily: template.style.fontFamily || undefined }}>
              <div className="[&_p]:m-0 [&_a]:underline [&_a]:decoration-current" dangerouslySetInnerHTML={{ __html: rendered.richText }} />
            </div>;
          })()}
          {(!table.columns[columnIndex].card || cell) && <TableInput aria-label={`Row ${rowIndex + 1}, ${table.columns[columnIndex].name || `column ${columnIndex + 1}`}`} data-row={row.id} data-column={table.columns[columnIndex].id} value={cell} readOnly={!editable} onBlur={() => { editingHistory.current = false; }} onChange={event => { beginTyping(); write({ ...current(), rows: current().rows.map(item => item.id === row.id ? { ...item, cells: item.cells.map((value, index) => index === columnIndex ? event.target.value : value) } : item) }, false); }} onKeyDown={event => {
            if (event.key !== "Tab" || !editable || event.nativeEvent.isComposing) return;
            const nextIndex = rowIndex * table.columns.length + columnIndex + (event.shiftKey ? -1 : 1);
            if (nextIndex < 0) return;
            if (nextIndex >= table.rows.length * table.columns.length) {
              if (table.rows.length >= MAX_TABLE_ROWS) return;
              event.preventDefault(); addRow();
            } else { event.preventDefault(); focus(table.rows[Math.floor(nextIndex / table.columns.length)].id, table.columns[nextIndex % table.columns.length].id); }
          }} onPaste={event => {
            if (!editable) return;
            const text = event.clipboardData.getData("text/plain");
            if (!text.includes("\t")) return;
            event.preventDefault(); write(pasteTableCells(current(), rowIndex, columnIndex, parseTablePaste(text)));
          }} />}
          {columnIndex === table.columns.length - 1 && selected && editable && <div data-export-ignore className="nodrag nopan absolute -right-14 top-1 flex rounded border bg-background shadow-sm">
            <button type="button" aria-label={`Insert row after ${rowIndex + 1}`} title="Insert row below" disabled={table.rows.length >= MAX_TABLE_ROWS} className="p-1 hover:bg-accent disabled:opacity-30" onClick={() => addRow(rowIndex)}><Plus size={14} /></button>
            <button type="button" aria-label={`Delete row ${rowIndex + 1}`} title="Delete row" disabled={table.rows.length <= 1} className="p-1 hover:text-destructive disabled:opacity-30" onClick={() => write(removeTableRow(current(), row.id))}><Trash2 size={14} /></button>
          </div>}
        </td>)}</tr>)}</tbody>
      </table>
      {selected && editable && <div data-export-ignore className="nodrag nopan flex shrink-0 flex-wrap items-center gap-3 px-3 py-2 text-xs text-muted-foreground">
        <button type="button" disabled={table.rows.length >= MAX_TABLE_ROWS} className="flex items-center gap-1 hover:text-foreground disabled:opacity-30" onClick={() => addRow()}><Plus size={14} />Add row</button>
        <button type="button" disabled={table.columns.length >= MAX_TABLE_COLUMNS} className="flex items-center gap-1 hover:text-foreground disabled:opacity-30" onClick={() => write(addTableColumn(current()))}><Plus size={14} />Add column</button>
        <label className="flex items-center gap-1"><input type="checkbox" checked={!!table.showRowLabels} onChange={event => write({ ...current(), showRowLabels: event.target.checked })} />Row labels</label>
        <span>Tab → next cell · Enter → new line</span>
      </div>}
    </div>
  </div>;
}

export const TableNode = memo(TableNodeComponent);
