import { newHomeworkTemplate } from "./card-templates";
import assert from "node:assert/strict";
import test from "node:test";
import { applyColumnTemplate, columnSections, updateColumnSections, tableTemplateDesign, addTableColumn, addTableRow, createTable, MAX_TABLE_COLUMNS, MAX_TABLE_ROWS, normalizeTable, parseTablePaste, pasteTableCells, removeTableColumn, removeTableRow, tablePlainText } from "./table";
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


test("column templates preserve headings and labels with independent, portable answers", () => {
  const source = createTable(2, 2);
  source.showRowLabels = true;
  source.rows[0].label = "Step 1";
  source.rows[0].cells[0] = "Keep existing";
  const template = newHomeworkTemplate("steps");
  let table = applyColumnTemplate(source, template);
  const field = template.rows[0].fields[0].id;
  const sections = columnSections(table, table.columns[0].id);
  sections[0].values[field] = { text: "Column one", href: "https://ashtadhyayi.com/sutraani/1.3.1" };
  table = updateColumnSections(table, table.columns[0].id, sections);
  assert.equal(columnSections(table, table.columns[1].id)[0].values[field], undefined);
  assert.equal(table.columns[0].name, source.columns[0].name);
  assert.equal(table.rows[0].label, "Step 1");
  assert.equal(table.rows[0].cells[0], "Keep existing");
  assert.deepEqual(normalizeTable(JSON.parse(JSON.stringify(table))), table);
  assert.match(tablePlainText(table), /Column one/);
  const saved = tableTemplateDesign(table);
  assert.equal(saved.columns[0].card?.template.id, template.id);
  assert.deepEqual(saved.columns[0].card?.sections[0].values, {});
  assert.equal(saved.rows[0].cells[0], "");
});

test("column-only application and row insertion/deletion keep values attached to rows", () => {
  let table = createTable(2, 2);
  const template = newHomeworkTemplate("steps");
  table = applyColumnTemplate(table, template, table.columns[1].id);
  assert.equal(table.columns[0].card, undefined);
  const sections = columnSections(table, table.columns[1].id);
  sections[1].extraRows = ["Keep my second step"];
  table = updateColumnSections(table, table.columns[1].id, sections);
  const second = table.rows[1].id;
  table = addTableRow(table, 0);
  assert.equal(columnSections(table, table.columns[1].id)[2].extraRows[0], "Keep my second step");
  table = removeTableRow(table, table.rows[1].id);
  assert.equal(columnSections(table, table.columns[1].id)[1].id, second);
  assert.equal(columnSections(table, table.columns[1].id)[1].extraRows[0], "Keep my second step");
  const cleared = clearNodeContent({ table });
  assert.ok(!tablePlainText(normalizeTable(cleared.table)).includes("Keep my second step"));
});
