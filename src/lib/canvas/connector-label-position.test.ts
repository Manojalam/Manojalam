import assert from "node:assert/strict";
import test from "node:test";

import {
  closestConnectorPathPosition,
  connectorPointAtProgress,
  sampleConnectorPath,
} from "./connector-label-position";

test("places labels by distance along a bent connector", () => {
  const path = sampleConnectorPath("M 0 0 L 100 0 L 100 100");

  assert.deepEqual(connectorPointAtProgress(path, 0.75, { x: 0, y: 0 }), { x: 100, y: 50 });
});

test("projects free pointer movement back onto the nearest connector segment", () => {
  const path = sampleConnectorPath("M 0 0 L 100 0 L 100 100");
  const position = closestConnectorPathPosition(path, { x: 84, y: 66 });

  assert.deepEqual(position.point, { x: 100, y: 66 });
  assert.equal(position.progress, 0.83);
});

test("samples rounded and bezier connector curves", () => {
  const rounded = sampleConnectorPath("M0 0 L40 0 Q50 0 50 10 L50 60");
  const bezier = sampleConnectorPath("M0,0 C40,0 60,100 100,100");

  assert.ok(rounded.totalLength > 105 && rounded.totalLength < 107);
  assert.ok(bezier.totalLength > 140 && bezier.totalLength < 150);
  const midpoint = connectorPointAtProgress(bezier, 0.5, { x: 0, y: 0 });
  assert.ok(Math.abs(midpoint.x - 50) < 0.01);
  assert.ok(Math.abs(midpoint.y - 50) < 0.01);
});

test("does not invent a bridge between separate SVG subpaths", () => {
  const path = sampleConnectorPath("M 0 0 L 10 0 M 100 0 L 110 0");
  const position = closestConnectorPathPosition(path, { x: 50, y: 0 });

  assert.equal(path.totalLength, 20);
  assert.deepEqual(position.point, { x: 10, y: 0 });
});
