import assert from "node:assert/strict";
import { test } from "node:test";
import { searchTextOffsets } from "./search-highlight";

test("maps Sanskrit matches and repeated words to original text", () => {
 const text = "गुणत्वम् तथा गुणत्वम्";
 assert.deepEqual(searchTextOffsets(text, "गुणत्वम्").map(([a,b]) => text.slice(a,b)), ["गुणत्वम्", "गुणत्वम्"]);
});
test("preserves offsets through Unicode normalization and collapsed spaces", () => {
 const text = "prefix s\u0301āstra   text suffix";
 const matches = searchTextOffsets(text, " ŚĀSTRA text ");
 assert.equal(matches.length, 1);
 assert.equal(text.slice(...matches[0]), "s\u0301āstra   text");
 assert.deepEqual(searchTextOffsets(text, "  "), []);
});
