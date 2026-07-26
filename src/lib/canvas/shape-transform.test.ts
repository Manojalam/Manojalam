import assert from "node:assert/strict";
import test from "node:test";
import { supportsShapeTransform } from "./shape-transform";

test("multi-selection shape changes target shapes and Matrix cells only", () => {
  assert.equal(supportsShapeTransform({ type: "shape", data: {} }), true);
  assert.equal(supportsShapeTransform({ type: "text", data: { matrixCell: true } }), true);
  assert.equal(supportsShapeTransform({ type: "sticky", data: { matrixCell: true } }), true);

  assert.equal(supportsShapeTransform({ type: "text", data: { textFrameStyle: "speech" } }), false);
  assert.equal(supportsShapeTransform({ type: "frame", data: {} }), false);
  assert.equal(supportsShapeTransform({ type: "sunburst", data: {} }), false);
  assert.equal(supportsShapeTransform({ type: "relationshipDiagram", data: {} }), false);
});
