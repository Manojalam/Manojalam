export interface TableColumn { id: string; name: string }
export interface TableRow { id: string; cells: string[] }
export interface CanvasTable { columns: TableColumn[]; rows: TableRow[] }
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
  const columns = (Array.isArray(source?.columns) && source.columns.length ? source.columns : [{ id: "column_0", name: "Column 1" }]).slice(0, MAX_TABLE_COLUMNS).map((column, index) => ({ id: safeId(column?.id, `column_${index}`), name: typeof column?.name === "string" ? column.name : `Column ${index + 1}` }));
  const rows = (Array.isArray(source?.rows) && source.rows.length ? source.rows : [{ id: "row_0", cells: [] }]).slice(0, MAX_TABLE_ROWS).map((row, index) => ({ id: safeId(row?.id, `row_${index}`), cells: columns.map((_, i) => typeof row?.cells?.[i] === "string" ? row.cells[i] : "") }));
  return { columns, rows };
}

export function addTableRow(table: CanvasTable, after = table.rows.length - 1): CanvasTable {
  if (table.rows.length >= MAX_TABLE_ROWS) return table;
  const rows = [...table.rows];
  rows.splice(Math.max(0, Math.min(rows.length, after + 1)), 0, { id: id(), cells: table.columns.map(() => "") });
  return { ...table, rows };
}
export function addTableColumn(table: CanvasTable): CanvasTable {
  if (table.columns.length >= MAX_TABLE_COLUMNS) return table;
  return { columns: [...table.columns, { id: id(), name: `Column ${table.columns.length + 1}` }], rows: table.rows.map(row => ({ ...row, cells: [...row.cells, ""] })) };
}
export function removeTableRow(table: CanvasTable, rowId: string): CanvasTable {
  return table.rows.length <= 1 ? table : { ...table, rows: table.rows.filter(row => row.id !== rowId) };
}
export function removeTableColumn(table: CanvasTable, columnId: string): CanvasTable {
  const index = table.columns.findIndex(column => column.id === columnId);
  if (index < 0 || table.columns.length <= 1) return table;
  return { columns: table.columns.filter(column => column.id !== columnId), rows: table.rows.map(row => ({ ...row, cells: row.cells.filter((_, i) => i !== index) })) };
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
export function tablePlainText(table: CanvasTable): string {
  return [table.columns.map(column => column.name).join("\t"), ...table.rows.map(row => row.cells.join("\t"))].join("\n");
}
