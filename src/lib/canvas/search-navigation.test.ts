import assert from "node:assert/strict";
import { test } from "node:test";
import { nextSearchIndex, searchOccurrenceText } from "./search-navigation";
import { searchTextOffsets } from "./search-highlight";

test("next and previous wrap, including one or no matches", () => {
  assert.equal(nextSearchIndex(2, 1, 3), 0);
  assert.equal(nextSearchIndex(0, -1, 3), 2);
  assert.equal(nextSearchIndex(0, 1, 1), 0);
  assert.equal(nextSearchIndex(0, -1, 1), 0);
  assert.equal(nextSearchIndex(0, 1, 0), -1);
});
test("count rendered occurrences, not duplicate rich/plain caches", () => {
  const shape = { text: "word word", richText: "<p>word <strong>word</strong></p>" };
  assert.equal(searchTextOffsets(searchOccurrenceText(shape), "word").length, 2);
  const table = { text: "word word", table: { columns: [{ id: "c", name: "Heading" }], rows: [{ id: "r", cells: ["word word"], richCells: { c: "<p>word word</p>" } }] } };
  assert.equal(searchTextOffsets(searchOccurrenceText(table), "word").length, 2);
});
