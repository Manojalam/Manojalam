import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeRadialLabelRotation,
  resolveRadialLabelRotation,
} from "./radial-label-rotation";

test("manual radial label rotation remains relative to automatic orientation", () => {
  assert.equal(resolveRadialLabelRotation(135, 25), 160);
  assert.equal(resolveRadialLabelRotation(-40, -30), -70);
});

test("radial label rotation normalizes to the inspector range", () => {
  assert.equal(normalizeRadialLabelRotation(540), 180);
  assert.equal(normalizeRadialLabelRotation(-540), -180);
  assert.equal(normalizeRadialLabelRotation(270), -90);
  assert.equal(normalizeRadialLabelRotation(Number.NaN), 0);
});
