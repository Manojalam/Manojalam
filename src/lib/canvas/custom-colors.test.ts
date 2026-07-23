import assert from "node:assert/strict";
import test from "node:test";

import {
  arrangeColorPalette,
  COLOR_SWATCH_GROUPS,
  colorInputValue,
  hexToHsv,
  hexToRgb,
  hsvToHex,
  MAX_CUSTOM_COLORS,
  mergeCustomColors,
  normalizeHexColor,
  normalizeCustomColors,
  rememberCustomColor,
  rgbToHex,
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

test("offers general bright, light, strong, and neutral swatches", () => {
  assert.deepEqual(
    COLOR_SWATCH_GROUPS.map(({ name }) => name),
    ["Bright", "Light", "Strong", "Neutral"]
  );
  assert.ok(COLOR_SWATCH_GROUPS[0].colors.includes("#16b364"));
  assert.ok(COLOR_SWATCH_GROUPS[1].colors.includes("#c9f3d8"));
  assert.ok(COLOR_SWATCH_GROUPS[2].colors.includes("#087f5b"));
  assert.ok(COLOR_SWATCH_GROUPS[3].colors.includes("#ffffff"));
});

test("converts exact colors between hex, RGB, and HSV", () => {
  assert.deepEqual(hexToRgb("#2878ff"), { r: 40, g: 120, b: 255 });
  assert.equal(rgbToHex({ r: 40, g: 120, b: 255 }), "#2878ff");
  assert.equal(hsvToHex({ h: 0, s: 100, v: 100 }), "#ff0000");
  assert.equal(hsvToHex({ h: 120, s: 100, v: 100 }), "#00ff00");
  const blue = hexToHsv("#0000ff");
  assert.ok(blue);
  assert.equal(Math.round(blue.h), 240);
  assert.equal(Math.round(blue.s), 100);
  assert.equal(Math.round(blue.v), 100);
});

test("arranges palette colors as neutrals followed by the hue wheel", () => {
  assert.deepEqual(
    arrangeColorPalette([
      "#0000ff",
      "#ff00ff",
      "#000000",
      "#00ff00",
      "#808080",
      "#ff0000",
      "#ffffff",
      "#ffff00",
    ]),
    [
      "#ffffff",
      "#808080",
      "#000000",
      "#ff0000",
      "#ffff00",
      "#00ff00",
      "#0000ff",
      "#ff00ff",
    ]
  );
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
