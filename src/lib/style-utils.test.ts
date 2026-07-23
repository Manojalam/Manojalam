import assert from "node:assert/strict";
import test from "node:test";

import {
  automaticNodeTextColor,
  colorWithOpacity,
  getTextStyle,
  lightenColor,
  resolveBorderColor,
  resolveEffectiveFillOpacity,
  resolveFillColor,
  resolveFillSourceColor,
  themeAwareLayoutConnectorColor,
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

test("fill controls report the effective automatic color and opacity", () => {
  const data = {
    fillColor: "#ec4899",
    fillOpacity: 0.18,
    layoutVisualStyle: automaticLayoutStyle,
  };
  assert.equal(resolveFillSourceColor(data), automaticLayoutStyle.fillColor);
  assert.equal(resolveEffectiveFillOpacity(data), 1);
});

test("fill controls report explicit manual color and opacity", () => {
  const data = {
    fillColor: "#ec4899",
    fillOpacity: 0.42,
    layoutVisualStyle: automaticLayoutStyle,
    layoutAutoFill: false,
  };
  assert.equal(resolveFillSourceColor(data), "#ec4899");
  assert.equal(resolveEffectiveFillOpacity(data), 0.42);
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

test("opaque node fills remain exact in every theme", () => {
  assert.equal(themeAwareNodeFillColor("#fbbf24"), "#fbbf24");
});

test("transparent and soft node fills are not darkened", () => {
  assert.equal(themeAwareNodeFillColor("transparent"), "transparent");
  assert.equal(themeAwareNodeFillColor("rgba(251, 191, 36, 0.18)"), "rgba(251, 191, 36, 0.18)");
});

test("opacity applies to generated HSL fills instead of only hex colors", () => {
  assert.equal(colorWithOpacity("hsl(184, 54%, 58%)", 0.42), "rgba(90, 198, 206, 0.42)");
  assert.equal(resolveFillColor({
    fillColor: "hsl(184, 54%, 58%)",
    fillOpacity: 0.42,
    layoutAutoFill: false,
  }), "rgba(90, 198, 206, 0.42)");
});

test("generated hierarchy connectors mix toward the active theme foreground", () => {
  assert.equal(
    themeAwareLayoutConnectorColor("#4262ff"),
    "color-mix(in srgb, #4262ff 62%, var(--foreground))"
  );
});

test("lightens a border color into a pale matching fill", () => {
  assert.equal(lightenColor("#4262ff"), "#d5dcff");
  assert.equal(lightenColor("transparent"), "transparent");
});
