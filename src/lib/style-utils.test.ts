import assert from "node:assert/strict";
import test from "node:test";

import {
  automaticNodeTextColor,
  getTextStyle,
  resolveBorderColor,
  resolveFillColor,
  themeAwareNodeFillColor,
} from "./style-utils";

const automaticLayoutStyle = {
  rootId: "root",
  fillColor: "#4f67f6",
  borderColor: "#4262ff",
  textColor: "#111827",
  accentColor: "#4262ff",
  borderWidth: 2,
  borderStyle: "solid" as const,
};

test("a cleared node fill stays transparent instead of falling back to blue", () => {
  assert.equal(resolveFillColor({
    fillColor: "transparent",
    color: "#4f67f6",
    layoutVisualStyle: automaticLayoutStyle,
    layoutAutoFill: false,
  }), "transparent");
});

test("a cleared node border stays transparent instead of falling back to its accent", () => {
  assert.equal(resolveBorderColor({
    borderColor: "transparent",
    color: "#4262ff",
    layoutVisualStyle: automaticLayoutStyle,
    layoutAutoBorder: false,
  }), "transparent");
});

test("automatic text contrasts with opaque light and dark node fills", () => {
  assert.equal(automaticNodeTextColor("#ffffff"), "#111827");
  assert.equal(automaticNodeTextColor("#fef9c3"), "#111827");
  assert.equal(automaticNodeTextColor("#020617"), "#f8fafc");
});

test("automatic text follows the theme for transparent or soft fills", () => {
  assert.equal(automaticNodeTextColor("transparent"), "var(--foreground)");
  assert.equal(automaticNodeTextColor("rgba(255, 255, 255, 0.18)"), "var(--foreground)");
});

test("explicit text colors remain unchanged", () => {
  assert.equal(getTextStyle({ textColor: "#ec4899" }, "#ffffff").color, "#ec4899");
  assert.equal(getTextStyle({}, "#ffffff").color, "#111827");
});

test("opaque node fills are theme toned without changing saved colors", () => {
  assert.equal(
    themeAwareNodeFillColor("#fbbf24"),
    "color-mix(in oklch, #fbbf24 var(--node-opaque-fill-strength, 100%), var(--board-canvas-bg, var(--canvas-bg)))"
  );
});

test("transparent and soft node fills are not darkened", () => {
  assert.equal(themeAwareNodeFillColor("transparent"), "transparent");
  assert.equal(themeAwareNodeFillColor("rgba(251, 191, 36, 0.18)"), "rgba(251, 191, 36, 0.18)");
});
