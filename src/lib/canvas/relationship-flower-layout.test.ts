import assert from "node:assert/strict";
import test from "node:test";
import { layoutFlowerLabels } from "./flower-label-flow";
import {
  buildFlowerPetalGeometry,
  flowerPetalGeometryBounds,
  type FlowerPetalGeometry,
  type FlowerPetalGeometryInput,
  type FlowerPetalPoint,
} from "./flower-petal-geometry";
import {
  balancedFlowerLayerCounts,
  layoutRelationshipFlowerPetals,
  normalizeFlowerLayerCount,
  normalizeFlowerPetalsPerLayer,
  type RelationshipFlowerLayout,
  type RelationshipFlowerPetalPlacement,
} from "./relationship-flower-layout";

function point(radius: number, angle: number) {
  const radians = angle * Math.PI / 180;
  return { x: Math.cos(radians) * radius, y: Math.sin(radians) * radius };
}

type SectorGeometryInput = FlowerPetalGeometryInput & {
  sectorHalfAngleDegrees: number;
  edgeClearance: number;
};

function geometryFor(petal: RelationshipFlowerPetalPlacement): FlowerPetalGeometry {
  const input: SectorGeometryInput = {
    center: { x: 0, y: 0 },
    angleDegrees: petal.angle,
    rootRadius: petal.rootRadius,
    length: petal.length,
    halfWidth: petal.halfWidth,
    labelCenterOffset: petal.labelCenterRadius - petal.rootRadius,
    labelRegionRadius: petal.labelRegionRadius,
    sectorHalfAngleDegrees: petal.sectorHalfAngleDegrees,
    edgeClearance: petal.edgeClearance,
  };
  return buildFlowerPetalGeometry(input);
}

function turn(origin: FlowerPetalPoint, first: FlowerPetalPoint, second: FlowerPetalPoint): number {
  return (first.x - origin.x) * (second.y - origin.y)
    - (first.y - origin.y) * (second.x - origin.x);
}

function convexHull(points: readonly FlowerPetalPoint[]): FlowerPetalPoint[] {
  const sorted = [...points]
    .sort((first, second) => first.x - second.x || first.y - second.y)
    .filter((point, index, all) =>
      index === 0 || point.x !== all[index - 1].x || point.y !== all[index - 1].y
    );
  const half = (ordered: readonly FlowerPetalPoint[]) => {
    const result: FlowerPetalPoint[] = [];
    for (const point of ordered) {
      while (
        result.length >= 2
        && turn(result[result.length - 2], result[result.length - 1], point) <= 0
      ) result.pop();
      result.push(point);
    }
    return result;
  };
  const lower = half(sorted);
  const upper = half([...sorted].reverse());
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

function projection(polygon: readonly FlowerPetalPoint[], axis: FlowerPetalPoint) {
  const values = polygon.map((point) => point.x * axis.x + point.y * axis.y);
  return { minimum: Math.min(...values), maximum: Math.max(...values) };
}

function convexSeparation(
  first: readonly FlowerPetalPoint[],
  second: readonly FlowerPetalPoint[]
): number {
  let maximumSeparation = Number.NEGATIVE_INFINITY;
  for (const polygon of [first, second]) {
    for (let index = 0; index < polygon.length; index += 1) {
      const start = polygon[index];
      const end = polygon[(index + 1) % polygon.length];
      const edgeX = end.x - start.x;
      const edgeY = end.y - start.y;
      const magnitude = Math.hypot(edgeX, edgeY);
      if (magnitude <= Number.EPSILON) continue;
      const axis = { x: -edgeY / magnitude, y: edgeX / magnitude };
      const firstProjection = projection(first, axis);
      const secondProjection = projection(second, axis);
      maximumSeparation = Math.max(
        maximumSeparation,
        secondProjection.minimum - firstProjection.maximum,
        firstProjection.minimum - secondProjection.maximum
      );
    }
  }
  return maximumSeparation;
}

function pointInsideConvexBody(
  candidate: FlowerPetalPoint,
  polygon: readonly FlowerPetalPoint[]
): boolean {
  let direction = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const side = turn(polygon[index], polygon[(index + 1) % polygon.length], candidate);
    if (Math.abs(side) <= 0.001) continue;
    const nextDirection = Math.sign(side);
    if (direction !== 0 && direction !== nextDirection) return false;
    direction = nextDirection;
  }
  return polygon.length >= 3;
}

