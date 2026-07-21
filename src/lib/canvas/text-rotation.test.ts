import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTextRotation, textRotationStyle } from "./text-rotation";

test("normalizes text rotation into the signed range", () => {
  assert.equal(normalizeTextRotation(0), 0);
  assert.equal(normalizeTextRotation(180), 180);
  assert.equal(normalizeTextRotation(540), 180);
  assert.equal(normalizeTextRotation(-540), -180);
  assert.equal(normalizeTextRotation(Number.NaN), 0);
});

test("builds a transform only for a non-zero text rotation", () => {
  assert.deepEqual(textRotationStyle(0), {});
  assert.deepEqual(textRotationStyle(27), {
    transform: "rotate(27deg)",
    transformOrigin: "center center",
  });
});
