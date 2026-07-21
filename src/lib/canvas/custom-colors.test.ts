import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_CUSTOM_COLORS,
  mergeCustomColors,
  normalizeCustomColors,
  rememberCustomColor,
} from "./custom-colors";

test("merges shared and legacy recent-color lists", () => {
  assert.deepEqual(
    mergeCustomColors(["#AABBCC", "#123456"], ["#aabbcc"], ["#DDEEFF"]),
    ["#aabbcc", "#123456", "#ddeeff"]
  );
});

test("normalizes, validates, and deduplicates saved custom colors", () => {
  assert.deepEqual(
    normalizeCustomColors(["#AABBCC", "bad", "#aabbcc", "#123456"]),
    ["#aabbcc", "#123456"]
  );
});

test("moves the most recently chosen color to the end and enforces the limit", () => {
  const colors = Array.from({ length: MAX_CUSTOM_COLORS }, (_, index) => (
    `#${index.toString(16).padStart(6, "0")}`
  ));
  assert.deepEqual(rememberCustomColor(colors, colors[0]), [...colors.slice(1), colors[0]]);
  assert.deepEqual(rememberCustomColor(colors, "#ffffff"), [...colors.slice(1), "#ffffff"]);
});
