import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeObjectRotation,
  objectRotationStyle,
  resolveObjectRotation,
  supportsObjectRotation,
} from "./object-rotation";

test("normalizes arbitrary angles into the editable range", () => {
  assert.equal(normalizeObjectRotation(450), 90);
  assert.equal(normalizeObjectRotation(-270), 90);
  assert.equal(normalizeObjectRotation(180), 180);
  assert.equal(normalizeObjectRotation(540), 180);
  assert.equal(normalizeObjectRotation(Number.NaN), 0);
});

test("prefers whole-object rotation and reads legacy rotation only for compatible nodes", () => {
  assert.equal(resolveObjectRotation("shape", { rotation: 30 }), 30);
  assert.equal(resolveObjectRotation("shape", { rotation: 30, objectRotation: 75 }), 75);
  assert.equal(resolveObjectRotation("sticky", { rotation: 30 }), 0);
  assert.equal(resolveObjectRotation("sunburst", { rotation: -45 }), -45);
});

test("keeps generated layout objects and connector junctions unrotated", () => {
  assert.equal(supportsObjectRotation("text", {}), true);
  assert.equal(supportsObjectRotation("junction", {}), false);
  assert.equal(supportsObjectRotation("shape", { matrixCell: true }), false);
  assert.equal(supportsObjectRotation("frame", { matrixFrameFor: "root" }), false);
});

test("builds a visual-only rotation style", () => {
  assert.deepEqual(objectRotationStyle("text", { objectRotation: 15 }), {
    transform: "rotate(15deg)",
    transformOrigin: "center",
  });
  assert.deepEqual(objectRotationStyle("text", {}), {});
});
