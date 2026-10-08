import type { BoardCardTemplate, CardSection } from "../types";
import { cardSections, normalizeCardTemplates, renderCardSections } from "./card-templates";
export interface TableTemplateContent { template: BoardCardTemplate; sections: CardSection[]; independent?: true }
export interface TableColumn { id: string; name: string; /** Legacy storage, migrated to cells on read. */ card?: TableTemplateContent }
export interface TableRow { id: string; cells: string[]; label?: string; templates?: Record<string, TableTemplateContent> }
export interface CanvasTable { columns: TableColumn[]; rows: TableRow[]; showRowLabels?: boolean }
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
  const columns = sourceColumns.map((column, index) => ({ id: safeId(column?.id, `column_${index}`), name: typeof column?.name === "string" ? column.name : `Column ${index + 1}` }));
  const rows: TableRow[] = (Array.isArray(source?.rows) && source.rows.length ? source.rows : [{ id: "row_0", cells: [] }]).slice(0, MAX_TABLE_ROWS).map((row, index) => {
    const templates: Record<string, TableTemplateContent> = {};
    columns.forEach((column, i) => {
      const content = row?.templates?.[sourceColumns[i].id];
      const template = normalizeCardTemplates([content?.template])[0];
      if (template) templates[column.id] = { template, sections: independentSections(content), independent: true };
    });
    return { id: safeId(row?.id, `row_${index}`), ...(typeof row?.label === "string" ? { label: row.label } : {}), cells: columns.map((_, i) => typeof row?.cells?.[i] === "string" ? row.cells[i] : ""), ...(Object.keys(templates).length ? { templates } : {}) };
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
  return { columns, rows, ...(source?.showRowLabels === true ? { showRowLabels: true } : {}) };
}

export function addTableRow(table: CanvasTable, after = table.rows.length - 1): CanvasTable {
  if (table.rows.length >= MAX_TABLE_ROWS) return table;
  const rows = [...table.rows];
  rows.splice(Math.max(0, Math.min(rows.length, after + 1)), 0, { id: id(), cells: table.columns.map(() => "") });
  return { ...table, rows };
}
export function addTableColumn(table: CanvasTable): CanvasTable {
  if (table.columns.length >= MAX_TABLE_COLUMNS) return table;
  return { ...table, columns: [...table.columns, { id: id(), name: `Column ${table.columns.length + 1}` }], rows: table.rows.map(row => ({ ...row, cells: [...row.cells, ""] })) };
}
export function removeTableRow(table: CanvasTable, rowId: string): CanvasTable {
  return table.rows.length <= 1 ? table : { ...table, rows: table.rows.filter(row => row.id !== rowId) };
}
export function removeTableColumn(table: CanvasTable, columnId: string): CanvasTable {
  const index = table.columns.findIndex(column => column.id === columnId);
  if (index < 0 || table.columns.length <= 1) return table;
  return { ...table, columns: table.columns.filter(column => column.id !== columnId), rows: table.rows.map(row => ({ ...row, templates: Object.fromEntries(Object.entries(row.templates ?? {}).filter(([key]) => key !== columnId)), cells: row.cells.filter((_, i) => i !== index) })) };
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
  return [[...(table.showRowLabels ? ["Row label"] : []), ...table.columns.map(column => column.name)].join("\t"), ...table.rows.map((row, rowIndex) => [...(table.showRowLabels ? [row.label ?? ""] : []), ...row.cells.map((_, columnIndex) => tableCellText(table, rowIndex, columnIndex))].join("\t"))].join("\n");
}

/** Save structure and headings, never another card's answers. */
export function tableTemplateDesign(value: unknown): CanvasTable {
  const table = normalizeTable(value);
  return { ...table, rows: table.rows.map(row => ({ ...row, cells: table.columns.map(() => ""), ...(row.templates ? { templates: Object.fromEntries(Object.entries(row.templates).map(([key, content]) => [key, { ...content, sections: [{ id: "first", values: {}, extraRows: [] }] }])) } : {}) })) };
}


/** Include the optional label column and scale readable cells with the chosen font. */
export function tableMinimumWidth(table: CanvasTable, fontSize = 16): number {
  const size = Number.isFinite(fontSize) && fontSize > 0 ? fontSize : 16;
  return Math.ceil((table.columns.length + (table.showRowLabels ? 1 : 0)) * Math.max(120, size * 6 + 16));
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
