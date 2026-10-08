import { newHomeworkTemplate } from "./card-templates";
import assert from "node:assert/strict";
import test from "node:test";
import { applyCellTemplate, cellSections, updateCellSections, tableTemplateDesign, addTableColumn, addTableRow, createTable, MAX_TABLE_COLUMNS, MAX_TABLE_ROWS, normalizeTable, parseTablePaste, pasteTableCells, removeTableColumn, removeTableRow, tablePlainText } from "./table";
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


test("cell templates preserve headings and labels with independent, portable answers", () => {
  const source = createTable(2, 2);
  source.showRowLabels = true;
  source.rows[0].label = "Step 1";
  source.rows[0].cells[0] = "Keep existing";
  const template = newHomeworkTemplate("steps");
  let table = applyCellTemplate(source, template, source.columns[0].id, source.rows[0].id);
  const field = template.rows[0].fields[0].id;
  const sections = cellSections(table, table.columns[0].id, table.rows[0].id);
  sections[0].values[field] = { text: "Column one", href: "https://ashtadhyayi.com/sutraani/1.3.1" };
  table = updateCellSections(table, table.columns[0].id, table.rows[0].id, sections);
  assert.equal(cellSections(table, table.columns[1].id, table.rows[0].id)[0].values[field], undefined);
  assert.equal(table.columns[0].name, source.columns[0].name);
  assert.equal(table.rows[0].label, "Step 1");
  assert.equal(table.rows[0].cells[0], "Keep existing");
  assert.deepEqual(normalizeTable(JSON.parse(JSON.stringify(table))), table);
  assert.match(tablePlainText(table), /Column one/);
  const saved = tableTemplateDesign(table);
  assert.equal(saved.rows[0].templates?.[saved.columns[0].id]?.template.id, template.id);
  assert.deepEqual(saved.rows[0].templates?.[saved.columns[0].id]?.sections[0].values, {});
  assert.equal(saved.rows[0].cells[0], "");
});

test("sections are independent of table rows and other columns, including reorder and reload", () => {
  const source = createTable(3, 3);
  let table = applyCellTemplate(source, newHomeworkTemplate("steps"), source.columns[0].id, source.rows[0].id);
  const column = table.columns[0].id;
  assert.equal(cellSections(table, column, table.rows[0].id).length, 1);
  const originalRows = structuredClone(table.rows);
  const otherColumn = structuredClone(table.columns[1]);
  const sections = [...cellSections(table, column, table.rows[0].id), { id: "second", values: {}, extraRows: ["Second step"] }, { id: "third", values: {}, extraRows: [] }, { id: "fourth", values: {}, extraRows: ["Fourth step"] }];
  table = updateCellSections(table, column, table.rows[0].id, sections);
  assert.deepEqual(table.rows.map(row => row.cells), originalRows.map(row => row.cells));
  assert.deepEqual(table.rows.slice(1), originalRows.slice(1));
  assert.deepEqual(table.columns[1], otherColumn);
  assert.deepEqual(cellSections(table, column, table.rows[0].id), sections);
  table = updateCellSections(table, column, table.rows[0].id, [...sections].reverse());
  assert.equal(cellSections(table, column, table.rows[0].id)[0].id, "fourth");
  table = removeTableRow(addTableRow(table, 0), table.rows[1].id);
  assert.deepEqual(cellSections(table, column, table.rows[0].id), [...sections].reverse());
  assert.deepEqual(normalizeTable(JSON.parse(JSON.stringify(table))), table);
  assert.equal(cellSections(table, table.columns[1].id, table.rows[0].id).length, 1);
  assert.equal(tablePlainText(table).split("Second step").length, 2);
  const cleared = clearNodeContent({ table });
  assert.ok(!tablePlainText(normalizeTable(cleared.table)).includes("Second step"));
});

test("legacy row-bound columns keep authored values and remove generated empty sections once", () => {
  const table = createTable(3, 2);
  table.columns[0].card = { template: newHomeworkTemplate("legacy"), sections: table.rows.map(row => ({ id: row.id, values: {}, extraRows: [] })) };
  table.columns[0].card.sections[1].extraRows = ["Keep this"];
  const migrated = normalizeTable(table);
  assert.equal(cellSections(migrated, migrated.columns[0].id, migrated.rows[1].id).length, 1);
  assert.equal(cellSections(migrated, migrated.columns[0].id, migrated.rows[1].id)[0].extraRows[0], "Keep this");
  assert.equal(migrated.columns[0].card, undefined);
  assert.deepEqual(normalizeTable(migrated), migrated);
});


test("legacy spanned column migrates to one cell without merging rows or losing sections", () => {
  const source = createTable(3, 3);
  source.columns[0].card = { template: newHomeworkTemplate("old"), independent: true, sections: [{ id: "a", values: {}, extraRows: ["One"] }, { id: "b", values: {}, extraRows: ["Two"] }] };
  const table = normalizeTable(source);
  assert.equal(table.columns[0].card, undefined);
  assert.equal(table.rows[0].templates?.[table.columns[0].id].sections.length, 2);
  assert.equal(table.rows[1].templates, undefined);
  assert.deepEqual(table.rows.map(row => row.cells), source.rows.map(row => row.cells));
  assert.match(tablePlainText(table), /One/);
  assert.match(tablePlainText(table), /Two/);
  assert.deepEqual(normalizeTable(table), table);
});

test("cells in the same column hold unrelated template instances", () => {
  const source = createTable(3, 2);
  const column = source.columns[0].id;
  const first = source.rows[0].id, second = source.rows[1].id;
  let table = applyCellTemplate(source, newHomeworkTemplate("one"), column, first);
  table = applyCellTemplate(table, newHomeworkTemplate("two"), column, second);
  const other = structuredClone(table.rows[1]);
  table = updateCellSections(table, column, first, [{ id: "a", values: {}, extraRows: ["Only first"] }, { id: "b", values: {}, extraRows: [] }]);
  assert.deepEqual(table.rows[1], other);
  assert.equal(cellSections(table, column, second).length, 1);
  assert.equal(applyCellTemplate(table, newHomeworkTemplate("no target")), table);
});
