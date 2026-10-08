"use client";

import { memo, useLayoutEffect, useRef, useState, type TextareaHTMLAttributes } from "react";
import { NodeResizeControl, type NodeProps } from "@xyflow/react";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { useCanvasStore } from "@/store/canvas-store";
import { useUIStore } from "@/store/ui-store";
import { QuickTextFormat } from "../QuickTextFormat";
import { NodeHandles } from "./NodeHandles";
import { NodeQuickActions } from "./NodeQuickActions";
import { RichTextEditor } from "../RichTextEditor";
import { cardSectionsFromText, renderCardSections } from "@/lib/canvas/card-templates";
import { FONT_OPTIONS } from "@/lib/fonts";
import { objectRotationStyle } from "@/lib/canvas/object-rotation";
import { useNodeManualResize } from "./useNodeManualResize";
import { addTableFooter, moveTableColumn, updateCellSections, TABLE_HEADER, TABLE_LABEL, tableRowOrder, tableMergeAt, tableRange, mergeTableCells, splitTableCells, addTableHeading, type TableAddress, tableMinimumWidth, tableTemplateDesign, addTableColumn, addTableRow, MAX_TABLE_COLUMNS, MAX_TABLE_ROWS, normalizeTable, parseTablePaste, pasteTableCells, removeTableColumn, removeTableRow, tablePlainText, type CanvasTable } from "@/lib/canvas/table";

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

