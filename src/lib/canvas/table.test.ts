import assert from "node:assert/strict";
import test from "node:test";
import { addTableColumn, addTableRow, createTable, MAX_TABLE_COLUMNS, MAX_TABLE_ROWS, normalizeTable, parseTablePaste, pasteTableCells, removeTableColumn, removeTableRow, tablePlainText } from "./table";
import { normalizePersistedNode } from "./node-persistence";
import { editableNodeText } from "../export/powerpoint-layout";
import { clearNodeContent } from "./clipboard";
import { buildOutlineDocument, serializeOutlineText } from "../export/outline";
import type { VidyaBoard } from "../types";

test("row/column changes retain cell alignment and identities without mutating previous history", () => {
  const original = pasteTableCells(createTable(2, 2), 0, 0, [["a", "b"], ["c", "d"]]);
  const added = addTableRow(addTableColumn(original), 0);
  assert.deepEqual(added.rows.map(row => row.cells), [["a", "b", ""], ["", "", ""], ["c", "d", ""]]);
  assert.equal(added.rows[2].id, original.rows[1].id);
  const removed = removeTableColumn(removeTableRow(added, added.rows[1].id), added.columns[0].id);
  assert.deepEqual(removed.rows.map(row => row.cells), [["b", ""], ["d", ""]]);
  assert.deepEqual(original.rows.map(row => row.cells), [["a", "b"], ["c", "d"]]);
  assert.equal(removeTableColumn(createTable(1, 1), "missing").columns.length, 1);
  const smallest = createTable(1, 1);
  assert.equal(removeTableRow(smallest, smallest.rows[0].id), smallest);
  assert.equal(removeTableColumn(smallest, smallest.columns[0].id), smallest);
});

test("spreadsheet paste expands from the active cell and preserves surrounding content", () => {
  const original = pasteTableCells(createTable(2, 2), 0, 0, [["keep", "other"], ["left", "replace"]]);
  const next = pasteTableCells(original, 1, 1, parseTablePaste('एक\t"two\nlines"\r\nthree\t"say ""yes"""\r\n'));
  assert.equal(next.columns.length, 3);
  assert.deepEqual(next.rows.map(row => row.cells), [["keep", "other", ""], ["left", "एक", "two\nlines"], ["", "three", 'say "yes"']]);
  assert.equal(original.rows.length, 2);
  assert.deepEqual(parseTablePaste("a\tb\t\nc\td\t\n"), [["a", "b", ""], ["c", "d", ""]]);
});

test("persisted tables repair malformed cells and duplicate IDs deterministically", () => {
  const input = { columns: [{ id: "same", name: "Sūtra" }, { id: "same", name: "Meaning" }], rows: [{ id: "same", cells: ["3.4.89", "मेर्निः", "extra"] }, null, { cells: [42] }] };
  const table = normalizeTable(input);
  assert.deepEqual(normalizeTable(input), table);
  assert.equal(new Set([...table.columns, ...table.rows].map(item => item.id)).size, 5);
  assert.deepEqual(table.rows.map(row => row.cells), [["3.4.89", "मेर्निः"], ["", ""], ["", ""]]);
  const node = { id: "table", type: "table", position: { x: 0, y: 0 }, data: { table }, style: { width: 600 }, selected: true, measured: { width: 600, height: 240 } };
  const restored = JSON.parse(JSON.stringify(normalizePersistedNode(node)));
  assert.deepEqual(restored.data.table, table);
  assert.equal(restored.selected, undefined);
  assert.equal(editableNodeText(restored), tablePlainText(table));
});

test("table growth stops at supported bounds", () => {
  const full = createTable(MAX_TABLE_ROWS, MAX_TABLE_COLUMNS);
  assert.equal(addTableRow(full), full);
  assert.equal(addTableColumn(full), full);
  const pasted = pasteTableCells(full, MAX_TABLE_ROWS - 1, MAX_TABLE_COLUMNS - 1, [["last", "overflow"], ["overflow"]]);
  assert.equal(pasted.rows.length, MAX_TABLE_ROWS);
  assert.equal(pasted.columns.length, MAX_TABLE_COLUMNS);
  assert.equal(pasted.rows.at(-1)?.cells.at(-1), "last");
});

test("clearing a table keeps its reusable column pattern and outline export retains every value", () => {
  const table = pasteTableCells(createTable(2, 2), 0, 0, [["मेर्निः", "Meaning one"], ["3.4.89", "Meaning two"]]);
  const cleared = clearNodeContent({ table, text: tablePlainText(table) }).table as typeof table;
  assert.deepEqual(cleared.columns, table.columns);
  assert.deepEqual(cleared.rows.map(row => row.cells), [["", ""], ["", ""]]);
  assert.equal(cleared.rows[1].id, table.rows[1].id);
  assert.equal(table.rows[0].cells[0], "मेर्निः");
  const board = { title: "Table", content: { nodes: [{ id: "table", type: "table", position: { x: 0, y: 0 }, data: { table } }], edges: [] } } as unknown as VidyaBoard;
  const outline = serializeOutlineText(buildOutlineDocument(board));
  assert.match(outline, /मेर्निः/);
  assert.match(outline, /Meaning two/);
});
