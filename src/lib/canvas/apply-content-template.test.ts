import assert from "node:assert/strict";
import test from "node:test";
import { applyContentTemplate, mergeTableTemplate } from "./apply-content-template";
import { newHomeworkTemplate, cardTemplateNodeData } from "./card-templates";
import { normalizeSampleTemplates } from "./sample-templates";
import { applyColumnTemplate, columnSections, updateColumnSections, createTable, tableTemplateDesign, tablePlainText, addTableColumn, removeTableColumn, normalizeTable } from "./table";
import type { Node } from "@xyflow/react";
const card = newHomeworkTemplate("homework");
const node: Node = { id: "selected", type: "table", position: { x: 32, y: 48 }, data: { table: createTable(2, 2) } };
test("apply to table keeps type, geometry, cell IDs, answers and extra columns", () => {
  const current = createTable(4, 8);
  current.rows[0].cells[0] = "Existing answer";
  const source = { ...node, data: { table: current } };
  const updated = applyContentTemplate(source, card, "card");
  assert.equal(updated.id, source.id);
  assert.equal(updated.type, "table");
  assert.deepEqual(updated.position, source.position);
  const result = normalizeTable(updated.data.table);
  assert.equal(result.columns[0].name, current.columns[0].name);
  assert.equal(result.columns[0].card?.template.id, card.id);
  assert.equal(result.columns.length, 8);
  assert.equal(result.rows.length, 4);
  assert.equal(result.rows[0].cells[0], "Existing answer");
  assert.equal(result.rows[0].id, current.rows[0].id);
  assert.equal(result.columns[0].id, current.columns[0].id);
  assert.equal(updated.data.cardTemplateId, undefined);
  assert.equal(current.columns[0].name, "Column 1");
});
test("table design persistence keeps headings and row labels but clears answers", () => {
  const current = createTable(2, 2);
  current.showRowLabels = true;
  current.rows[0].label = "प्रश्नः";
  current.rows[0].cells[0] = "Private answer";
  const design = tableTemplateDesign(current);
  const saved = normalizeSampleTemplates([{ id: "sample", name: "Table", richText: "", labels: [], style: {}, width: 500, height: 200, table: design }])[0];
  assert.deepEqual(saved.table, design);
  assert.equal(saved.table!.rows[0].cells[0], "");
  assert.equal(saved.table!.rows[0].label, "प्रश्नः");
  const expanded = addTableColumn(design);
  assert.equal(removeTableColumn(expanded, expanded.columns[2].id).showRowLabels, true);
  assert.match(tablePlainText(design), /प्रश्नः/);
  assert.equal(mergeTableTemplate(current, design).rows[0].cells[0], "Private answer");
});
test("blank boxes become fillable in place; existing rich text survives and old bindings are cleared", () => {
  const blank = { ...node, type: "shape", data: {} };
  const filled = applyContentTemplate(blank, card, "card");
  assert.equal(filled.id, blank.id);
  assert.equal(filled.data.cardTemplateId, card.id);
  assert.equal(filled.data.freeCardLayout, false);
  const source = { ...blank, data: { text: "Keep me", richText: '<p><strong>Keep me</strong></p>', layerId: "layer", sampleTemplateId: "old", sampleEntries: [] } };
  const updated = applyContentTemplate(source, card, "card");
  assert.equal(updated.data.richText, source.data.richText);
  assert.equal(updated.data.text, source.data.text);
  assert.equal(updated.data.layerId, "layer");
  assert.equal(updated.data.freeCardLayout, true);
  assert.equal(updated.data.sampleTemplateId, undefined);
  assert.equal(updated.data.sampleEntries, undefined);
});
test("locked and unsupported objects cannot be changed", () => {
  const locked = { ...node, data: { ...node.data, locked: true } };
  assert.equal(applyContentTemplate(locked, card, "card"), locked);
  const image = { ...node, type: "image" };
  assert.equal(applyContentTemplate(image, card, "card"), image);
});

test("plain-text content becomes safe rich text so later template edits cannot erase it", () => {
  const source = { ...node, type: "shape", data: { text: "A < B\nSecond line" } };
  const updated = applyContentTemplate(source, card, "card");
  assert.match(String(updated.data.richText), /A &lt; B/);
  assert.match(String(updated.data.richText), /Second line/);
  assert.equal(updated.data.text, source.data.text);
});


test("applying many fields keeps columns as containers without replacing their headings", () => {
  const table = createTable(3, 3);
  table.showRowLabels = true;
  table.rows[0].label = "prathama";
  table.rows[0].cells[0] = "Keep this answer";
  const design = { ...card, style: { ...card.style, fontSize: 22 }, rows: [{ id: "row", indent: 0, fields: Array.from({ length: 9 }, (_, index) => ({ id: `f${index}`, label: `Field ${index}`, color: "", kind: "text" as const })) }] };
  const source = { ...node, style: { width: 660, height: 240 }, data: { table } };
  const result = applyContentTemplate(source, design, "card");
  assert.equal(normalizeTable(result.data.table).columns.length, 3);
  assert.equal(normalizeTable(result.data.table).columns[0].card?.template.rows[0].fields.length, 9);
  assert.ok(Number(result.style?.width) >= 660);
  assert.equal(normalizeTable(result.data.table).rows[0].label, "prathama");
  assert.equal(normalizeTable(result.data.table).rows[0].cells[0], "Keep this answer");
  assert.deepEqual(result.position, source.position);
  assert.equal(applyContentTemplate({ ...source, style: { width: 2000 } }, design, "card").style?.width, 2000);
});


test("saved column-template designs keep independent sections without copying answers", () => {
  let source = applyColumnTemplate(createTable(2, 2), card);
  const sections = columnSections(source, source.columns[0].id);
  sections[0].extraRows = ["Source private answer"];
  source = updateColumnSections(source, source.columns[0].id, sections);
  const destination = createTable(3, 2);
  destination.rows[0].cells[0] = "Existing destination value";
  const result = mergeTableTemplate(destination, tableTemplateDesign(source));
  assert.equal(result.columns[0].card?.template.id, card.id);
  assert.equal(result.columns[0].card?.sections[0].id, "first");
  assert.deepEqual(result.columns[0].card?.sections[0].extraRows, []);
  assert.equal(result.rows[0].cells[0], "Existing destination value");
  assert.equal(result.columns[0].card?.sections.length, 1);
});


test("text templates leave object appearance and geometry alone on apply, fill and redesign", () => {
  for (const type of ["shape", "text", "sticky", "mindmap"]) {
    const appearance = { fillColor: "#123456", fillOpacity: 0.4, borderColor: "#654321", borderWidth: 5, textPadding: 7, textVerticalAlign: "bottom", layoutAutoFill: true, styleTemplateId: "shared-appearance", shadow: "glow" };
    const source = { ...node, type, style: { width: 350, height: 280 }, data: appearance };
    const applied = applyContentTemplate(source, card, "card");
    const filled = { ...applied.data, ...cardTemplateNodeData(card, { question: { text: "प्रश्नः" } }) };
    const redesigned = { ...filled, ...cardTemplateNodeData({ ...card, style: { ...card.style, fillColor: "#ffffff", borderColor: "#ff0000", width: 1200, fontSize: 30 } }, { question: { text: "प्रश्नः" } }) };
    for (const [key, value] of Object.entries(appearance)) {
      assert.equal(applied.data[key], value);
      assert.equal(filled[key as keyof typeof filled], value);
      assert.equal(redesigned[key as keyof typeof redesigned], value);
    }
    assert.deepEqual(applied.style, source.style);
    assert.match(redesigned.richText, /font-size: 30px/);
  }
});
