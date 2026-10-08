import type { BoardCardTemplate, CardSection } from "../types";
import { cardSections, normalizeCardTemplates, renderCardSections } from "./card-templates";
export interface TableTemplateContent { template: BoardCardTemplate; sections: CardSection[]; independent?: true }
export interface TableColumn { id: string; name: string; width?: number; /** Legacy storage, migrated to cells on read. */ card?: TableTemplateContent }
export interface TableRow { id: string; cells: string[]; label?: string; header?: boolean; aboveHeader?: boolean; footer?: boolean; cellHeaders?: string[]; templates?: Record<string, TableTemplateContent> }
export interface TableMerge { rowIds: string[]; columnIds: string[] }
export interface TableAddress { rowId: string; columnId: string }
export interface CanvasTable { columns: TableColumn[]; rows: TableRow[]; showRowLabels?: boolean; labelWidth?: number; merges?: TableMerge[] }
export const TABLE_HEADER = "$table-header";
export const TABLE_LABEL = "$row-label";
export const MAX_TABLE_COLUMNS = 30;
export const MAX_TABLE_ROWS = 500;
const id = () => crypto.randomUUID();

export function createTable(rowCount = 3, columnCount = 3): CanvasTable {
  const columns = Array.from({ length: Math.max(1, Math.min(MAX_TABLE_COLUMNS, Math.floor(columnCount) || 3)) }, (_, i) => ({ id: id(), name: `Column ${i + 1}` }));
  return { columns, rows: Array.from({ length: Math.max(1, Math.min(MAX_TABLE_ROWS, Math.floor(rowCount) || 3)) }, () => ({ id: id(), cells: columns.map(() => "") })) };
}

/** Old columns had one generated section per table row. Keep authored data, drop empty placeholders once. */
function independentSections(card: TableColumn["card"]): CardSection[] {
  const sections = cardSections({ cardSections: card?.sections });
  if (card?.independent) return sections;
  const hasValues = (values: CardSection["values"]) => Object.values(values).some(value => value.text?.trim() || value.href);
  const filled = sections.filter(section => hasValues(section.values) || section.extraRows.some(row => row.trim()) || section.rowRepeats?.some(repeat => hasValues(repeat.values)));
  return filled.length ? filled : [{ id: "first", values: {}, extraRows: [] }];
}

/** Deterministic repair of persisted/imported data; never change valid row IDs. */
export function normalizeTable(value: unknown): CanvasTable {
  const source = value as Partial<CanvasTable> | null;
  const used = new Set<string>();
  const safeId = (value: unknown, fallback: string) => {
    let result = typeof value === "string" && value ? value : fallback;
    while (used.has(result)) result += "_";
    used.add(result); return result;
  };
  const sourceColumns = (Array.isArray(source?.columns) && source.columns.length ? source.columns : [{ id: "column_0", name: "Column 1" }]).slice(0, MAX_TABLE_COLUMNS);
  const columns = sourceColumns.map((column, index) => ({ id: safeId(column?.id, `column_${index}`), name: typeof column?.name === "string" ? column.name : `Column ${index + 1}`, ...(typeof column?.width === "number" && Number.isFinite(column.width) ? { width: Math.max(60, Math.min(4000, column.width)) } : {}) }));
  const rows: TableRow[] = (Array.isArray(source?.rows) && source.rows.length ? source.rows : [{ id: "row_0", cells: [] }]).slice(0, MAX_TABLE_ROWS).map((row, index) => {
    const templates: Record<string, TableTemplateContent> = {};
    columns.forEach((column, i) => {
      const content = row?.templates?.[sourceColumns[i].id];
      const template = normalizeCardTemplates([content?.template])[0];
      if (template) templates[column.id] = { template, sections: independentSections(content), independent: true };
    });
    return { id: safeId(row?.id, `row_${index}`), ...(Array.isArray(row?.cellHeaders) && row.cellHeaders.length ? { cellHeaders: columns.filter((column, i) => row.cellHeaders!.includes(sourceColumns[i].id)).map(column => column.id) } : {}), ...(typeof row?.label === "string" ? { label: row.label } : {}), ...(row?.header === true ? { header: true } : {}), ...(row?.aboveHeader === true ? { aboveHeader: true } : {}), ...(row?.footer === true && !row?.aboveHeader ? { footer: true } : {}), cells: columns.map((_, i) => typeof row?.cells?.[i] === "string" ? row.cells[i] : ""), ...(Object.keys(templates).length ? { templates } : {}) };
  });
  // Recover old column content without changing the table grid or dropping answers.
  sourceColumns.forEach((column, i) => {
    const content = column.card;
    const template = normalizeCardTemplates([content?.template])[0];
    if (!content || !template) return;
    const sections = independentSections(content);
    sections.forEach(section => {
      const row = !content.independent ? rows.find(row => row.id === section.id) ?? rows[0] : rows[0];
      const previous = row.templates?.[columns[i].id];
      row.templates = { ...row.templates, [columns[i].id]: { template, independent: true, sections: [...(previous?.sections ?? []), section] } };
    });
  });
  const table: CanvasTable = { columns, rows, ...(typeof source?.labelWidth === "number" && Number.isFinite(source.labelWidth) ? { labelWidth: Math.max(60, Math.min(4000, source.labelWidth)) } : {}), ...(source?.showRowLabels === true ? { showRowLabels: true } : {}) };
  const rowOrder = tableRowOrder(table);
  const columnOrder = [...(table.showRowLabels ? [TABLE_LABEL] : []), ...columns.map(column => column.id)];
  const merges: TableMerge[] = [];
  for (const merge of Array.isArray(source?.merges) ? source.merges : []) {
    if (!Array.isArray(merge?.rowIds) || !Array.isArray(merge?.columnIds)) continue;
    const rowIds = rowOrder.filter(id => merge.rowIds.includes(id));
    const columnIds = columnOrder.filter(id => merge.columnIds.includes(id));
    if (!rowIds.length || !columnIds.length || rowIds.length * columnIds.length < 2 || crossesTableHeading(table, rowIds)) continue;
    if (rowOrder.indexOf(rowIds.at(-1)!) - rowOrder.indexOf(rowIds[0]) + 1 !== rowIds.length || columnOrder.indexOf(columnIds.at(-1)!) - columnOrder.indexOf(columnIds[0]) + 1 !== columnIds.length) continue;
    if (merges.some(item => item.rowIds.some(id => rowIds.includes(id)) && item.columnIds.some(id => columnIds.includes(id)))) continue;
    merges.push({ rowIds, columnIds });
  }
  return { ...table, ...(merges.length ? { merges } : {}) };
}

