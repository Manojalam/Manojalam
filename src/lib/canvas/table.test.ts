import { tableRowOrder, moveTableColumn, addTableFooter } from "./table";
import { newHomeworkTemplate } from "./card-templates";
import assert from "node:assert/strict";
import test from "node:test";
import { addTableHeading, tableDisplayRows, TABLE_HEADER, TABLE_LABEL, mergeTableCells, splitTableCells, tableMergeAt, tableRange, applyCellTemplate, cellSections, updateCellSections, tableTemplateDesign, addTableColumn, addTableRow, createTable, MAX_TABLE_COLUMNS, MAX_TABLE_ROWS, normalizeTable, parseTablePaste, pasteTableCells, removeTableColumn, removeTableRow, tablePlainText } from "./table";
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


test("explicit rectangle merges retain all values, templates and restore cells on split", () => {
  const original = createTable(3,3);
  original.rows[0].cells[0] = "भू";
  original.rows[1].cells[1] = "लट्";
  const table = applyCellTemplate(original, newHomeworkTemplate("sutra"), original.columns[1].id, original.rows[0].id);
  const start = { rowId: table.rows[0].id, columnId: table.columns[0].id };
  const end = { rowId: table.rows[1].id, columnId: table.columns[1].id };
  const merged = mergeTableCells(table,start,end);
  assert.deepEqual(merged.rows,table.rows);
  assert.deepEqual(merged.columns,table.columns);
  assert.equal(merged.merges?.[0].rowIds.length,2);
  assert.equal(merged.merges?.[0].columnIds.length,2);
  const display = tableDisplayRows(merged);
  assert.equal(display[1][0].rowspan,2);
  assert.equal(display[1][0].colspan,2);
  assert.match(display[1][0].text,/भू\nलट्/);
  assert.equal(display[2].length,1);
  assert.deepEqual(normalizeTable(JSON.parse(JSON.stringify(merged))),merged);
  const split = splitTableCells(merged,end);
  assert.deepEqual(split.rows,table.rows);
  assert.equal(split.merges?.length,0);
  assert.equal(tableDisplayRows(split)[2].length,3);
});

test("dynamic headings appear before column headers and survive save as design", () => {
  const table = createTable(2,3); table.showRowLabels = true;
  const next = addTableHeading(addTableHeading(table));
  const headings = next.rows.filter(row => row.aboveHeader);
  headings[0].label = "भू लट् परस्मैपदम्";
  headings[1].label = "Second heading";
  const display = tableDisplayRows(next);
  assert.equal(display[0][0].text,headings[0].label);
  assert.equal(display[0][0].colspan,4);
  assert.equal(display[1][0].text,"Second heading");
  assert.equal(display[2][1].text,"Column 1");
  assert.equal(tableTemplateDesign(next).rows[0].label,headings[0].label);
  assert.equal(tableRange(next,{rowId:headings[0].id,columnId:TABLE_LABEL},{rowId:table.rows[0].id,columnId:table.columns[0].id}),undefined);
});

test("span repair never drops contents and rejects overlaps or invalid rectangles", () => {
  let table = createTable(3,3);
  const address = {rowId:table.rows[0].id,columnId:table.columns[0].id};
  table = mergeTableCells(table,address,{rowId:table.rows[1].id,columnId:table.columns[1].id});
  const expanded = mergeTableCells(table,{rowId:table.rows[1].id,columnId:table.columns[1].id},{rowId:table.rows[2].id,columnId:table.columns[2].id});
  assert.equal(expanded.merges?.length,1);
  assert.equal(expanded.merges?.[0].rowIds.length,3);
  assert.equal(expanded.merges?.[0].columnIds.length,3);
  assert.equal(normalizeTable({...table,merges:[...table.merges!,...table.merges!]}).merges?.length,1);
  assert.equal(tableMergeAt(removeTableRow(table,table.rows[0].id),{rowId:table.rows[1].id,columnId:table.columns[0].id})?.rowIds.length,1);
  assert.equal(addTableRow(table,0).merges,undefined);
  const top = mergeTableCells(table,{rowId:TABLE_HEADER,columnId:table.columns[0].id},{rowId:TABLE_HEADER,columnId:table.columns[2].id});
  assert.equal(tableDisplayRows(top)[0][0].colspan,3);
});


test("column widths and order retain each cell's values and template identity", () => {
  const original = createTable(2, 3);
  original.columns[0].width = 90; original.columns[1].width = 310;
  original.rows[0].cells = ["one", "two", "three"];
  const moved = moveTableColumn(normalizeTable(original), original.columns[0].id, 1);
  assert.equal(moved.columns[1].id, original.columns[0].id);
  assert.equal(moved.columns[1].width, 90);
  assert.deepEqual(moved.rows[0].cells, ["two", "one", "three"]);
});

test("optional footer remains after the body and cannot merge across body rows", () => {
  const original = createTable(2, 3);
  const table = addTableFooter(original);
  const footer = table.rows.at(-1)!;
  assert.equal(footer.footer, true);
  assert.equal(tableRowOrder(table).at(-1), footer.id);
  assert.equal(normalizeTable(table).rows.at(-1)!.footer, true);
  assert.deepEqual(mergeTableCells(table, { rowId: table.rows[0].id, columnId: table.columns[0].id }, { rowId: footer.id, columnId: table.columns[0].id }), table);
});
