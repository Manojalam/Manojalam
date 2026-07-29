import assert from "node:assert/strict";
import test from "node:test";

import {
  arrangeColorPalette,
  COLOR_SWATCH_GROUPS,
  colorInputValue,
  colorSwatchHex,
  colorSwatchMatches,
  colorsUsedOnBoard,
  extractColorSwatches,
  forgetCustomColor,
  GENERAL_COLOR_PALETTE,
  hexToHsv,
  hexToRgb,
  hsvToHex,
  isMetallicColor,
  MAX_CUSTOM_COLORS,
  METALLIC_COLORS,
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

test("matches the active swatch after normalizing exact colors", () => {
  assert.equal(colorSwatchMatches("#4F9DA7", "#4f9da7"), true);
  assert.equal(colorSwatchMatches("4f9da7", "#4F9DA7"), true);
  assert.equal(colorSwatchMatches("hsl(184, 54%, 58%)", "#5ac6ce"), true);
  assert.equal(colorSwatchMatches("#4f9da7", "#3b82f6"), false);
  assert.equal(colorSwatchMatches("#4f9da7", "#4f9da7", true), false);
});

test("converts generated HSL and RGB fills into visible hex swatches", () => {
  assert.equal(colorSwatchHex("hsl(0, 100%, 50%)"), "#ff0000");
  assert.equal(colorSwatchHex("hsl(184, 54%, 58%)"), "#5ac6ce");
  assert.equal(colorSwatchHex("rgb(40, 120, 255)"), "#2878ff");
  assert.equal(colorSwatchHex("rgba(40, 120, 255, 0.42)"), "#2878ff");
  assert.equal(colorSwatchHex("transparent"), null);
});

test("extracts colors embedded in rich text and composite styles", () => {
  assert.deepEqual(
    extractColorSwatches(
      "color:#FF0000;background:linear-gradient(rgb(0, 255, 0), hsl(240, 100%, 50%))"
    ),
    ["#ff0000", "#00ff00", "#0000ff"]
  );
});

test("collects board colors once and returns them in neutral then hue order", () => {
  const nodes = [{
    data: {
      fillColor: "#00ff00",
      html: "<span style=\"color:#FF0000\">Text</span>",
      borderColor: "#ffffff",
    },
  }];
  const edges = [{
    style: { stroke: "rgb(0, 0, 255)" },
    data: { labelStyle: { textColor: "#ff0000" } },
  }];

  assert.deepEqual(
    colorsUsedOnBoard(nodes, edges),
    ["#ffffff", "#ff0000", "#00ff00", "#0000ff"]
  );
  assert.equal(colorsUsedOnBoard(nodes, edges), colorsUsedOnBoard(nodes, edges));
});

test("offers general bright, light, strong, neutral, and metallic swatches", () => {
  assert.deepEqual(
    COLOR_SWATCH_GROUPS.map(({ name }) => name),
    ["Bright", "Light", "Strong", "Neutral", "Metallic"]
  );
  assert.ok(COLOR_SWATCH_GROUPS[0].colors.includes("#16b364"));
  assert.ok(COLOR_SWATCH_GROUPS[1].colors.includes("#c9f3d8"));
  assert.ok(COLOR_SWATCH_GROUPS[2].colors.includes("#087f5b"));
  assert.ok(COLOR_SWATCH_GROUPS[3].colors.includes("#ffffff"));
  assert.ok(COLOR_SWATCH_GROUPS[4].colors.includes("#d4af37"));
  assert.ok(COLOR_SWATCH_GROUPS[4].colors.includes("#c0c0c0"));
  assert.ok(COLOR_SWATCH_GROUPS[4].colors.includes("#2a3439"));
  assert.equal(COLOR_SWATCH_GROUPS[4].colors, METALLIC_COLORS);
});

test("offers a condensed direct palette with distinct, neutral, and metallic colors", () => {
  assert.ok(GENERAL_COLOR_PALETTE.includes("#ffffff"));
  assert.ok(GENERAL_COLOR_PALETTE.includes("#ff3b30"));
  assert.ok(GENERAL_COLOR_PALETTE.includes("#16b364"));
  assert.ok(GENERAL_COLOR_PALETTE.includes("#2878ff"));
  assert.ok(METALLIC_COLORS.every((color) => GENERAL_COLOR_PALETTE.includes(color)));
  assert.equal(new Set(GENERAL_COLOR_PALETTE).size, GENERAL_COLOR_PALETTE.length);
});

test("recognizes metallic swatches without treating nearby custom colors as metal", () => {
  assert.equal(isMetallicColor("#D4AF37"), true);
  assert.equal(isMetallicColor("#c0c0c0"), true);
  assert.equal(isMetallicColor("#c0c0c1"), false);
  assert.equal(isMetallicColor("not-a-color"), false);
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

test("removes only the requested saved color", () => {
  assert.deepEqual(
    forgetCustomColor(["#AABBCC", "#123456", "#abcdef"], "#aabbcc"),
    ["#123456", "#abcdef"]
  );
  assert.deepEqual(
    forgetCustomColor(["#aabbcc"], "not-a-color"),
    ["#aabbcc"]
  );
});
