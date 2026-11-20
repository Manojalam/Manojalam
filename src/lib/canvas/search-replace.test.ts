import assert from "node:assert/strict";
import test from "node:test";
import { parseHTML, DOMParser } from "linkedom";
import { replaceNodeSearch, replaceSearchText } from "./search-replace";
import { newHomeworkTemplate, renderCardSections } from "./card-templates";
import { boardSearchMatches, boardSearchText } from "./board-search";
const { document } = parseHTML("<html><body></body></html>");
class BrowserParser { parseFromString(value: string) { return new DOMParser().parseFromString(`<html><body>${value}</body></html>`, "text/html"); } }
Object.assign(globalThis, { document, DOMParser: BrowserParser, NodeFilter: { SHOW_TEXT: 4 } });

test("replaces the requested Sanskrit occurrence, supports deletion and literal replacement", () => {
  assert.equal(replaceSearchText("कृतिः कृतिः", "कृति", "प्रकृति", 1).value, "कृतिः प्रकृतिः");
  assert.equal(replaceSearchText("one ONE", "one", "").value, " ");
  assert.equal(replaceSearchText("one", "one", "$&").value, "$&");
});
test("rich replacement preserves marks, links and escapes HTML", () => {
  const result = replaceSearchText('<p><a href="https://example.com/word"><strong>wo</strong><em>rd</em></a> word</p>', "word", "<new>", 0, true);
  assert.equal(result.count, 1);
  assert.match(result.value, /<strong>&lt;new&gt;<\/strong>/);
  assert.match(result.value, /href="https:\/\/example.com\/word"/);
  assert.match(result.value, / word<\/p>/);
});
test("multiple replacements in one text node use original offsets", () => {
  assert.equal(replaceSearchText("<p>word word word</p>", "word", "longer word", undefined, true).value, "<p>longer word longer word longer word</p>");
});
test("table occurrence order handles merged headers and does not replace later cells", () => {
  const data = { table: { columns: [{ id: "a", name: "word" }, { id: "b", name: "word" }], rows: [{ id: "r", cells: ["word", "word"] }], merges: [{ rowIds: ["$table-header"], columnIds: ["a", "b"] }] } };
  const result = replaceNodeSearch(data, "word", "changed", 2);
  const table = result.patch.table as typeof data.table;
  assert.equal(result.count, 1);
  assert.deepEqual(table.rows[0].cells, ["changed", "word"]);
  assert.equal(data.table.rows[0].cells[0], "word", "does not mutate original data");
});
test("plain text aliases and rich-text caches remain synchronized", () => {
  const result = replaceNodeSearch({ text: "word word", label: "word word" }, "word", "new", 1);
  assert.deepEqual(result.patch, { text: "word new", label: "word new" });
  assert.equal(result.count, 1);
  assert.equal(replaceNodeSearch({ text: "word", richText: "<p><b>word</b></p>" }, "word", "new").patch.text, "new");
  assert.equal(replaceNodeSearch({ text: "word", richText: "<p><b>word</b></p>" }, "word", "<new>").patch.text, "<new>");
});
test("literal replacement remains searchable in table content", () => {
  assert.equal(boardSearchMatches(boardSearchText({ table: { columns: [{ name: '<new>' }], rows: [] } }), '<new>'), true);
});
test("table template replacement persists authored field values", () => {
  const template = newHomeworkTemplate('homework');
  const card = { template, independent: true as const, sections: [{ id: 'first', values: { question: { text: 'needle' } }, extraRows: [] }] };
  const data = { table: { columns: [{ id: 'c', name: 'Heading' }], rows: [{ id: 'r', cells: [''], templates: { c: card } }] } };
  const result = replaceNodeSearch(data, 'needle', 'changed');
  assert.equal(result.count, 1);
  const table = result.patch.table as typeof data.table;
  assert.match(renderCardSections(template, table.rows[0].templates.c.sections).text, /changed/);
  assert.equal(card.sections[0].values.question.text, 'needle');
});