export function addTableRow(table: CanvasTable, after = table.rows.length - 1): CanvasTable {
  if (table.rows.length >= MAX_TABLE_ROWS) return table;
  const rows = [...table.rows];
  rows.splice(Math.max(0, Math.min(rows.length, after + 1)), 0, { id: id(), cells: table.columns.map(() => "") });
  return normalizeTable({ ...table, rows });
}
export function addTableColumn(table: CanvasTable): CanvasTable {
  if (table.columns.length >= MAX_TABLE_COLUMNS) return table;
  return { ...table, columns: [...table.columns, { id: id(), name: `Column ${table.columns.length + 1}` }], rows: table.rows.map(row => ({ ...row, cells: [...row.cells, ""] })) };
}
export function removeTableRow(table: CanvasTable, rowId: string): CanvasTable {
  return table.rows.length <= 1 ? table : normalizeTable({ ...table, rows: table.rows.filter(row => row.id !== rowId) });
}
export function removeTableColumn(table: CanvasTable, columnId: string): CanvasTable {
  const index = table.columns.findIndex(column => column.id === columnId);
  if (index < 0 || table.columns.length <= 1) return table;
  return normalizeTable({ ...table, columns: table.columns.filter(column => column.id !== columnId), rows: table.rows.map(row => ({ ...row, templates: Object.fromEntries(Object.entries(row.templates ?? {}).filter(([key]) => key !== columnId)), cells: row.cells.filter((_, i) => i !== index) })) });
}

/** Excel/Sheets TSV, including quoted newlines and escaped quotes. */
export function parseTablePaste(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"' && (quoted || !cell)) {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted;
    } else if (!quoted && (char === "\t" || char === "\n" || char === "\r")) {
      row.push(cell); cell = "";
      if (char !== "\t") { rows.push(row); row = []; if (char === "\r" && text[i + 1] === "\n") i++; }
    } else cell += char;
  }
  row.push(cell);
  if (row.length > 1 || cell || !rows.length) rows.push(row);
  return rows;
}
export function pasteTableCells(table: CanvasTable, rowIndex: number, columnIndex: number, values: string[][]): CanvasTable {
  let next = table;
  const neededRows = Math.min(MAX_TABLE_ROWS, rowIndex + values.length);
  const neededColumns = Math.min(MAX_TABLE_COLUMNS, columnIndex + values.reduce((width, row) => Math.max(width, row.length), 0));
  while (next.columns.length < neededColumns) next = addTableColumn(next);
  while (next.rows.length < neededRows) next = addTableRow(next);
  return { ...next, rows: next.rows.map((row, i) => {
    const input = values[i - rowIndex];
    return input ? { ...row, cells: row.cells.map((cell, j) => input[j - columnIndex] ?? cell) } : row;
  }) };
}
export function tableCellText(table: CanvasTable, rowIndex: number, columnIndex: number): string {
  const row = table.rows[rowIndex];
  const card = row?.templates?.[table.columns[columnIndex]?.id];
  return [row?.cells[columnIndex] ?? "", card ? renderCardSections(card.template, independentSections(card)).text : ""].filter(Boolean).join("\n");
}
export function tablePlainText(table: CanvasTable): string {
  return tableDisplayRows(table).map(row => row.map(cell => cell.text).join("\t")).join("\n");
}

