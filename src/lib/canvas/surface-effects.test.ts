import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeSurfaceEffect,
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
  assert.match(style.boxShadow ?? "", /inset 0 1px 0/);
  assert.match(style.boxShadow ?? "", /rgba\(2,6,23/);
});

test("glow uses the node accent and SVG shapes receive a drop shadow filter", () => {
  const data = surfaceEffectPresetPatch("glow");
  const style = surfaceEffectStyle(data, "#22c55e");
  const filter = surfaceEffectFilter(data, "#22c55e");

  assert.match(style.boxShadow ?? "", /#22c55e/);
  assert.match(filter ?? "", /drop-shadow/);
  assert.match(filter ?? "", /#22c55e/);
});

test("flat surfaces add no paint and preserve legacy boards", () => {
  assert.deepEqual(surfaceEffectStyle({}), {});
  assert.equal(surfaceEffectFilter({}), undefined);
});
