import assert from "node:assert/strict";
import test from "node:test";
import { resolveHydratedSunburstGeometry, viewportsEqual } from "./hydration";

test("ordinary sunburst hydration preserves persisted position and size", () => {
  let geometry = resolveHydratedSunburstGeometry({
    position: { x: 240, y: 160 },
    currentSize: { width: 960, height: 960 },
    chartSize: 960,
    automaticSize: 1180,
  });
  const original = structuredClone(geometry);

  for (let iteration = 0; iteration < 10; iteration += 1) {
    geometry = resolveHydratedSunburstGeometry({
      position: geometry.position,
      currentSize: { width: geometry.size, height: geometry.size },
      chartSize: geometry.size,
      automaticSize: 1180,
    });
  }

  assert.deepEqual(geometry, original);
});

test("legacy visual bounds migrate once and then remain stable", () => {
  const migrated = resolveHydratedSunburstGeometry({
    position: { x: 300, y: 200 },
    currentSize: { width: 900, height: 900 },
    chartSize: 900,
    automaticSize: 900,
    legacyVisualBounds: { minX: -40, minY: -25 },
  });
  const hydratedAgain = resolveHydratedSunburstGeometry({
    position: migrated.position,
    currentSize: { width: migrated.size, height: migrated.size },
    chartSize: migrated.size,
    automaticSize: 1100,
  });

  assert.deepEqual(migrated.position, { x: 340, y: 225 });
  assert.deepEqual(hydratedAgain.position, migrated.position);
});

test("viewport comparison ignores insignificant React Flow rounding only", () => {
  assert.equal(viewportsEqual(
    { x: 10, y: 20, zoom: 1 },
    { x: 10.0005, y: 19.9995, zoom: 1.0005 }
  ), true);
  assert.equal(viewportsEqual(
    { x: 10, y: 20, zoom: 1 },
    { x: 12, y: 20, zoom: 1 }
  ), false);
});
