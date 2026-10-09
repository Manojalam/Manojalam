import assert from "node:assert/strict";
import test from "node:test";
import type { Node } from "@xyflow/react";
import { newHomeworkTemplate, cardTemplateNodeData } from "./card-templates";
import { createTable, normalizeTable } from "./table";
import { copyTemplateContent, pasteTemplateContent, parseTemplateClipboard } from "./template-clipboard";

test("template clipboard transfers independent values between objects and cells without geometry or appearance", () => {
  const template = newHomeworkTemplate("shared");
  const sections = [{ id: "one", values: { question: { text: "भवति", richText: "<strong>भवति</strong>" } }, extraRows: ["extra"] }];
  const source: Node = { id: "source", type: "shape", position: { x: 0, y: 0 }, data: cardTemplateNodeData(template, undefined, undefined, sections) };
  const content = parseTemplateClipboard(JSON.stringify(copyTemplateContent(source, [template])))!;
  assert.deepEqual(content.sections, sections);
  for (const type of ["shape", "text", "sticky", "mindmap"]) {
    const target: Node = { id: type, type, position: { x: 100, y: 100 }, style: { width: 300 }, data: { fillColor: "red", borderColor: "green" } };
    const pasted = pasteTemplateContent(target, content);
    assert.deepEqual(pasted.position, target.position);
    assert.deepEqual(pasted.style, target.style);
    assert.equal(pasted.data.fillColor, "red");
    assert.equal(pasted.data.borderColor, "green");
    assert.deepEqual(copyTemplateContent(pasted, [])!.sections, sections);
  }
  const table = createTable(2, 2);
  const target: Node = { id: "table", type: "table", position: { x: 0, y: 0 }, data: { table } };
  const cell = { rowId: table.rows[0].id, columnId: table.columns[1].id };
  const pasted = pasteTemplateContent(target, content, cell);
  assert.deepEqual(copyTemplateContent(pasted, [], cell), content);
  const result = normalizeTable(pasted.data.table);
  assert.equal(result.rows[1].templates, undefined);
  assert.equal(result.rows[0].templates?.[table.columns[0].id], undefined);
  result.rows[0].templates![cell.columnId].sections[0].values.question.text = "changed";
  assert.equal(content.sections[0].values.question.text, "भवति");
  assert.equal(table.rows[0].templates, undefined);
  assert.equal(pasteTemplateContent(target, content), target);
  const locked = { ...target, data: { ...target.data, locked: true } };
  assert.equal(pasteTemplateContent(locked, content, cell), locked);
});

test("invalid clipboard data is ignored", () => {
  for (const text of ["", "null", "{}", "not json"]) assert.equal(parseTemplateClipboard(text), undefined);
});