/** The same spans and text order used by the screen, for structured exports. */
export function tableDisplayRows(table: CanvasTable): { text: string; header: boolean; rowspan: number; colspan: number }[][] {
  const columns = [...(table.showRowLabels ? [TABLE_LABEL] : []), ...table.columns.map(column => column.id)];
  const textAt = (rowId: string, columnId: string) => {
    const columnIndex = table.columns.findIndex(column => column.id === columnId);
    if (rowId === TABLE_HEADER) return columnId === TABLE_LABEL ? "Row label" : table.columns[columnIndex].name;
    const rowIndex = table.rows.findIndex(row => row.id === rowId);
    return columnId === TABLE_LABEL ? table.rows[rowIndex].label ?? "" : tableCellText(table, rowIndex, columnIndex);
  };
  return tableRowOrder(table).map(rowId => columns.flatMap(columnId => {
    const merge = tableMergeAt(table, { rowId, columnId });
    if (merge && (merge.rowIds[0] !== rowId || merge.columnIds[0] !== columnId)) return [];
    const text = merge ? merge.rowIds.flatMap(r => merge.columnIds.map(c => textAt(r,c))).filter(Boolean).join("\n") : textAt(rowId,columnId);
    return [{ text, header: rowId === TABLE_HEADER || columnId === TABLE_LABEL || !!table.rows.find(row => row.id === rowId)?.header || !!table.rows.find(row => row.id === rowId)?.cellHeaders?.includes(columnId), rowspan: merge?.rowIds.length ?? 1, colspan: merge?.columnIds.length ?? 1 }];
  }));
}

/** Save structure and headings, never another card's answers. */
export function tableTemplateDesign(value: unknown): CanvasTable {
  const table = normalizeTable(value);
  return { ...table, rows: table.rows.map(row => ({ ...row, cells: row.header ? [...row.cells] : table.columns.map(() => ""), ...(row.templates ? { templates: Object.fromEntries(Object.entries(row.templates).map(([key, content]) => [key, { ...content, sections: [{ id: "first", values: {}, extraRows: [] }] }])) } : {}) })) };
}


/** Include the optional label column and scale readable cells with the chosen font. */
export function tableMinimumWidth(table: CanvasTable, fontSize = 16): number {
  const size = Number.isFinite(fontSize) && fontSize > 0 ? fontSize : 16;
  return Math.ceil(table.columns.reduce((sum, column) => sum + (column.width ?? Math.max(120, size * 6 + 16)), table.showRowLabels ? table.labelWidth ?? Math.max(120, size * 6 + 16) : 0));
}


/** Text templates occupy only the selected cell; structure and object styling are untouched. */
export function applyCellTemplate(table: CanvasTable, template: BoardCardTemplate, columnId?: string, rowId?: string): CanvasTable {
  if (!columnId || !rowId || !table.columns.some(column => column.id === columnId) || !table.rows.some(row => row.id === rowId)) return table;
  return { ...table, rows: table.rows.map(row => row.id !== rowId ? row : { ...row, templates: { ...row.templates, [columnId]: { template: structuredClone(template), independent: true, sections: independentSections(row.templates?.[columnId]) } } }) };
}

export function cellSections(table: CanvasTable, columnId: string, rowId: string): CardSection[] {
  return independentSections(table.rows.find(row => row.id === rowId)?.templates?.[columnId]);
}

export function updateCellSections(table: CanvasTable, columnId: string, rowId: string, sections: CardSection[], template?: BoardCardTemplate): CanvasTable {
  if (!sections.length) return table;
  return { ...table, rows: table.rows.map(row => {
    const content = row.templates?.[columnId];
    return row.id !== rowId || !content ? row : { ...row, templates: { ...row.templates, [columnId]: { ...content, template: structuredClone(template ?? content.template), independent: true, sections: structuredClone(sections) } } };
  }) };
}


export function tableMergeAt(table: CanvasTable, address: TableAddress): TableMerge | undefined {
  return table.merges?.find(merge => merge.rowIds.includes(address.rowId) && merge.columnIds.includes(address.columnId));
}

