import { MAX_TABLE_COLUMNS, MAX_TABLE_ROWS, normalizeTable, type CanvasTable, type TableRow, type TableTemplateContent } from "./table";

export type TableConversion = { kind: "transpose" } | { kind: "reshape"; columns: number; order: "rows" | "columns" };
interface Cell { text: string; template?: TableTemplateContent; label: string; heading: string; width?: number; header: boolean }

/** Move whole cells, including independent template instances. Never truncate an oversized result. */
export function convertTableLayout(source: CanvasTable, operation: TableConversion): { table?: CanvasTable; error?: string } {
  const body = source.rows.filter(row => !row.aboveHeader && !row.footer);
  const count = operation.kind === "transpose" ? body.length : operation.columns;
  if (!Number.isInteger(count) || count < 1 || count > MAX_TABLE_COLUMNS) return { error: `Choose a layout with 1–${MAX_TABLE_COLUMNS} columns. Transpose needs at most ${MAX_TABLE_COLUMNS} body rows.` };
  const sideCount = source.rows.filter(row => row.aboveHeader || row.footer).reduce((sum, row) => sum + Math.ceil(Math.max(1, source.columns.filter((column, i) => row.cells[i] || row.templates?.[column.id]).length) / count), 0);
  const expectedRows = sideCount + (operation.kind === "transpose" ? source.columns.length : Math.ceil(body.length * source.columns.length / count));
  if (expectedRows > MAX_TABLE_ROWS) return { error: `This would create ${expectedRows} rows. The limit is ${MAX_TABLE_ROWS}; use more columns.` };
  const cell = (row: TableRow, column: number): Cell => ({ text: row.cells[column] || "", template: row.templates?.[source.columns[column].id], label: row.label || "", heading: source.columns[column].name, width: source.columns[column].width, header: !!(row.header || row.cellHeaders?.includes(source.columns[column].id)) });
  const unique = (values: string[]) => [...new Set(values.filter(Boolean))].join(" / ");
  const chunks = (cells: Cell[]) => Array.from({ length: Math.ceil(cells.length / count) }, (_, i) => cells.slice(i * count, (i + 1) * count));
  let groups: Cell[][];
  if (operation.kind === "transpose") groups = source.columns.map((_, column) => body.map(row => cell(row, column)));
  else {
    const cells = operation.order === "rows" ? body.flatMap(row => source.columns.map((_, column) => cell(row, column))) : source.columns.flatMap((_, column) => body.map(row => cell(row, column)));
    groups = chunks(cells);
  }
  const columns = Array.from({ length: count }, (_, index) => ({ id: crypto.randomUUID(), name: operation.kind === "transpose" ? body[index].label || `Row ${index + 1}` : unique(groups.map(group => group[index]?.heading || "")) || `Column ${index + 1}`, width: Math.max(120, ...groups.map(group => group[index]?.width || 120)) }));
  const makeRow = (cells: Cell[], flags: Partial<TableRow> = {}): TableRow => ({
    id: crypto.randomUUID(), cells: columns.map((_, i) => cells[i]?.text || ""),
    label: unique(cells.map(value => value.label)),
    ...(cells.length && cells.every(value => value.header) ? { header: true } : {}),
    // Header styling attached to individual cells survives mixing headers with ordinary values.
    cellHeaders: columns.filter((_, i) => cells[i]?.header).map(column => column.id),
    templates: Object.fromEntries(columns.flatMap((column, i) => cells[i]?.template ? [[column.id, structuredClone(cells[i].template)]] : [])),
    ...flags,
  });
  const side = (row: TableRow) => {
    // Spanning headings/footers often contain padding cells; keep every authored value once.
    const cells = source.columns.map((_, column) => cell(row, column)).filter(value => value.text || value.template);
    return chunks(cells.length ? cells : [cell(row, 0)]).map(group => makeRow(group, { aboveHeader: row.aboveHeader, footer: row.footer, header: row.header, label: row.label }));
  };
  const headings = source.rows.filter(row => row.aboveHeader).flatMap(side);
  const footers = source.rows.filter(row => row.footer).flatMap(side);
  const rows = [...headings, ...groups.map((group, index) => makeRow(group, operation.kind === "transpose" ? { label: source.columns[index].name } : {})), ...footers];
  if (rows.length > MAX_TABLE_ROWS) return { error: `This would create ${rows.length} rows. The limit is ${MAX_TABLE_ROWS}; use more columns.` };
  if (!rows.length) return { error: "Add a body row before converting the table." };
  const showRowLabels = operation.kind === "transpose" || source.showRowLabels;
  const sideMerges = [...headings, ...footers].filter(row => row.cells.slice(1).every(value => !value) && columns.slice(1).every(column => !row.templates?.[column.id]) && columns.length > 1).map(row => ({ rowIds: [row.id], columnIds: columns.map(column => column.id) }));
  return { table: normalizeTable({ columns, rows, showRowLabels, labelWidth: source.labelWidth, merges: sideMerges }) };
}
