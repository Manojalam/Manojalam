import assert from "node:assert/strict";
import test from "node:test";
import { surfaceEffectStyle } from "./canvas/surface-effects";

import {
  automaticNodeTextColor,
  borderMatchedFillColor,
  borderMatchedFillPatch,
  colorWithOpacity,
  getTextStyle,
  lightenColor,
  resolveBorderColor,
  resolveBorderStyle,
  resolveBorderWidth,
  resolveEffectiveFillOpacity,
  resolveFillColor,
  resolveFillSourceColor,
  resolveLayoutFillGradient,
  resolveSurfaceEffectData,
  stickyNoteFoldColor,
  themeAwareLayoutConnectorColor,
  themeAwareNodeFillColor,
} from "./style-utils";

const automaticLayoutStyle = {
  rootId: "root",
  fillColor: "#4f67f6",
  fillGradient: "linear-gradient(100deg, #312e81, #701a75)",
  borderColor: "#4262ff",
  textColor: "#111827",
  accentColor: "#4262ff",
  borderWidth: 2,
  borderStyle: "solid" as const,
};

test("generated root gradients render only while the layout owns the fill", () => {
  assert.equal(
    resolveLayoutFillGradient({ layoutVisualStyle: automaticLayoutStyle }),
    automaticLayoutStyle.fillGradient
  );
  assert.equal(
    resolveLayoutFillGradient({
      layoutVisualStyle: automaticLayoutStyle,
      layoutAutoFill: false,
    }),
    undefined
  );
});

test("generated surface effects render only while the layout owns the fill", () => {
  const metallicLayoutStyle = {
    ...automaticLayoutStyle,
    surfaceEffect: "metallic" as const,
    surfaceEffectDepth: 6,
    surfaceEffectStrength: 54,
    surfaceEffectAngle: 20,
  };
  assert.deepEqual(
    resolveSurfaceEffectData({
      surfaceEffect: "glow",
      layoutVisualStyle: metallicLayoutStyle,
    }),
    {
      surfaceEffect: "metallic",
      surfaceEffectDepth: 6,
      surfaceEffectStrength: 54,
      surfaceEffectAngle: 20,
      layoutVisualStyle: metallicLayoutStyle,
    }
  );
  const generatedEffectStyle = surfaceEffectStyle(
    resolveSurfaceEffectData({ layoutVisualStyle: metallicLayoutStyle })
  );
  assert.match(generatedEffectStyle.backgroundImage ?? "", /linear-gradient/);
  assert.equal(generatedEffectStyle.backgroundBlendMode, "overlay,soft-light");

  const manualEffect = {
    surfaceEffect: "glow",
    layoutVisualStyle: metallicLayoutStyle,
    layoutAutoFill: false,
  };
  assert.equal(resolveSurfaceEffectData(manualEffect), manualEffect);
});

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

test("Matrix divisions do not override user-controlled shape borders", () => {
  assert.equal(resolveBorderWidth({
    matrixCell: true,
    layoutVisualStyle: automaticLayoutStyle,
  }), 0);
  assert.equal(resolveBorderWidth({
    borderWidth: 3,
    layoutAutoBorder: false,
    matrixCell: true,
  }), 3);
  assert.equal(resolveBorderColor({
    borderColor: "transparent",
    layoutAutoBorder: false,
    layoutVisualStyle: automaticLayoutStyle,
    matrixCell: true,
  }), "transparent");
});

test("automatic border line styles yield to a manual item override", () => {
  const dottedLayoutStyle = {
    ...automaticLayoutStyle,
    borderStyle: "dotted" as const,
  };
  assert.equal(resolveBorderStyle({
    layoutVisualStyle: dottedLayoutStyle,
  }), "dotted");
  assert.equal(resolveBorderStyle({
    borderStyle: "dashed",
    layoutAutoBorder: false,
    layoutVisualStyle: dottedLayoutStyle,
  }), "dashed");
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

test("a sticky note fold follows a custom fill while preserving palette defaults", () => {
  assert.equal(
    stickyNoteFoldColor("#fef9c3", "#fef9c3", "#fef08a"),
    "#fef08a"
  );
  assert.equal(
    stickyNoteFoldColor("#3b82f6", "#fef9c3", "#fef08a"),
    "#8db7fa"
  );
});

test("derives a valid lighter fill from a border color", () => {
  assert.equal(borderMatchedFillColor("#4262ff"), "#d5dcff");
  assert.equal(borderMatchedFillColor("transparent"), undefined);
  assert.equal(borderMatchedFillColor("not-a-color"), undefined);
});

test("only the first border color initializes an untouched fill", () => {
  assert.deepEqual(
    borderMatchedFillPatch({ color: "#4262ff" }, "#22c55e"),
    { fillColor: "#cef2dc", fillOpacity: 1 }
  );
  assert.deepEqual(
    borderMatchedFillPatch({ fillColor: "#fef3c7" }, "#22c55e"),
    {}
  );
  assert.deepEqual(
    borderMatchedFillPatch({ fillOpacity: 0.4 }, "#22c55e"),
    {}
  );
});

test("manual border sync replaces an existing or automatic layout fill", () => {
  assert.deepEqual(
    borderMatchedFillPatch({ fillColor: "#fef3c7" }, "#4262ff", true),
    { fillColor: "#d5dcff", fillOpacity: 1 }
  );
  assert.deepEqual(
    borderMatchedFillPatch({
      layoutVisualStyle: {
        rootId: "root",
        fillColor: "#ffffff",
        borderColor: "#111827",
        textColor: "#111827",
      },
    }, "#4262ff", true),
    { fillColor: "#d5dcff", fillOpacity: 1, layoutAutoFill: false }
  );
});

test("a border-matched fill renders as the intended pastel instead of being washed out", () => {
  const patch = borderMatchedFillPatch({}, "#4262ff", true);
  assert.equal(resolveFillColor(patch), "rgba(213, 220, 255, 1)");
  assert.equal(resolveEffectiveFillOpacity(patch), 1);
});
