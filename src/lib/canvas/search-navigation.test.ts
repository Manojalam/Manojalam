import assert from "node:assert/strict";
import { test } from "node:test";
import { nextSearchIndex, searchOccurrenceText, orderSearchResults } from "./search-navigation";
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

test("matches follow top-to-bottom then left-to-right order, not creation order", () => {
  const nodes = [
    { id: "bottom", position: { x: 0, y: 500 }, data: {} },
    { id: "right", position: { x: 500, y: 100 }, data: {} },
    { id: "left", position: { x: 0, y: 100 }, data: {} },
    { id: "top", position: { x: 800, y: 0 }, data: {} },
  ];
  const ids = nodes.map(node => node.id);
  assert.deepEqual(orderSearchResults(ids, nodes, []), ["top", "left", "right", "bottom"]);
  assert.deepEqual(orderSearchResults([...ids].reverse(), [...nodes].reverse(), []), ["top", "left", "right", "bottom"]);
  assert.deepEqual(ids, ["bottom", "right", "left", "top"]);
});
test("uses board coordinates for nested nodes and non-default origins", () => {
  const nodes = [
    { id: "group", position: { x: 100, y: 1000 }, data: {} },
    { id: "nested", parentId: "group", position: { x: 0, y: 0 }, data: {} },
    { id: "visible-first", position: { x: 0, y: 500 }, data: {} },
    { id: "centered", position: { x: 0, y: 600 }, width: 100, height: 400, origin: [0.5, 0.5] as [number, number], data: {} },
  ];
  assert.deepEqual(orderSearchResults(["nested", "visible-first", "centered"], nodes, []), ["centered", "visible-first", "nested"]);
});
