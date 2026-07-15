import assert from "node:assert/strict";
import test from "node:test";
import {
  balancedFlowerLayerCounts,
  layoutRelationshipFlowerPetals,
  normalizeFlowerPetalsPerLayer,
} from "./relationship-flower-layout";

const anglePoint = (radius: number, angle: number) => {
  const radians = angle * Math.PI / 180;
  return {
    x: radius * Math.cos(radians),
    y: radius * Math.sin(radians),
  };
};

test("layer counts are balanced with remainders assigned to outer layers", () => {
  assert.deepEqual(balancedFlowerLayerCounts(17, 8), [5, 6, 6]);
  assert.deepEqual(balancedFlowerLayerCounts(15, 8), [7, 8]);
  assert.deepEqual(balancedFlowerLayerCounts(8, 8), [8]);
  assert.deepEqual(balancedFlowerLayerCounts(0, 8), []);
});

test("petals-per-layer values default, round, and clamp for persisted specs", () => {
  assert.equal(normalizeFlowerPetalsPerLayer(undefined), 9);
  assert.equal(normalizeFlowerPetalsPerLayer(Number.NaN), 9);
  assert.equal(normalizeFlowerPetalsPerLayer(2), 3);
  assert.equal(normalizeFlowerPetalsPerLayer(7.6), 8);
  assert.equal(normalizeFlowerPetalsPerLayer("11"), 11);
  assert.equal(normalizeFlowerPetalsPerLayer(30), 24);
});

test("layers preserve order and never exceed the normalized maximum", () => {
  const inputs = Array.from({ length: 53 }, (_, index) => ({
    width: 90 + index,
    height: 120 + index,
  }));
  const result = layoutRelationshipFlowerPetals(inputs, {
    hubRadius: 110,
    maxPerLayer: 10,
    density: "comfortable",
  });

  assert.deepEqual(result.petals.map((petal) => petal.index), inputs.map((_, index) => index));
  assert.equal(result.layerCounts.reduce((sum, count) => sum + count, 0), inputs.length);
  assert.ok(result.layerCounts.every((count) => count <= 10));
  assert.ok(result.layerCounts.every((count, index, counts) => index === 0 || count >= counts[index - 1]));
  result.petals.forEach((petal, index) => {
    const expectedLayer = result.layerCounts.findIndex((_, layerIndex) =>
      index < result.layerCounts.slice(0, layerIndex + 1).reduce((sum, count) => sum + count, 0)
    );
    assert.equal(petal.layerIndex, expectedLayer);
  });
});

test("alternate layers use half-slot angular staggering from negative ninety degrees", () => {
  const result = layoutRelationshipFlowerPetals(
    Array.from({ length: 17 }, () => ({ width: 120, height: 150 })),
    { hubRadius: 104, maxPerLayer: 8, density: "compact" }
  );

  assert.deepEqual(result.layerCounts, [5, 6, 6]);
  const layers = result.layerCounts.map((_, layerIndex) =>
    result.petals.filter((petal) => petal.layerIndex === layerIndex)
  );
  assert.equal(layers[0][0].angle, -90);
  assert.equal(layers[1][0].angle, -60);
  assert.equal(layers[2][0].angle, -90);
  layers.forEach((layer, layerIndex) => {
    const slot = 360 / layer.length;
    layer.slice(1).forEach((petal, itemIndex) => {
      assert.equal(petal.angle - layer[itemIndex].angle, slot);
    });
    const expectedStart = -90 + (layerIndex % 2 ? slot / 2 : 0);
    assert.equal(layer[0].angle, expectedStart);
  });
});

test("radii increase outward and keep every axis-aligned content box disjoint", () => {
  const inputs = Array.from({ length: 17 }, (_, index) => ({
    width: 110 + index % 4 * 23,
    height: 145 + index % 3 * 31,
  }));
  const result = layoutRelationshipFlowerPetals(inputs, {
    hubRadius: 108,
    maxPerLayer: 8,
    density: "comfortable",
  });
  const radii = result.layerCounts.map((_, layerIndex) =>
    result.petals.find((petal) => petal.layerIndex === layerIndex)!.radius
  );
  radii.slice(1).forEach((radius, index) => assert.ok(radius > radii[index]));

  const boxes = result.petals.map((petal) => {
    const point = anglePoint(petal.radius, petal.angle);
    return {
      left: point.x - inputs[petal.index].width / 2,
      right: point.x + inputs[petal.index].width / 2,
      top: point.y - inputs[petal.index].height / 2,
      bottom: point.y + inputs[petal.index].height / 2,
    };
  });
  for (let first = 0; first < boxes.length; first += 1) {
    for (let second = first + 1; second < boxes.length; second += 1) {
      const overlap =
        boxes[first].left < boxes[second].right
        && boxes[first].right > boxes[second].left
        && boxes[first].top < boxes[second].bottom
        && boxes[first].bottom > boxes[second].top;
      assert.equal(overlap, false, `content boxes ${first} and ${second} overlap`);
    }
  }
});

test("maximum extent conservatively bounds every petal content box", () => {
  const inputs = [
    { width: 360, height: 80 },
    { width: 80, height: 300 },
    { width: 210, height: 170 },
    { width: 130, height: 220 },
  ];
  const result = layoutRelationshipFlowerPetals(inputs, {
    hubRadius: 120,
    maxPerLayer: 3,
    density: "spacious",
  });

  result.petals.forEach((petal) => {
    const point = anglePoint(petal.radius, petal.angle);
    const input = inputs[petal.index];
    assert.ok(Math.abs(point.x) + input.width / 2 < result.maximumExtent);
    assert.ok(Math.abs(point.y) + input.height / 2 < result.maximumExtent);
    assert.equal(petal.halfExtent, Math.hypot(input.width / 2, input.height / 2));
  });
});

test("layering a dense flower is more compact than one oversized ring", () => {
  const inputs = Array.from({ length: 24 }, () => ({ width: 180, height: 150 }));
  const singleRing = layoutRelationshipFlowerPetals(inputs, {
    hubRadius: 104,
    maxPerLayer: 24,
    density: "comfortable",
  });
  const layered = layoutRelationshipFlowerPetals(inputs, {
    hubRadius: 104,
    maxPerLayer: 9,
    density: "comfortable",
  });

  assert.deepEqual(layered.layerCounts, [8, 8, 8]);
  assert.ok(layered.maximumExtent < singleRing.maximumExtent * 0.8);
});

test("invalid dimensions and limits normalize to finite layout values", () => {
  const result = layoutRelationshipFlowerPetals(
    [
      { width: Number.NaN, height: -10 },
      { width: Number.POSITIVE_INFINITY, height: 0 },
      { width: 120, height: 150 },
      { width: 120, height: 150 },
    ],
    { hubRadius: Number.NaN, maxPerLayer: 1, density: "comfortable" }
  );

  assert.deepEqual(result.layerCounts, [2, 2]);
  assert.ok(Number.isFinite(result.maximumExtent));
  result.petals.forEach((petal) => {
    assert.ok(Number.isFinite(petal.radius));
    assert.ok(Number.isFinite(petal.halfExtent));
  });
});
