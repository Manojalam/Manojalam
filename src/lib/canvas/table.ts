import type { BoardCardTemplate, CardSection } from "../types";
import { cardSections, normalizeCardTemplates, renderCardSections } from "./card-templates";
export interface TableColumn { id: string; name: string; card?: { template: BoardCardTemplate; sections: CardSection[] } }
export interface TableRow { id: string; cells: string[]; label?: string }
export interface CanvasTable { columns: TableColumn[]; rows: TableRow[]; showRowLabels?: boolean }
export const MAX_TABLE_COLUMNS = 30;
export const MAX_TABLE_ROWS = 500;
const id = () => crypto.randomUUID();

export function createTable(rowCount = 3, columnCount = 3): CanvasTable {
  const columns = Array.from({ length: Math.max(1, Math.min(MAX_TABLE_COLUMNS, Math.floor(columnCount) || 3)) }, (_, i) => ({ id: id(), name: `Column ${i + 1}` }));
  return { columns, rows: Array.from({ length: Math.max(1, Math.min(MAX_TABLE_ROWS, Math.floor(rowCount) || 3)) }, () => ({ id: id(), cells: columns.map(() => "") })) };
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
  const columns = (Array.isArray(source?.columns) && source.columns.length ? source.columns : [{ id: "column_0", name: "Column 1" }]).slice(0, MAX_TABLE_COLUMNS).map((column, index) => ({ id: safeId(column?.id, `column_${index}`), name: typeof column?.name === "string" ? column.name : `Column ${index + 1}`, ...(normalizeCardTemplates([column?.card?.template])[0] ? { card: { template: normalizeCardTemplates([column?.card?.template])[0], sections: cardSections({ cardSections: column?.card?.sections }) } } : {}) }));
  const rows = (Array.isArray(source?.rows) && source.rows.length ? source.rows : [{ id: "row_0", cells: [] }]).slice(0, MAX_TABLE_ROWS).map((row, index) => ({ id: safeId(row?.id, `row_${index}`), ...(typeof row?.label === "string" ? { label: row.label } : {}), cells: columns.map((_, i) => typeof row?.cells?.[i] === "string" ? row.cells[i] : "") }));
  return { columns, rows, ...(source?.showRowLabels === true ? { showRowLabels: true } : {}) };
}

export function addTableRow(table: CanvasTable, after = table.rows.length - 1): CanvasTable {
  if (table.rows.length >= MAX_TABLE_ROWS) return table;
  const rows = [...table.rows];
  rows.splice(Math.max(0, Math.min(rows.length, after + 1)), 0, { id: id(), cells: table.columns.map(() => "") });
  return { ...table, rows, columns: table.columns.map(column => !column.card ? column : { ...column, card: { ...column.card, sections: rows.map(row => column.card!.sections.find(section => section.id === row.id) ?? { id: row.id, values: {}, extraRows: [] }) } }) };
}
export function addTableColumn(table: CanvasTable): CanvasTable {
  if (table.columns.length >= MAX_TABLE_COLUMNS) return table;
  return { ...table, columns: [...table.columns, { id: id(), name: `Column ${table.columns.length + 1}` }], rows: table.rows.map(row => ({ ...row, cells: [...row.cells, ""] })) };
}
export function removeTableRow(table: CanvasTable, rowId: string): CanvasTable {
  return table.rows.length <= 1 ? table : { ...table, rows: table.rows.filter(row => row.id !== rowId), columns: table.columns.map(column => !column.card ? column : { ...column, card: { ...column.card, sections: column.card.sections.filter(section => section.id !== rowId) } }) };
}
export function removeTableColumn(table: CanvasTable, columnId: string): CanvasTable {
  const index = table.columns.findIndex(column => column.id === columnId);
  if (index < 0 || table.columns.length <= 1) return table;
  return { ...table, columns: table.columns.filter(column => column.id !== columnId), rows: table.rows.map(row => ({ ...row, cells: row.cells.filter((_, i) => i !== index) })) };
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
  const card = table.columns[columnIndex]?.card;
  return [row?.cells[columnIndex] ?? "", card ? renderCardSections(card.template, card.sections.filter(section => section.id === row.id)).text : ""].filter(Boolean).join("\n");
}
export function tablePlainText(table: CanvasTable): string {
  return [[...(table.showRowLabels ? ["Row label"] : []), ...table.columns.map(column => column.name)].join("\t"), ...table.rows.map((row, rowIndex) => [...(table.showRowLabels ? [row.label ?? ""] : []), ...row.cells.map((_, columnIndex) => tableCellText(table, rowIndex, columnIndex))].join("\t"))].join("\n");
}

/** Save structure and headings, never another card's answers. */
export function tableTemplateDesign(value: unknown): CanvasTable {
  const table = normalizeTable(value);
  return { ...table, columns: table.columns.map(column => !column.card ? column : { ...column, card: { ...column.card, sections: table.rows.map(row => ({ id: row.id, values: {}, extraRows: [] })) } }), rows: table.rows.map(row => ({ ...row, cells: table.columns.map(() => "") })) };
}


/** Include the optional label column and scale readable cells with the chosen font. */
export function tableMinimumWidth(table: CanvasTable, fontSize = 16): number {
  const size = Number.isFinite(fontSize) && fontSize > 0 ? fontSize : 16;
  return Math.ceil(table.columns.reduce((width, column) => width + (column.card ? Math.max(260, column.card.template.style.fontSize * 12) : Math.max(120, size * 6 + 16)), table.showRowLabels ? Math.max(120, size * 6 + 16) : 0));
}


/** Apply a fillable design to column bodies, never to their headings or row labels. */
export function applyColumnTemplate(table: CanvasTable, template: BoardCardTemplate, columnId?: string): CanvasTable {
  return { ...table, columns: table.columns.map(column => columnId && column.id !== columnId ? column : {
    ...column, card: { template: structuredClone(template), sections: table.rows.map(row => column.card?.sections.find(section => section.id === row.id) ?? { id: row.id, values: {}, extraRows: [] }) },
  }) };
}

export function columnSections(table: CanvasTable, columnId: string): CardSection[] {
  const card = table.columns.find(column => column.id === columnId)?.card;
  return table.rows.map(row => card?.sections.find(section => section.id === row.id) ?? { id: row.id, values: {}, extraRows: [] });
}

export function updateColumnSections(table: CanvasTable, columnId: string, sections: CardSection[]): CanvasTable {
  if (!table.columns.some(column => column.id === columnId && column.card) || !sections.length) return table;
  let next = table;
  while (next.rows.length < Math.min(sections.length, MAX_TABLE_ROWS)) next = addTableRow(next);
  return { ...next, columns: next.columns.map(column => column.id !== columnId || !column.card ? column : { ...column, card: { ...column.card, sections: next.rows.map((row, index) => ({ ...(sections[index] ?? { values: {}, extraRows: [] }), id: row.id })) } }) };
}
