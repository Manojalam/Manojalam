import assert from "node:assert/strict";
import test from "node:test";
import {
  SHAPE_POLYGON_POINTS,
  shapeConnectionPoint,
  type ConnectionSide,
  type ShapeConnectionPoint,
} from "./shape-connection-geometry";

function assertPointClose(
  actual: ShapeConnectionPoint,
  expected: ShapeConnectionPoint,
  message: string
): void {
  assert.ok(Math.abs(actual.x - expected.x) < 0.001, `${message} x`);
  assert.ok(Math.abs(actual.y - expected.y) < 0.001, `${message} y`);
}

test("star connector handles land on the visible concave silhouette", () => {
  assertPointClose(shapeConnectionPoint("star", "top"), { x: 50, y: 1 }, "top");
  assertPointClose(
    shapeConnectionPoint("star", "right"),
    { x: 77.5454545, y: 50 },
    "right"
  );
  assertPointClose(shapeConnectionPoint("star", "bottom"), { x: 50, y: 70 }, "bottom");
  assertPointClose(
    shapeConnectionPoint("star", "left"),
    { x: 22.4545455, y: 50 },
    "left"
  );
});

test("all polygon handles resolve to finite points inside the rendered view box", () => {
  const sides: ConnectionSide[] = ["top", "right", "bottom", "left"];
  for (const shapeType of Object.keys(SHAPE_POLYGON_POINTS)) {
    for (const side of sides) {
      const point = shapeConnectionPoint(shapeType, side);
      assert.ok(Number.isFinite(point.x), `${shapeType} ${side} finite x`);
      assert.ok(Number.isFinite(point.y), `${shapeType} ${side} finite y`);
      assert.ok(point.x >= 0 && point.x <= 100, `${shapeType} ${side} bounded x`);
      assert.ok(point.y >= 0 && point.y <= 100, `${shapeType} ${side} bounded y`);
    }
  }
});

test("non-polygon shapes keep the standard rectangular handle positions", () => {
  assert.deepEqual(shapeConnectionPoint("rounded", "top"), { x: 50, y: 0 });
  assert.deepEqual(shapeConnectionPoint("circle", "right"), { x: 100, y: 50 });
  assert.deepEqual(shapeConnectionPoint(undefined, "bottom"), { x: 50, y: 100 });
  assert.deepEqual(shapeConnectionPoint("rectangle", "left"), { x: 0, y: 50 });
});