/** Expand selections around existing spans so merging never leaves overlapping cells. */
export function tableRange(table: CanvasTable, start: TableAddress, end: TableAddress): TableMerge | undefined {
  const rows = tableRowOrder(table);
  const columns = [...(table.showRowLabels ? [TABLE_LABEL] : []), ...table.columns.map(column => column.id)];
  const r = [rows.indexOf(start.rowId), rows.indexOf(end.rowId)], c = [columns.indexOf(start.columnId), columns.indexOf(end.columnId)];
  if ([...r, ...c].some(index => index < 0)) return;
  let top = Math.min(...r), bottom = Math.max(...r), left = Math.min(...c), right = Math.max(...c);
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const merge of table.merges ?? []) {
      const t = rows.indexOf(merge.rowIds[0]), b = rows.indexOf(merge.rowIds.at(-1)!);
      const l = columns.indexOf(merge.columnIds[0]), rr = columns.indexOf(merge.columnIds.at(-1)!);
      if (t > bottom || b < top || l > right || rr < left) continue;
      if (t < top || b > bottom || l < left || rr > right) { top = Math.min(top,t); bottom = Math.max(bottom,b); left = Math.min(left,l); right = Math.max(right,rr); expanded = true; }
    }
  }
  if (crossesTableHeading(table, rows.slice(top, bottom + 1))) return;
  return { rowIds: rows.slice(top, bottom + 1), columnIds: columns.slice(left, right + 1) };
}

export function mergeTableCells(table: CanvasTable, start: TableAddress, end: TableAddress): CanvasTable {
  const range = tableRange(table, start, end);
  if (!range || range.rowIds.length * range.columnIds.length < 2) return table;
  return { ...table, merges: [...(table.merges ?? []).filter(merge => !merge.rowIds.some(id => range.rowIds.includes(id)) || !merge.columnIds.some(id => range.columnIds.includes(id))), range] };
}

export function splitTableCells(table: CanvasTable, address: TableAddress): CanvasTable {
  const merge = tableMergeAt(table, address);
  if (!merge) return table;
  return { ...table, merges: table.merges!.filter(item => item !== merge) };
}

export function tableRowOrder(table: CanvasTable): string[] {
  return [...table.rows.filter(row => row.aboveHeader).map(row => row.id), TABLE_HEADER, ...table.rows.filter(row => !row.aboveHeader && !row.footer).map(row => row.id), ...table.rows.filter(row => row.footer).map(row => row.id)];
}
function crossesTableHeading(table: CanvasTable, rowIds: string[]): boolean {
  const headings = new Set([TABLE_HEADER, ...table.rows.filter(row => row.aboveHeader).map(row => row.id)]);
  const footers = new Set(table.rows.filter(row => row.footer).map(row => row.id));
  return (rowIds.some(id => headings.has(id)) && rowIds.some(id => !headings.has(id))) || (rowIds.some(id => footers.has(id)) && rowIds.some(id => !footers.has(id)));
}
export function addTableHeading(table: CanvasTable): CanvasTable {
  if (table.rows.length >= MAX_TABLE_ROWS) return table;
  const row: TableRow = { id: id(), cells: table.columns.map(() => ""), header: true, aboveHeader: true };
  const next = { ...table, rows: [...table.rows.filter(item => item.aboveHeader), row, ...table.rows.filter(item => !item.aboveHeader)] };
  return mergeTableCells(next, { rowId: row.id, columnId: table.showRowLabels ? TABLE_LABEL : table.columns[0].id }, { rowId: row.id, columnId: table.columns.at(-1)!.id });
}

/** Reorder by identity: cell answers, template instances, and widths travel together. */
export function moveTableColumn(table: CanvasTable, columnId: string, direction: -1 | 1): CanvasTable {
  const from = table.columns.findIndex(column => column.id === columnId), to = from + direction;
  if (from < 0 || to < 0 || to >= table.columns.length) return table;
  const order = table.columns.map((_, index) => index);
  [order[from], order[to]] = [order[to], order[from]];
  return normalizeTable({ ...table, columns: order.map(index => table.columns[index]), rows: table.rows.map(row => ({ ...row, cells: order.map(index => row.cells[index]) })) });
}

export function addTableFooter(table: CanvasTable): CanvasTable {
  if (table.rows.length >= MAX_TABLE_ROWS) return table;
  const row: TableRow = { id: id(), cells: table.columns.map(() => ""), footer: true };
  const next = { ...table, rows: [...table.rows, row] };
  return mergeTableCells(next, { rowId: row.id, columnId: table.showRowLabels ? TABLE_LABEL : table.columns[0].id }, { rowId: row.id, columnId: table.columns.at(-1)!.id });
}