function pointToSegmentDistance(
  candidate: FlowerPetalPoint,
  start: FlowerPetalPoint,
  end: FlowerPetalPoint
): number {
  const edgeX = end.x - start.x;
  const edgeY = end.y - start.y;
  const squaredLength = edgeX * edgeX + edgeY * edgeY;
  if (squaredLength <= Number.EPSILON) {
    return Math.hypot(candidate.x - start.x, candidate.y - start.y);
  }
  const progress = Math.max(0, Math.min(1,
    ((candidate.x - start.x) * edgeX + (candidate.y - start.y) * edgeY)
      / squaredLength
  ));
  return Math.hypot(
    candidate.x - (start.x + edgeX * progress),
    candidate.y - (start.y + edgeY * progress)
  );
}

function pointToConvexBodyDistance(
  candidate: FlowerPetalPoint,
  polygon: readonly FlowerPetalPoint[]
): number {
  if (pointInsideConvexBody(candidate, polygon)) return 0;
  return polygon.reduce((minimum, start, index) => Math.min(
    minimum,
    pointToSegmentDistance(candidate, start, polygon[(index + 1) % polygon.length])
  ), Number.POSITIVE_INFINITY);
}

function cubicPoint(
  segment: FlowerPetalGeometry["segments"][number],
  progress: number
): FlowerPetalPoint {
  const remainder = 1 - progress;
  return {
    x: remainder ** 3 * segment.start.x
      + 3 * remainder ** 2 * progress * segment.control1.x
      + 3 * remainder * progress ** 2 * segment.control2.x
      + progress ** 3 * segment.end.x,
    y: remainder ** 3 * segment.start.y
      + 3 * remainder ** 2 * progress * segment.control1.y
      + 3 * remainder * progress ** 2 * segment.control2.y
      + progress ** 3 * segment.end.y,
  };
}

function pointInsidePolygon(
  candidate: FlowerPetalPoint,
  polygon: readonly FlowerPetalPoint[]
): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const start = polygon[index];
    const end = polygon[previous];
    if (
      (start.y > candidate.y) !== (end.y > candidate.y)
      && candidate.x < (end.x - start.x) * (candidate.y - start.y)
        / (end.y - start.y) + start.x
    ) inside = !inside;
  }
  return inside;
}

function assertSafeLabelCircleInside(petal: RelationshipFlowerPetalPlacement): void {
  const geometry = geometryFor(petal);
  const outline = geometry.segments.flatMap((segment) =>
    Array.from({ length: 193 }, (_, index) => cubicPoint(segment, index / 192))
  );
  const radius = petal.labelRegionRadius;
  for (let index = 0; index < 360; index += 1) {
    const angle = index * Math.PI / 180;
    const candidate = {
      x: geometry.profile.labelCenter.x + Math.cos(angle) * radius,
      y: geometry.profile.labelCenter.y + Math.sin(angle) * radius,
    };
    assert.ok(
      pointInsidePolygon(candidate, outline),
      `label circle leaves layer ${petal.layerIndex} petal at ${index} degrees`
    );
  }
}

function assertSameLayerBodiesAndFullBounds(
  flower: RelationshipFlowerLayout,
  minimumClearance: number
): void {
  const geometries = flower.petals.map(geometryFor);
  const hulls = geometries.map((geometry) => convexHull(
    geometry.segments.flatMap((segment) => [
      segment.start,
      segment.control1,
      segment.control2,
      segment.end,
    ])
  ));
  for (let first = 0; first < hulls.length; first += 1) {
    for (let second = first + 1; second < hulls.length; second += 1) {
      if (flower.petals[first].layerIndex !== flower.petals[second].layerIndex) continue;
      const clearance = convexSeparation(hulls[first], hulls[second]);
      assert.ok(
        clearance + 0.001 >= minimumClearance,
        `petal bodies ${first}/${second} have only ${clearance}px clearance`
      );
    }
  }
  geometries.forEach((geometry, index) => {
    const bounds = flowerPetalGeometryBounds(geometry, geometry.profile.root);
    const actualExtent = Math.max(
      Math.abs(bounds.minX),
      Math.abs(bounds.minY),
      Math.abs(bounds.maxX),
      Math.abs(bounds.maxY)
    );
    assert.ok(
      actualExtent <= flower.maximumExtent + 0.001,
      `petal ${index} extends to ${actualExtent}, beyond ${flower.maximumExtent}`
    );
  });
}

