import assert from "node:assert/strict";
import test from "node:test";

import {
  colorInputValue,
  MAX_CUSTOM_COLORS,
  mergeCustomColors,
  normalizeHexColor,
  normalizeCustomColors,
  rememberCustomColor,
  VIVID_CHART_COLORS,
} from "./custom-colors";

test("keeps native color inputs synchronized with the selected color", () => {
  assert.equal(colorInputValue("#AABBCC", "#111827"), "#aabbcc");
  assert.equal(colorInputValue(undefined, "#111827"), "#111827");
  assert.equal(colorInputValue("mixed", "not-a-color"), "#000000");
});

test("accepts exact six-digit hex colors with or without a hash", () => {
  assert.equal(normalizeHexColor("#F0443E"), "#f0443e");
  assert.equal(normalizeHexColor("17A052"), "#17a052");
  assert.equal(normalizeHexColor("#fff"), null);
  assert.equal(normalizeHexColor("not-a-color"), null);
});

test("offers saturated chart colors matching vivid diagram families", () => {
  const colors = new Set<string>(VIVID_CHART_COLORS.map(({ value }) => value));
  for (const color of ["#f0443e", "#dc6425", "#17a052", "#177da6", "#bb2f6c"]) {
    assert.ok(colors.has(color), `Expected vivid chart color ${color}`);
  }
});

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