function TableNodeComponent({ id, data, selected, width: nodeWidth }: NodeProps) {
  const resizeControls = useNodeManualResize(id);
  const root = useRef<HTMLDivElement>(null);
  const tableElement = useRef<HTMLTableElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const [toolbarBelow, setToolbarBelow] = useState(false);
  useLayoutEffect(() => {
    if (!selected) return;
    const update = () => setToolbarBelow((root.current?.getBoundingClientRect().top ?? 0) < 100 + (toolbar.current?.getBoundingClientRect().height ?? 100));
    update();
    const observer = new ResizeObserver(update);
    if (toolbar.current) observer.observe(toolbar.current);
    window.addEventListener("resize", update);
    return () => { observer.disconnect(); window.removeEventListener("resize", update); };
  }, [selected]);
  const table = normalizeTable(data.table);
  const [selection, setSelection] = useState<{ start: TableAddress; end: TableAddress } | null>(null);
  const [toolbarOffset, setToolbarOffset] = useState({ x: 0, y: 0 });
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editFocusPoint, setEditFocusPoint] = useState<{ clientX: number; clientY: number } | null>(null);
  const range = selection ? tableRange(table, selection.start, selection.end) : undefined;
  const activeRow = table.rows.find(row => row.id === selection?.start.rowId);
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
  const columnWidth = (columnId: string) => {
    const header = Array.from(tableElement.current?.querySelectorAll<HTMLElement>(`[data-cell-row="${TABLE_HEADER}"]`) ?? []).find(cell => cell.dataset.cellColumn === columnId);
    return header?.offsetWidth || (columnId === TABLE_LABEL ? table.labelWidth : table.columns.find(column => column.id === columnId)?.width) || 120;
  };
  const resizeColumn = (columnId: string, width: number, history = true) => {
    if (!Number.isFinite(width)) return;
    const next = current();
    next.columns = next.columns.map(column => ({ ...column, width: column.id === columnId ? Math.max(60, Math.min(4000, width)) : columnWidth(column.id) }));
    if (next.showRowLabels) next.labelWidth = columnId === TABLE_LABEL ? Math.max(60, Math.min(4000, width)) : columnWidth(TABLE_LABEL);
    write(next, history);
    const total = next.columns.reduce((sum, column) => sum + column.width!, next.showRowLabels ? next.labelWidth! : 0);
    useCanvasStore.getState().setNodes(nodes => nodes.map(node => node.id === id ? { ...node, style: { ...node.style, width: total + 2 } } : node));
  };
  const fitColumn = (columnId: string) => {
    const measurement = document.createElement("div");
    Object.assign(measurement.style, { position: "fixed", left: "-10000px", width: "max-content", whiteSpace: "pre" });
    document.body.append(measurement);
    let width = 60;
    for (const cell of Array.from(tableElement.current?.querySelectorAll<HTMLElement>("[data-cell-column]") ?? [])) {
      if (cell.dataset.cellColumn !== columnId || Number(cell.getAttribute("colspan")) > 1) continue;
      measurement.style.font = getComputedStyle(cell).font;
      const input = cell.querySelector("textarea");
      measurement.replaceChildren();
      if (input) measurement.textContent = input.value;
      else {
        const content = cell.querySelector(".tiptap");
        if (content) {
          const clone = content.cloneNode(true) as HTMLElement;
          clone.querySelectorAll<HTMLElement>("*").forEach(element => Object.assign(element.style, { whiteSpace: "pre", width: "auto", maxWidth: "none" }));
          Object.assign(clone.style, { width: "max-content", maxWidth: "none", whiteSpace: "pre" });
          measurement.append(clone);
        } else measurement.textContent = cell.textContent;
      }
      width = Math.max(width, measurement.getBoundingClientRect().width + 24);
    }
    measurement.remove(); resizeColumn(columnId, Math.min(1600, Math.ceil(width)));
  };
  const beginTyping = () => { if (!editingHistory.current && editable) { useCanvasStore.getState().pushHistory(); editingHistory.current = true; } };
  const addRow = (after?: number) => { const before = current(); const next = addTableRow(before, after); if (after !== undefined && before.rows[after]?.aboveHeader) { next.rows[after + 1].aboveHeader = true; next.rows[after + 1].header = true; } write(next); focus(next.rows[Math.min((after ?? next.rows.length - 2) + 1, next.rows.length - 1)].id, next.showRowLabels ? TABLE_LABEL : next.columns[0].id); };
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
        // Editor tools live outside the table and do not affect its content bounds.
        const height = Math.ceil(element.offsetHeight + 2);
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
  const selectCell = (address: TableAddress, extend = false) => setSelection(previous => ({ start: extend && previous ? previous.start : address, end: address }));
  const updateText = (address: TableAddress, text: string) => {
    beginTyping();
    const next = current();
    if (address.rowId === TABLE_HEADER) {
      write({ ...next, columns: next.columns.map(column => column.id === address.columnId ? { ...column, name: text } : column) }, false);
    } else write({ ...next, rows: next.rows.map(row => row.id !== address.rowId ? row : address.columnId === TABLE_LABEL ? { ...row, label: text } : { ...row, cells: row.cells.map((value, index) => next.columns[index].id === address.columnId ? text : value) }) }, false);
  };
  const columns = [...(table.showRowLabels ? [TABLE_LABEL] : []), ...table.columns.map(column => column.id)];
  const rowOrder = tableRowOrder(table);
  const columnWeights = columns.map(id => id === TABLE_LABEL ? table.labelWidth ?? 120 : table.columns.find(column => column.id === id)?.width ?? 120);
  const selectedWidth = selection ? Math.round((nodeWidth || minimumWidth) * columnWeights[columns.indexOf(selection.start.columnId)] / columnWeights.reduce((sum, width) => sum + width, 0)) : 120;
  const renderCell = (rowId: string, columnId: string) => {
    const address = { rowId, columnId };
    const merge = tableMergeAt(table, address);
    if (merge && (merge.rowIds[0] !== rowId || merge.columnIds[0] !== columnId)) return null;
    const row = table.rows.find(row => row.id === rowId);
    const header = rowId === TABLE_HEADER || row?.header || columnId === TABLE_LABEL;
    const Cell = header ? "th" : "td";
    const addresses = (merge?.rowIds ?? [rowId]).flatMap(r => (merge?.columnIds ?? [columnId]).map(c => ({ rowId: r, columnId: c })));
    const highlighted = selected && range && range.rowIds.length * range.columnIds.length > 1 && range.rowIds.includes(rowId) && range.columnIds.includes(columnId);
    return <Cell key={columnId} data-cell-row={rowId} data-cell-column={columnId} scope={header ? rowId === TABLE_HEADER ? "col" : "row" : undefined} rowSpan={merge?.rowIds.length} colSpan={merge?.columnIds.length}
      className={`nodrag nopan relative border-b border-r align-top text-left last:border-r-0 ${header ? "bg-muted/50 font-semibold" : ""} ${highlighted ? "ring-2 ring-inset ring-primary" : ""}`}
      style={{ borderColor: color }}
      onPointerDownCapture={event => { if (editable && event.shiftKey && !(event.target as HTMLElement).closest("[contenteditable=true]")) { event.preventDefault(); event.stopPropagation(); selectCell(address, true); } }}
      onClickCapture={event => { if (editable && event.shiftKey && !(event.target as HTMLElement).closest("[contenteditable=true]")) { event.preventDefault(); event.stopPropagation(); selectCell(address, true); } }}
      onClick={event => { if (event.shiftKey || !editable || (event.target as HTMLElement).closest("button, a, [contenteditable=true]")) return; selectCell(address); if (rowId !== TABLE_HEADER && columnId !== TABLE_LABEL) openCell(columnId, rowId); }}>
      {addresses.map((source, index) => {
        const sourceRow = table.rows.find(row => row.id === source.rowId);
        const columnIndex = table.columns.findIndex(column => column.id === source.columnId);
        const sourceColumn = table.columns[columnIndex];
        const text = source.rowId === TABLE_HEADER ? source.columnId === TABLE_LABEL ? "Row label" : sourceColumn.name : source.columnId === TABLE_LABEL ? sourceRow?.label ?? "" : sourceRow?.cells[columnIndex] ?? "";
        const card = sourceRow?.templates?.[source.columnId];
        if (index && !text && !card) return null;
        const label = source.rowId === TABLE_HEADER ? `Column ${columnIndex + 1} name` : sourceRow?.footer ? `Footer ${table.rows.filter(row => row.footer).findIndex(row => row.id === source.rowId) + 1}` : sourceRow?.aboveHeader ? `Heading ${table.rows.filter(row => row.aboveHeader).findIndex(row => row.id === source.rowId) + 1}${index ? ` part ${index + 1}` : ""}` : source.columnId === TABLE_LABEL ? `Row ${table.rows.filter(row => !row.aboveHeader).findIndex(row => row.id === source.rowId) + 1} label` : `Row ${table.rows.filter(row => !row.aboveHeader).findIndex(row => row.id === source.rowId) + 1}, ${sourceColumn.name || `column ${columnIndex + 1}`}`;
        return <div key={`${source.rowId}:${source.columnId}`}>
          {card && (() => {
            const template = settings.cardTemplates?.find(item => item.id === card.template.id) ?? card.template;
            return <div className="min-h-9 p-2 outline-none focus:ring-2 focus:ring-inset focus:ring-primary" tabIndex={editable ? 0 : undefined} role="group" aria-label={`Template text, ${sourceColumn.name}`} data-row={source.rowId} data-column={source.columnId}
              onPointerDownCapture={event => {
                if (!editable || event.shiftKey || event.button !== 0 || (event.target as HTMLElement).closest("a, [data-template-toggle]")) return;
                selectCell(address); openCell(source.columnId, source.rowId);
                setEditFocusPoint({ clientX: event.clientX, clientY: event.clientY });
                setEditingCell(`${source.rowId}:${source.columnId}`);
              }}
              onFocus={event => { if ((event.target as HTMLElement).closest("[data-template-toggle]")) return; selectCell(address); openCell(source.columnId, source.rowId); }}
              onDoubleClick={event => { if (editable) { event.stopPropagation(); setEditingCell(`${source.rowId}:${source.columnId}`); } }}
              onKeyDown={event => { if ((event.target as HTMLElement).closest("[contenteditable=true], [data-template-toggle]")) return; if (editable && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); openCell(source.columnId, source.rowId); } }}
              style={{ fontWeight: "normal", fontStyle: "normal", color: template.style.textColor || undefined, fontSize: template.style.fontSize, fontFamily: template.style.fontFamily || undefined }}>
              <RichTextEditor templateText initialFocusPoint={editFocusPoint} nodeId={editingCell === `${source.rowId}:${source.columnId}` ? id : undefined} initialContent={renderCardSections(template, card.sections).richText} editable={editable && editingCell === `${source.rowId}:${source.columnId}`} className="[&_p]:m-0 [&_a]:underline [&_a]:decoration-current" onChange={html => {
                const latest = current();
                const content = latest.rows.find(row => row.id === source.rowId)?.templates?.[source.columnId];
                if (!content) return;
                const sections = cardSectionsFromText(template, content.sections, html);
                write(updateCellSections(latest, source.columnId, source.rowId, sections, template), !editingHistory.current);
                editingHistory.current = true;
              }} onBlur={() => { setEditingCell(null); editingHistory.current = false; }} />
            </div>;
          })()}
          {source.rowId === TABLE_HEADER && source.columnId === TABLE_LABEL ? <span className="block px-2 py-2">Row label</span> : (!card || text) && <TableInput aria-label={label} data-row={source.rowId} data-column={source.columnId} value={text} readOnly={!editable}
            onFocus={() => selectCell(address)} onBlur={() => { editingHistory.current = false; }} onChange={event => updateText(source, event.target.value)}
            onPaste={event => { if (!editable || source.rowId === TABLE_HEADER || source.columnId === TABLE_LABEL) return; const text = event.clipboardData.getData("text/plain"); if (!text.includes("\t")) return; event.preventDefault(); write(pasteTableCells(current(), table.rows.findIndex(row => row.id === source.rowId), columnIndex, parseTablePaste(text))); }} />}
        </div>;
      })}
      {rowId === TABLE_HEADER && selected && editable && <div data-export-ignore role="separator" aria-label={`Resize ${columnId === TABLE_LABEL ? "row labels" : table.columns.find(column => column.id === columnId)?.name}`} aria-orientation="vertical" className="nodrag nopan absolute right-0 top-0 z-20 h-full w-2 translate-x-1/2 cursor-col-resize hover:bg-primary/40" onDoubleClick={event => { event.stopPropagation(); fitColumn(columnId); }} onPointerDown={event => {
        event.preventDefault(); event.stopPropagation();
        const start = event.clientX, width = columnWidth(columnId), zoom = useCanvasStore.getState().viewport.zoom;
        event.currentTarget.setPointerCapture(event.pointerId);
        const target = event.currentTarget; let history = true;
        const move = (e: PointerEvent) => { resizeColumn(columnId, width + (e.clientX - start) / zoom, history); history = false; };
        const end = () => { target.removeEventListener("pointermove", move); target.removeEventListener("pointerup", end); target.removeEventListener("pointercancel", end); };
        target.addEventListener("pointermove", move); target.addEventListener("pointerup", end); target.addEventListener("pointercancel", end);
      }} />}
      {rowId === TABLE_HEADER && columnId !== TABLE_LABEL && selected && editable && <button data-export-ignore type="button" title="Delete column" aria-label={`Delete column ${table.columns.findIndex(column => column.id === columnId) + 1}`} disabled={table.columns.length <= 1} className="absolute -top-5 right-1 rounded bg-background p-1 text-muted-foreground hover:text-destructive disabled:opacity-30" onClick={() => write(removeTableColumn(current(), columnId))}><Trash2 size={12} /></button>}
    </Cell>;
  };
  const renderRow = (rowId: string) => <tr key={rowId}>{columns.map(columnId => renderCell(rowId, columnId))}</tr>;
  return <div ref={root} className="relative h-full w-full" onFocus={() => {
    if (!editable) return;
    const state = useCanvasStore.getState();
    if (!state.selectedNodeIds.includes(id)) useCanvasStore.setState({ nodes: state.nodes.map(node => ({ ...node, selected: node.id === id })), selectedNodeIds: [id], selectedEdgeIds: [] });
  }} style={{ ...objectRotationStyle("table", data), fontFamily: String(data.fontFamily || defaultFont), fontSize: Number(data.fontSize) || settings.defaultFontSize, fontWeight: data.fontWeight === "bold" ? 700 : undefined, fontStyle: data.fontStyle === "italic" ? "italic" : undefined, color: typeof data.textColor === "string" ? data.textColor : undefined }}>
    {selected && editable && <NodeResizeControl minWidth={minimumWidth} minHeight={(table.rows.length + 1) * 38 + 70} position="bottom-right" onResizeStart={resizeControls.onResizeStart} onResizeEnd={(event, params) => { useCanvasStore.getState().updateNodeData(id, { tableMinHeight: params.height }); resizeControls.onResizeEnd(event, params); }} />}
    <NodeHandles nodeId={id} color={color} selected={selected} />
    {editable && <NodeQuickActions nodeId={id} color={color} selected={selected} />}
    <div className={`flex h-full flex-col rounded-lg border bg-background shadow-sm ${selected ? "ring-2 ring-primary" : ""}`} style={{ borderColor: color, backgroundColor: typeof data.fillColor === "string" ? data.fillColor : undefined }}>
      <table ref={tableElement} className="w-full shrink-0 border-collapse" style={{ tableLayout: "fixed" }} aria-label="Editable table" onKeyDown={event => {
        if (!editable || event.nativeEvent.isComposing) return;
        if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
          if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
          const target = event.target as HTMLElement;
          if (!target.matches('[data-table-input], [role="group"][data-row]')) return;
          const backwards = event.key === "ArrowLeft" || event.key === "ArrowUp";
          if (target instanceof HTMLTextAreaElement && (target.selectionStart !== target.selectionEnd || target.selectionStart !== (backwards ? 0 : target.value.length))) return;
          const cell = target.closest<HTMLElement>("[data-cell-row]");
          if (!cell) return;
          const vertical = event.key === "ArrowUp" || event.key === "ArrowDown";
          let r = rowOrder.indexOf(cell.dataset.cellRow!), c = columns.indexOf(cell.dataset.cellColumn!);
          while (r >= 0 && c >= 0 && r < rowOrder.length && c < columns.length) {
            if (vertical) r += backwards ? -1 : 1; else c += backwards ? -1 : 1;
            if (r < 0 || c < 0 || r >= rowOrder.length || c >= columns.length) break;
            const merge = tableMergeAt(table, { rowId: rowOrder[r], columnId: columns[c] });
            const targetRow = merge?.rowIds[0] ?? rowOrder[r], targetColumn = merge?.columnIds[0] ?? columns[c];
            const nextCell = Array.from(tableElement.current?.querySelectorAll<HTMLElement>("[data-cell-row]") ?? []).find(item => item.dataset.cellRow === targetRow && item.dataset.cellColumn === targetColumn);
            if (nextCell === cell) continue;
            const next = nextCell?.querySelector<HTMLElement>('[data-table-input], [role="group"][data-row]');
            if (next) { event.preventDefault(); event.stopPropagation(); next.focus(); }
            break;
          }
          return;
        }
        if (event.key !== "Tab") return;
        const targets = Array.from(tableElement.current?.querySelectorAll<HTMLElement>('[data-table-input], [role="group"][data-row]') ?? []);
        const index = targets.indexOf(event.target as HTMLElement);
        if (index < 0) return;
        const next = targets[index + (event.shiftKey ? -1 : 1)];
        if (next) { event.preventDefault(); next.focus(); }
        else if (!event.shiftKey && table.rows.length < MAX_TABLE_ROWS) { event.preventDefault(); addRow(); }
      }}>
        <colgroup>{columns.map(columnId => {
          const widths = columns.map(id => id === TABLE_LABEL ? table.labelWidth ?? 120 : table.columns.find(column => column.id === id)?.width ?? 120);
          return <col key={columnId} style={{ width: `${widths[columns.indexOf(columnId)] / widths.reduce((sum, width) => sum + width, 0) * 100}%` }} />;
        })}</colgroup>
        <thead>{table.rows.filter(row => row.aboveHeader).map(row => renderRow(row.id))}{renderRow(TABLE_HEADER)}</thead>
        <tbody>{table.rows.filter(row => !row.aboveHeader && !row.footer).map(row => renderRow(row.id))}</tbody>
        {!!table.rows.some(row => row.footer) && <tfoot>{table.rows.filter(row => row.footer).map(row => renderRow(row.id))}</tfoot>}
      </table>
      {selected && editable && <div ref={toolbar} data-export-ignore role="toolbar" aria-label="Table tools" className={`nodrag nopan nowheel absolute ${toolbarBelow ? "top-full mt-3" : "bottom-full mb-3"} left-0 z-30 flex w-max max-w-[900px] flex-wrap items-center gap-3 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-xl`} style={{ transform: `translate(${toolbarOffset.x}px, ${toolbarOffset.y}px)` }} onPointerDown={event => event.stopPropagation()}>
        <button type="button" aria-label="Move table toolbar" title="Drag toolbar" className="cursor-grab" onPointerDown={event => {
          event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
          const start = { x: event.clientX, y: event.clientY }, origin = toolbarOffset, target = event.currentTarget, zoom = useCanvasStore.getState().viewport.zoom;
          const move = (e: PointerEvent) => setToolbarOffset({ x: origin.x + (e.clientX - start.x) / zoom, y: origin.y + (e.clientY - start.y) / zoom });
          const end = () => { target.removeEventListener("pointermove", move); target.removeEventListener("pointerup", end); target.removeEventListener("pointercancel", end); };
          target.addEventListener("pointermove", move); target.addEventListener("pointerup", end); target.addEventListener("pointercancel", end);
        }}><GripVertical size={16} /></button>
        <QuickTextFormat nodes={[{ id, type: "table", position: { x: 0, y: 0 }, data }]} />
        {selection && <div className="flex items-center gap-2" role="group" aria-label="Column sizing and order">
          <label>Width <input key={`${selection.start.columnId}:${selectedWidth}`} aria-label="Column width" type="number" min={60} max={4000} className="w-16 rounded border bg-background px-1" defaultValue={selectedWidth} onBlur={event => { if (event.target.value) resizeColumn(selection.start.columnId, Number(event.target.value)); }} onKeyDown={event => { event.stopPropagation(); if (event.key === "Enter") event.currentTarget.blur(); }} /></label>
          <button type="button" onClick={() => fitColumn(selection.start.columnId)}>Fit content</button>
          <button type="button" disabled={table.columns.findIndex(column => column.id === selection.start.columnId) <= 0} onClick={() => write(moveTableColumn(current(), selection.start.columnId, -1))}>Move column left</button>
          <button type="button" disabled={selection.start.columnId === TABLE_LABEL || table.columns.at(-1)?.id === selection.start.columnId} onClick={() => write(moveTableColumn(current(), selection.start.columnId, 1))}>Move column right</button>
        </div>}
        <button type="button" disabled={table.rows.length >= MAX_TABLE_ROWS} className="hover:text-foreground disabled:opacity-30" onClick={() => { const next = addTableHeading(current()); write(next); const heading = next.rows.filter(row => row.aboveHeader).at(-1)!; focus(heading.id, next.showRowLabels ? TABLE_LABEL : next.columns[0].id); }}>Add heading</button>
        <button type="button" disabled={table.rows.length >= MAX_TABLE_ROWS} onClick={() => { const next = addTableFooter(current()); write(next); const footer = next.rows.at(-1)!; focus(footer.id, next.showRowLabels ? TABLE_LABEL : next.columns[0].id); }}>Add footer</button>
        <button type="button" disabled={!range || range.rowIds.length * range.columnIds.length < 2} className="hover:text-foreground disabled:opacity-30" onClick={() => { if (selection) write(mergeTableCells(current(), selection.start, selection.end)); }}>Merge cells</button>
        <button type="button" disabled={!selection || !tableMergeAt(table, selection.start)} className="hover:text-foreground disabled:opacity-30" onClick={() => { if (selection) write(splitTableCells(current(), selection.start)); }}>Split cells</button>
        {activeRow && <><label className="flex items-center gap-1"><input type="checkbox" aria-label="Header row" checked={!!activeRow.header} onChange={event => write({ ...current(), rows: current().rows.map(row => row.id === activeRow.id ? { ...row, header: event.target.checked } : row) })} />Header row</label>
          <button type="button" className="hover:text-foreground" onClick={() => addRow(table.rows.findIndex(row => row.id === activeRow.id))}>Insert row below</button>
          <button type="button" disabled={table.rows.length <= 1} className="hover:text-destructive disabled:opacity-30" onClick={() => write(removeTableRow(current(), activeRow.id))}>Delete row</button></>}
        <button type="button" disabled={table.rows.length >= MAX_TABLE_ROWS} className="flex items-center gap-1 hover:text-foreground disabled:opacity-30" onClick={() => addRow()}><Plus size={14} />Add row</button>
        <button type="button" disabled={table.columns.length >= MAX_TABLE_COLUMNS} className="flex items-center gap-1 hover:text-foreground disabled:opacity-30" onClick={() => write(addTableColumn(current()))}><Plus size={14} />Add column</button>
        <label className="flex items-center gap-1"><input type="checkbox" aria-label="Row labels" checked={!!table.showRowLabels} onChange={event => write({ ...current(), showRowLabels: event.target.checked })} />Row labels</label>
        <span>Shift-click cells to select a range · Tab / arrows → navigate · Enter → new line</span>
      </div>}
    </div>
  </div>;
}

export const TableNode = memo(TableNodeComponent);
