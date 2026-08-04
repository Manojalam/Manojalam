import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeSurfaceEffect,
  surfaceEffectExportShadowLayers,
  surfaceEffectExportStyle,
  surfaceEffectFillStyle,
  surfaceEffectFilter,
  surfaceEffectPresetPatch,
  surfaceEffectStyle,
} from "./surface-effects";

test("normalizes unknown and out-of-range surface settings", () => {
  assert.deepEqual(normalizeSurfaceEffect({
    surfaceEffect: "unknown",
    surfaceEffectDepth: 99,
    surfaceEffectStrength: -8,
    surfaceEffectAngle: 270,
  }), {
    preset: "flat",
    depth: 24,
    strength: 0,
    angle: 180,
  });
});

test("preset patches include deterministic editable controls", () => {
  assert.deepEqual(surfaceEffectPresetPatch("raised"), {
    surfaceEffect: "raised",
    surfaceEffectDepth: 10,
    surfaceEffectStrength: 56,
    surfaceEffectAngle: 45,
  });
});

test("raised surfaces combine directional depth and an inner highlight", () => {
  const style = surfaceEffectStyle(surfaceEffectPresetPatch("raised"));

  assert.match(style.backgroundImage ?? "", /linear-gradient/);
  assert.equal((style.boxShadow ?? "").split("inset").length - 1, 2);
  assert.match(style.boxShadow ?? "", /1\.84px 1\.84px 0 rgba\(2,6,23/);
  assert.match(style.boxShadow ?? "", /rgba\(2,6,23/);
});

test("maximum left projection keeps direction-aware inner edges visible", () => {
  const style = surfaceEffectStyle({
    surfaceEffect: "raised",
    surfaceEffectDepth: 24,
    surfaceEffectStrength: 100,
    surfaceEffectAngle: 180,
  });

  assert.match(style.boxShadow ?? "", /inset -4px 0px 5\.2px rgba\(255,255,255/);
  assert.match(style.boxShadow ?? "", /inset 4px 0px 5\.72px rgba\(2,6,23/);
  assert.match(style.boxShadow ?? "", /-6\.25px 0px 0 rgba\(2,6,23/);
});

test("metallic surfaces use alternating specular bands and sculpted edges", () => {
  const patch = surfaceEffectPresetPatch("metallic");
  const style = surfaceEffectStyle(patch);

  assert.deepEqual(patch, {
    surfaceEffect: "metallic",
    surfaceEffectDepth: 6,
    surfaceEffectStrength: 72,
    surfaceEffectAngle: 20,
  });
  assert.equal((style.backgroundImage ?? "").split("linear-gradient").length - 1, 2);
  assert.match(style.backgroundImage ?? "", /rgba\(255,255,255/);
  assert.match(style.backgroundImage ?? "", /rgba\(2,6,23/);
  assert.match(style.boxShadow ?? "", /inset 0 1px 0/);
  assert.match(style.boxShadow ?? "", /inset 0 -1px 0/);
});

test("decorations can reuse surface paint without duplicating node shadows", () => {
  const style = surfaceEffectFillStyle(surfaceEffectPresetPatch("metallic"));

  assert.equal((style.backgroundImage ?? "").split("linear-gradient").length - 1, 2);
  assert.equal(style.backgroundBlendMode, "overlay,soft-light");
  assert.equal(style.boxShadow, undefined);
});

test("glow uses the node accent and SVG shapes receive a drop shadow filter", () => {
  const data = surfaceEffectPresetPatch("glow");
  const style = surfaceEffectStyle(data, "#22c55e");
  const filter = surfaceEffectFilter(data, "#22c55e");

  assert.match(style.boxShadow ?? "", /#22c55e/);
  assert.match(filter ?? "", /drop-shadow/);
  assert.match(filter ?? "", /#22c55e/);
});

test("exported soft effects leave outer depth to the native SVG layer", () => {
  const style = surfaceEffectExportStyle(surfaceEffectPresetPatch("soft"));

  assert.deepEqual(style, {});
});

test("exported raised effects preserve inset lighting without the outer shadow layer", () => {
  const style = surfaceEffectExportStyle(surfaceEffectPresetPatch("raised"));

  assert.match(style.boxShadow ?? "", /inset 1\.56px 1\.56px/);
  assert.equal((style.boxShadow ?? "").split("inset").length - 1, 2);
});

test("exported glow effects keep only the inner glow on the HTML surface", () => {
  const style = surfaceEffectExportStyle(surfaceEffectPresetPatch("glow"), "#22c55e");

  assert.match(style.boxShadow ?? "", /inset/);
  assert.equal((style.boxShadow ?? "").split("color-mix").length - 1, 1);
});

test("native export shadow layers preserve directional depth without HTML filters", () => {
  assert.deepEqual(
    surfaceEffectExportShadowLayers(surfaceEffectPresetPatch("raised")),
    [
      {
        dx: 1.84,
        dy: 1.84,
        blur: 0.8,
        color: "#020617",
        opacity: 0.32,
      },
      {
        dx: 4.38,
        dy: 4.38,
        blur: 6.51,
        color: "#020617",
        opacity: 0.26,
      },
    ]
  );
});

test("native glow exports retain two accent-colored halos", () => {
  const layers = surfaceEffectExportShadowLayers(
    surfaceEffectPresetPatch("glow"),
    "#22c55e"
  );

  assert.equal(layers.length, 2);
  assert.deepEqual(layers.map((layer) => layer.color), ["#22c55e", "#22c55e"]);
  assert.ok((layers[1]?.blur ?? 0) > (layers[0]?.blur ?? 0));
});

test("flat surfaces add no paint and preserve legacy boards", () => {
  assert.deepEqual(surfaceEffectStyle({}), {});
  assert.deepEqual(surfaceEffectFillStyle({}), {});
  assert.equal(surfaceEffectFilter({}), undefined);
  assert.deepEqual(surfaceEffectExportStyle({}), {});
  assert.deepEqual(surfaceEffectExportShadowLayers({}), []);
});