test("automatic and requested layer counts stay balanced", () => {
  assert.deepEqual(balancedFlowerLayerCounts(17, 8), [5, 6, 6]);
  assert.deepEqual(balancedFlowerLayerCounts(15, 8), [7, 8]);
  assert.deepEqual(balancedFlowerLayerCounts(9, 9, 2), [4, 5]);
  assert.deepEqual(balancedFlowerLayerCounts(8, 9), [8]);
  assert.deepEqual(balancedFlowerLayerCounts(0, 9), []);
});

test("persisted flower controls default, round, and clamp", () => {
  assert.equal(normalizeFlowerPetalsPerLayer(undefined), 9);
  assert.equal(normalizeFlowerPetalsPerLayer(2), 3);
  assert.equal(normalizeFlowerPetalsPerLayer(7.6), 8);
  assert.equal(normalizeFlowerPetalsPerLayer("11"), 11);
  assert.equal(normalizeFlowerPetalsPerLayer(30), 24);
  assert.equal(normalizeFlowerLayerCount(undefined), 0);
  assert.equal(normalizeFlowerLayerCount(2.4), 2);
  assert.equal(normalizeFlowerLayerCount(99), 6);
});

test("all petals use one canonical size regardless of source content", () => {
  const result = layoutRelationshipFlowerPetals(
    Array.from({ length: 9 }, () => ({})),
    { hubRadius: 88, maxPerLayer: 9, density: "comfortable" }
  );

  assert.deepEqual(result.layerCounts, [9]);
  assert.equal(new Set(result.petals.map((petal) => petal.length)).size, 1);
  assert.equal(new Set(result.petals.map((petal) => petal.halfWidth)).size, 1);
  assert.equal(new Set(result.petals.map((petal) => petal.rootRadius)).size, 1);
  assert.equal(new Set(result.petals.map((petal) => petal.labelRegionRadius)).size, 1);
  assert.equal(new Set(result.petals.map((petal) => petal.sectorHalfAngleDegrees)).size, 1);
  assert.equal(new Set(result.petals.map((petal) => petal.edgeClearance)).size, 1);
  assert.ok(result.petals.every((petal) => petal.rootRadius <= 88 * 0.68 + 0.001));
  assert.ok(result.petals[0].sectorHalfAngleDegrees * 2 <= 360 / 9 - 1.4);
  assert.deepEqual(result.petals.map((petal) => petal.index), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assertSameLayerBodiesAndFullBounds(result, 1);
});

test("the production safe circle fits representative Sanskrit counts at readable line heights", () => {
  const labels = [
    "पृथ्वी",
    "जलम्",
    "तेजः",
    "वायुः",
    "आकाशः",
    "मनः",
    "आत्मा",
    "कालः",
    "दिक्",
    "शब्दः",
    "स्पर्शः",
    "रूपम्",
    "रसः",
    "गन्धः",
  ];
  const flower = layoutRelationshipFlowerPetals(
    Array.from({ length: 9 }, () => ({})),
    { hubRadius: 92, maxPerLayer: 9, density: "comfortable" }
  );
  const safeDiameter = flower.labelRegionRadius * 2;
  assert.ok(safeDiameter >= 174, `safe circle is only ${safeDiameter}px`);

  // Deliberately more conservative than the SSR estimate: every visible
  // Devanagari base receives a full em, while combining marks are zero-width.
  const conservativeSanskritMeasure = (value: string, fontSize: number) =>
    Array.from(value).filter((character) => !/\p{Mark}/u.test(character)).length * fontSize;

  for (const count of [1, 5, 9, 11, 14]) {
    const result = layoutFlowerLabels({
      sourceText: `पृथ्वी (${count})`,
      targetLabels: labels.slice(0, count),
      regionWidth: safeDiameter,
      regionHeight: safeDiameter,
      sourceFontSize: 14,
      targetFontSize: 10,
      minimumSourceFontSize: 10,
      minimumTargetFontSize: 9,
      density: "compact",
      measureText: conservativeSanskritMeasure,
    });

    assert.equal(result.overflowed, false, `${count} targets overflowed`);
    assert.ok(result.source.fontSize >= 10, `${count} targets made the source unreadable`);
    assert.ok(result.source.lineHeight >= 14, `${count} targets compressed the source lines`);
    assert.ok(result.targetFontSize >= 9, `${count} targets made labels unreadable`);
    assert.ok(result.targets.every((target) => target.lineHeight >= 11));
    assert.equal(result.targets.length, count);
    assert.deepEqual(
      result.targets.map((target) => target.targetIndex),
      Array.from({ length: count }, (_, index) => index)
    );
    result.rows.forEach((row) => {
      assert.ok(row.width <= row.availableWidth + 0.001);
    });
  }
});

test("dense flowers form compact alternating nested layers", () => {
  const result = layoutRelationshipFlowerPetals(
    Array.from({ length: 24 }, () => ({})),
    { hubRadius: 88, maxPerLayer: 9, density: "comfortable" }
  );
  assert.deepEqual(result.layerCounts, [8, 8, 8]);
  const layers = result.layerCounts.map((_, layerIndex) =>
    result.petals.filter((petal) => petal.layerIndex === layerIndex)
  );
  assert.equal(layers[0][0].angle, -90);
  assert.equal(layers[1][0].angle, -67.5);
  assert.equal(layers[2][0].angle, -90);
  assert.ok(layers[1][0].rootRadius > layers[0][0].rootRadius);
  assert.ok(layers[2][0].rootRadius > layers[1][0].rootRadius);
  assert.ok(layers[1][0].length < layers[0][0].length);
  assert.equal(layers[1][0].length, layers[2][0].length);
  for (let layerIndex = 1; layerIndex < layers.length; layerIndex += 1) {
    const foreground = layers[layerIndex - 1][0];
    const nested = layers[layerIndex][0];
    assert.ok(
      nested.rootRadius < foreground.rootRadius + foreground.length,
      `layer ${layerIndex} does not begin behind its foreground layer`
    );
    assert.ok(
      nested.rootRadius + nested.length > foreground.rootRadius + foreground.length,
      `layer ${layerIndex} does not reveal a tip beyond its foreground layer`
    );
  }
  assert.equal(new Set(result.petals.map((petal) => petal.halfWidth)).size, 1);
  assert.equal(new Set(result.petals.map((petal) => petal.labelRegionRadius)).size, 1);
  assert.equal(new Set(result.petals.map((petal) => petal.sectorHalfAngleDegrees)).size, 1);
  assert.ok(result.maximumExtent < 650, `nested flower extent is ${result.maximumExtent}px`);
  result.petals.forEach(assertSafeLabelCircleInside);
  assertSameLayerBodiesAndFullBounds(result, 1);
});

test("back-layer labels clear every foreground body while petal bodies overlap", () => {
  const result = layoutRelationshipFlowerPetals(
    Array.from({ length: 24 }, () => ({})),
    { hubRadius: 88, maxPerLayer: 9, density: "comfortable" }
  );
  const geometries = result.petals.map(geometryFor);
  const hulls = geometries.map((geometry) => convexHull(
    geometry.segments.flatMap((segment) => [
      segment.start,
      segment.control1,
      segment.control2,
      segment.end,
    ])
  ));
  let overlappingLayerPairs = 0;
  for (let back = 0; back < result.petals.length; back += 1) {
    const backPetal = result.petals[back];
    if (backPetal.layerIndex === 0) continue;
    const center = point(backPetal.labelCenterRadius, backPetal.angle);
    for (let front = 0; front < result.petals.length; front += 1) {
      const frontPetal = result.petals[front];
      if (frontPetal.layerIndex >= backPetal.layerIndex) continue;
      const distance = pointToConvexBodyDistance(center, hulls[front]);
      assert.ok(
        distance + 0.001 >= backPetal.labelRegionRadius,
        `layer ${backPetal.layerIndex} label intersects foreground petal ${front}`
      );
      if (
        frontPetal.layerIndex === backPetal.layerIndex - 1
        && convexSeparation(hulls[back], hulls[front]) < 0
      ) overlappingLayerPairs += 1;
    }
  }
  assert.ok(overlappingLayerPairs > 0, "nested layer bodies never overlap");
});

test("shortened nested petals contain the full safe circle at every density", () => {
  for (const density of ["compact", "comfortable", "spacious"] as const) {
    const result = layoutRelationshipFlowerPetals(
      Array.from({ length: 24 }, () => ({})),
      { hubRadius: 88, maxPerLayer: 9, density }
    );
    result.petals.forEach((petal) => {
      assertSafeLabelCircleInside(petal);
      assert.equal(
        geometryFor(petal).profile.labelRegionRadius,
        result.labelRegionRadius,
        `${density} layer ${petal.layerIndex} reduced its fixed label region`
      );
    });
  }
});

test("a requested 24-petal ring preserves slot gaps and complete bounds", () => {
  const result = layoutRelationshipFlowerPetals(
    Array.from({ length: 24 }, () => ({})),
    { hubRadius: 88, maxPerLayer: 24, density: "comfortable" }
  );

  assert.deepEqual(result.layerCounts, [24]);
  assert.ok(result.petals[0].sectorHalfAngleDegrees * 2 <= 360 / 24 - 1.4);
  assertSameLayerBodiesAndFullBounds(result, 1);
});

test("fixed circular label regions do not overlap", () => {
  const result = layoutRelationshipFlowerPetals(
    Array.from({ length: 24 }, () => ({})),
    { hubRadius: 88, maxPerLayer: 9, density: "comfortable" }
  );
  const centers = result.petals.map((petal) => ({
    ...point(petal.labelCenterRadius, petal.angle),
    radius: petal.labelRegionRadius,
  }));
  for (let first = 0; first < centers.length; first += 1) {
    for (let second = first + 1; second < centers.length; second += 1) {
      const distance = Math.hypot(
        centers[first].x - centers[second].x,
        centers[first].y - centers[second].y
      );
      assert.ok(
        distance + 0.001 >= centers[first].radius + centers[second].radius,
        `label regions ${first}/${second} overlap`
      );
    }
  }
});

test("manual per-item layer assignments apply across every petal", () => {
  const result = layoutRelationshipFlowerPetals(
    [
      { preferredLayer: 1 },
      { preferredLayer: 1 },
      { preferredLayer: 2 },
      { preferredLayer: 2 },
      { preferredLayer: 2 },
    ],
    { hubRadius: 88, maxPerLayer: 9, density: "comfortable", layerCount: 2 }
  );
  assert.deepEqual(result.layerCounts, [2, 3]);
  assert.deepEqual(result.petals.map((petal) => petal.layerIndex), [0, 0, 1, 1, 1]);
});

test("bounds remain finite for empty and invalid input", () => {
  const empty = layoutRelationshipFlowerPetals([], {
    hubRadius: Number.NaN,
    maxPerLayer: Number.NaN,
    density: "comfortable",
  });
  assert.deepEqual(empty.petals, []);
  assert.deepEqual(empty.layerCounts, []);
  assert.ok(Number.isFinite(empty.maximumExtent));

  const populated = layoutRelationshipFlowerPetals(Array.from({ length: 3 }, () => ({})), {
    hubRadius: Number.NaN,
    maxPerLayer: Number.NaN,
    density: "spacious",
  });
  assert.ok(populated.petals.every((petal) =>
    [petal.angle, petal.rootRadius, petal.length, petal.halfWidth]
      .every(Number.isFinite)
  ));
});
