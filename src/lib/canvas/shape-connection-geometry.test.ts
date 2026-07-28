import assert from "node:assert/strict";
import test from "node:test";
import { SHAPE_TYPES } from "../types";
import {
  nodeShapeConnectionPoint,
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

test("every authored shape resolves all four handles on its silhouette", () => {
  const sides: ConnectionSide[] = ["top", "right", "bottom", "left"];
  for (const shapeType of SHAPE_TYPES) {
    for (const side of sides) {
      const point = shapeConnectionPoint(shapeType, side, {
        width: 360,
        height: 240,
        borderRadius: 42,
        petalCount: 8,
      });
      assert.ok(Number.isFinite(point.x), `${shapeType} ${side} finite x`);
      assert.ok(Number.isFinite(point.y), `${shapeType} ${side} finite y`);
      assert.ok(point.x >= 0 && point.x <= 100, `${shapeType} ${side} bounded x`);
      assert.ok(point.y >= 0 && point.y <= 100, `${shapeType} ${side} bounded y`);
      if (side === "top" || side === "bottom") {
        assert.ok(Math.abs(point.x - 50) < 0.001, `${shapeType} ${side} cardinal x`);
      } else {
        assert.ok(Math.abs(point.y - 50) < 0.001, `${shapeType} ${side} cardinal y`);
      }
    }
  }
});

test("box-filling curved shapes keep their cardinal side centers", () => {
  assert.deepEqual(shapeConnectionPoint("rounded", "top"), { x: 50, y: 0 });
  assert.deepEqual(shapeConnectionPoint("circle", "right"), { x: 100, y: 50 });
  assert.deepEqual(shapeConnectionPoint(undefined, "bottom"), { x: 50, y: 100 });
  assert.deepEqual(shapeConnectionPoint("rectangle", "left"), { x: 0, y: 50 });
});

test("custom SVG shapes attach to their inset visible paths", () => {
  assertPointClose(shapeConnectionPoint("database", "left"), { x: 10, y: 50 }, "database left");
  assertPointClose(shapeConnectionPoint("database", "right"), { x: 90, y: 50 }, "database right");
  assertPointClose(shapeConnectionPoint("predefinedProcess", "top"), { x: 50, y: 4 }, "process top");
  assertPointClose(shapeConnectionPoint("predefinedProcess", "bottom"), { x: 50, y: 96 }, "process bottom");
  assertPointClose(shapeConnectionPoint("delay", "left"), { x: 8, y: 50 }, "delay left");
  assertPointClose(shapeConnectionPoint("delay", "right"), { x: 96, y: 50 }, "delay right");
  assertPointClose(shapeConnectionPoint("leaf", "top"), { x: 50, y: 3 }, "leaf top");
  assertPointClose(shapeConnectionPoint("leaf", "bottom"), { x: 50, y: 97 }, "leaf bottom");
});

test("rotated shapes resolve against the rotated silhouette, not the node box", () => {
  const bottom = shapeConnectionPoint("rounded", "bottom", {
    width: 300,
    height: 100,
    borderRadius: 24,
    rotation: 45,
  });
  assert.ok(Math.abs(bottom.x - 50) < 0.001);
  assert.ok(bottom.y > 100);

  const right = shapeConnectionPoint("star", "right", {
    width: 300,
    height: 180,
    rotation: 30,
  });
  assert.ok(Math.abs(right.y - 50) < 0.001);
  assert.notEqual(right.x, shapeConnectionPoint("star", "right").x);
});

test("node outline points convert normalized star geometry into canvas coordinates", () => {
  const node = { type: "shape", data: { shapeType: "star" } };
  const rect = { x: 100, y: 200, width: 400, height: 400 };

  assertPointClose(nodeShapeConnectionPoint(node, rect, "bottom"), { x: 300, y: 480 }, "node bottom");
  assertPointClose(nodeShapeConnectionPoint(node, rect, "left"), { x: 189.818182, y: 400 }, "node left");
});

test("node outline points include persisted object rotation", () => {
  const node = {
    type: "shape",
    data: {
      shapeType: "rounded",
      cornerRadiusPercent: 40,
      objectRotation: 45,
    },
  };
  const rect = { x: 100, y: 200, width: 300, height: 100 };
  const bottom = nodeShapeConnectionPoint(node, rect, "bottom");

  assert.ok(Math.abs(bottom.x - 250) < 0.001);
  assert.ok(bottom.y > rect.y + rect.height);
});
