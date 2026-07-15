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
  type RelationshipFlowerGeometricPlacement,
  type RelationshipFlowerLayout,
} from "./relationship-flower-layout";

function point(radius: number, angle: number) {
  const radians = angle * Math.PI / 180;
  return { x: Math.cos(radians) * radius, y: Math.sin(radians) * radius };
}

type SectorGeometryInput = FlowerPetalGeometryInput & {
  sectorHalfAngleDegrees: number;
  edgeClearance: number;
  baseContact: RelationshipFlowerGeometricPlacement["baseContact"];
};

function geometryFor(petal: RelationshipFlowerGeometricPlacement): FlowerPetalGeometry {
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
    baseContact: petal.baseContact,
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

function assertSafeLabelCircleInside(petal: RelationshipFlowerGeometricPlacement): void {
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
  const placements = [...flower.petals, ...flower.emptyPetals];
  const geometries = placements.map(geometryFor);
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
      if (placements[first].layerIndex !== placements[second].layerIndex) continue;
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

test("automatic and requested layer counts fill inner layers first", () => {
  assert.deepEqual(balancedFlowerLayerCounts(17, 8), [6, 6, 5]);
  assert.deepEqual(balancedFlowerLayerCounts(15, 8), [8, 7]);
  assert.deepEqual(balancedFlowerLayerCounts(9, 9, 2), [5, 4]);
  assert.deepEqual(balancedFlowerLayerCounts(7, 9, 2), [4, 3]);
  assert.deepEqual(balancedFlowerLayerCounts(22, 9, 4), [6, 6, 6, 4]);
  assert.deepEqual(balancedFlowerLayerCounts(3, 9, 6), [1, 1, 1, 0, 0, 0]);
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
  assert.equal(result.layerSlotCount, 9);
  assert.deepEqual(result.emptyPetals, []);
  assert.equal(new Set(result.petals.map((petal) => petal.length)).size, 1);
  assert.equal(new Set(result.petals.map((petal) => petal.halfWidth)).size, 1);
  assert.equal(new Set(result.petals.map((petal) => petal.rootRadius)).size, 1);
  assert.equal(new Set(result.petals.map((petal) => petal.labelRegionRadius)).size, 1);
  assert.equal(new Set(result.petals.map((petal) => petal.sectorHalfAngleDegrees)).size, 1);
  assert.equal(new Set(result.petals.map((petal) => petal.edgeClearance)).size, 1);
  assert.ok(result.petals.every((petal) => petal.rootRadius <= 88 * 0.68 + 0.001));
  assert.ok(result.petals[0].sectorHalfAngleDegrees * 2 <= 360 / 9 - 1.4);
  assert.deepEqual(result.petals.map((petal) => petal.index), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.ok(result.petals.every((petal) =>
    petal.baseContact.startRadius < 88
    && petal.baseContact.endRadius > 88
    && petal.baseContact.halfAngleDegrees === 20
  ));
  assertSameLayerBodiesAndFullBounds(result, 0);
});

test("sparse slot grids use shorter broader petals without reducing the safe label region", () => {
  const flowers = [4, 8, 12].map((slotCount) => layoutRelationshipFlowerPetals(
    Array.from({ length: slotCount }, () => ({})),
    { hubRadius: 88, maxPerLayer: 24, density: "comfortable", layerCount: 1 }
  ));
  const basePetals = flowers.map((flower) => flower.petals[0]);

  assert.ok(basePetals[0].length < basePetals[1].length);
  assert.ok(basePetals[1].length < basePetals[2].length);
  assert.ok(basePetals[0].halfWidth > basePetals[1].halfWidth);
  assert.ok(basePetals[1].halfWidth > basePetals[2].halfWidth);
  assert.equal(new Set(flowers.map((flower) => flower.labelRegionRadius)).size, 1);

  flowers.forEach((flower, index) => {
    assert.equal(flower.layerSlotCount, [4, 8, 12][index]);
    assert.equal(new Set(flower.petals.map((petal) => petal.length)).size, 1);
    assert.equal(new Set(flower.petals.map((petal) => petal.halfWidth)).size, 1);
    flower.petals.forEach(assertSafeLabelCircleInside);
    assertSameLayerBodiesAndFullBounds(flower, 0);
  });
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

test("partial last layers keep a complete shared slot grid with placeholders", () => {
  const result = layoutRelationshipFlowerPetals(
    Array.from({ length: 7 }, () => ({})),
    { hubRadius: 88, maxPerLayer: 9, density: "comfortable", layerCount: 2 }
  );
  assert.deepEqual(result.layerCounts, [4, 3]);
  assert.equal(result.layerSlotCount, 4);
  assert.equal(result.petals.length, 7);
  assert.equal(result.emptyPetals.length, 1);
  assert.deepEqual(
    result.emptyPetals.map(({ layerIndex, slotIndex, index }) => ({
      layerIndex,
      slotIndex,
      index,
    })),
    [{ layerIndex: 1, slotIndex: 3, index: null }]
  );
  const placements = [...result.petals, ...result.emptyPetals];
  const layerAngles = [0, 1].map((layerIndex) => placements
    .filter((petal) => petal.layerIndex === layerIndex)
    .sort((first, second) => first.slotIndex - second.slotIndex)
    .map((petal) => petal.angle));
  assert.deepEqual(layerAngles[0], [-90, 0, 90, 180]);
  assert.deepEqual(layerAngles[1], [-135, -45, 45, 135]);
  assert.ok(placements.every((petal) =>
    petal.baseContact.halfAngleDegrees === 45
    && petal.baseContact.startRadius === 88 * 0.94
    && petal.baseContact.endRadius === 88 * 1.28
  ));
  assert.ok(result.petals[4].halfWidth > result.petals[0].halfWidth);
  placements.forEach(assertSafeLabelCircleInside);
  assertSameLayerBodiesAndFullBounds(result, 0);

  const twentyTwoAcrossFour = layoutRelationshipFlowerPetals(
    Array.from({ length: 22 }, () => ({})),
    { hubRadius: 88, maxPerLayer: 9, density: "comfortable", layerCount: 4 }
  );
  assert.deepEqual(twentyTwoAcrossFour.layerCounts, [6, 6, 6, 4]);
  assert.equal(twentyTwoAcrossFour.layerSlotCount, 6);
  assert.deepEqual(
    twentyTwoAcrossFour.emptyPetals.map((petal) => [petal.layerIndex, petal.slotIndex]),
    [[3, 4], [3, 5]]
  );
  assert.deepEqual(
    Array.from({ length: 4 }, (_, layerIndex) =>
      twentyTwoAcrossFour.petals.find((petal) => petal.layerIndex === layerIndex)?.angle
    ),
    [-90, -105, -120, -135]
  );
});

test("successive layers continue clockwise through the closing petal gap", () => {
  const fiveByTwo = layoutRelationshipFlowerPetals(
    Array.from({ length: 9 }, () => ({})),
    { hubRadius: 88, maxPerLayer: 9, density: "comfortable", layerCount: 2 }
  );
  const fiveByTwoPlacements = [...fiveByTwo.petals, ...fiveByTwo.emptyPetals];

  assert.deepEqual(fiveByTwo.layerCounts, [5, 4]);
  assert.deepEqual(
    [0, 1].map((layerIndex) => fiveByTwoPlacements
      .filter((petal) => petal.layerIndex === layerIndex)
      .sort((first, second) => first.slotIndex - second.slotIndex)
      .map((petal) => petal.angle)),
    [
      [-90, -18, 54, 126, 198],
      [-126, -54, 18, 90, 162],
    ]
  );
  assert.equal(fiveByTwo.petals.find((petal) => petal.index === 5)?.angle, -126);

  const threeByThree = layoutRelationshipFlowerPetals(
    Array.from({ length: 9 }, () => ({})),
    { hubRadius: 88, maxPerLayer: 9, density: "comfortable", layerCount: 3 }
  );
  assert.deepEqual(threeByThree.layerCounts, [3, 3, 3]);
  assert.deepEqual(
    [0, 1, 2].map((layerIndex) => threeByThree.petals
      .filter((petal) => petal.layerIndex === layerIndex)
      .sort((first, second) => first.slotIndex - second.slotIndex)
      .map((petal) => petal.angle)),
    [
      [-90, 30, 150],
      [-130, -10, 110],
      [-170, -50, 70],
    ]
  );
});

test("dense flowers attach every compact nested layer beneath the hub", () => {
  const result = layoutRelationshipFlowerPetals(
    Array.from({ length: 24 }, () => ({})),
    { hubRadius: 88, maxPerLayer: 9, density: "comfortable" }
  );
  assert.deepEqual(result.layerCounts, [8, 8, 8]);
  const layers = result.layerCounts.map((_, layerIndex) =>
    result.petals.filter((petal) => petal.layerIndex === layerIndex)
  );
  assert.equal(layers[0][0].angle, -90);
  assert.equal(layers[1][0].angle, -105);
  assert.equal(layers[2][0].angle, -120);
  const attachmentRootRadius = 88 * 0.68;
  assert.ok(result.petals.every((petal) =>
    Math.abs(petal.rootRadius - attachmentRootRadius) <= 0.001
  ));
  assert.ok(result.petals.every((petal) => petal.rootRadius < 88));
  const labels = layers.map((layer) => layer[0].labelCenterRadius);
  const tips = layers.map((layer) => layer[0].rootRadius + layer[0].length);
  const visibleTails = tips.map((tip, layerIndex) => tip - labels[layerIndex]);
  assert.ok(visibleTails[1] > visibleTails[0]);
  assert.ok(visibleTails[2] > visibleTails[1]);
  for (let layerIndex = 1; layerIndex < layers.length; layerIndex += 1) {
    const foreground = layers[layerIndex - 1][0];
    const nested = layers[layerIndex][0];
    assert.equal(nested.rootRadius, foreground.rootRadius);
    assert.ok(
      nested.rootRadius + nested.length > foreground.rootRadius + foreground.length,
      `layer ${layerIndex} does not reveal a tip beyond its foreground layer`
    );
  }
  assert.ok(layers[1][0].halfWidth > layers[0][0].halfWidth);
  assert.ok(layers[2][0].halfWidth > layers[1][0].halfWidth);
  assert.equal(new Set(result.petals.map((petal) => petal.labelRegionRadius)).size, 1);
  assert.equal(new Set(result.petals.map((petal) => petal.sectorHalfAngleDegrees)).size, 1);
  assert.ok(result.maximumExtent < 720, `nested flower extent is ${result.maximumExtent}px`);
  result.petals.forEach(assertSafeLabelCircleInside);
  assertSameLayerBodiesAndFullBounds(result, 0);
});

test("an explicit layer count is exact even when automatic density would add a layer", () => {
  const result = layoutRelationshipFlowerPetals(
    Array.from({ length: 24 }, () => ({})),
    { hubRadius: 88, maxPerLayer: 9, density: "comfortable", layerCount: 2 }
  );

  assert.deepEqual(result.layerCounts, [12, 12]);
  assert.equal(result.layerSlotCount, 12);
  assert.equal(result.petals.length, 24);
  assert.deepEqual(result.emptyPetals, []);
  assert.equal(result.petals.find((petal) => petal.layerIndex === 0)?.angle, -90);
  assert.equal(result.petals.find((petal) => petal.layerIndex === 1)?.angle, -105);
  assertSameLayerBodiesAndFullBounds(result, 0);
});

test("an exact layer request retains complete placeholder-only layers", () => {
  const result = layoutRelationshipFlowerPetals(
    Array.from({ length: 3 }, () => ({})),
    { hubRadius: 88, maxPerLayer: 9, density: "comfortable", layerCount: 6 }
  );

  assert.deepEqual(result.layerCounts, [1, 1, 1, 0, 0, 0]);
  assert.equal(result.layerSlotCount, 1);
  assert.equal(result.petals.length, 3);
  assert.equal(result.emptyPetals.length, 3);
  const placements = [...result.petals, ...result.emptyPetals];
  assert.deepEqual(
    Array.from({ length: 6 }, (_, layerIndex) =>
      placements.filter((placement) => placement.layerIndex === layerIndex).length
    ),
    [1, 1, 1, 1, 1, 1]
  );
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

test("six attached layers preserve their full safe circles at every density", () => {
  for (const density of ["compact", "comfortable", "spacious"] as const) {
    const result = layoutRelationshipFlowerPetals(
      Array.from({ length: 54 }, () => ({})),
      { hubRadius: 88, maxPerLayer: 9, density }
    );
    assert.equal(result.layerCounts.length, 6);
    result.petals.forEach((petal) => {
      assert.ok(Math.abs(petal.rootRadius - 88 * 0.68) <= 0.001);
      assertSafeLabelCircleInside(petal);
      const geometry = geometryFor(petal);
      assert.equal(
        geometry.profile.labelRegionRadius,
        result.labelRegionRadius,
        `${density} layer ${petal.layerIndex} reduced its fixed label region`
      );
      assert.ok(
        Math.abs(Math.hypot(geometry.profile.labelCenter.x, geometry.profile.labelCenter.y)
          - petal.labelCenterRadius) <= 0.001,
        `${density} layer ${petal.layerIndex} moved its label center`
      );
      assert.ok(
        (petal.labelCenterRadius - petal.rootRadius) / petal.length < 0.9,
        `${density} layer ${petal.layerIndex} exceeds the structural offset range`
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
  assert.equal(result.layerSlotCount, 24);
  assert.deepEqual(result.emptyPetals, []);
  assert.ok(result.petals[0].sectorHalfAngleDegrees * 2 <= 360 / 24 - 1.4);
  assertSameLayerBodiesAndFullBounds(result, 0);
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
  assert.equal(result.layerSlotCount, 3);
  assert.deepEqual(
    result.emptyPetals.map((petal) => [petal.layerIndex, petal.slotIndex]),
    [[0, 2]]
  );
  const firstLayer = [...result.petals, ...result.emptyPetals]
    .filter((petal) => petal.layerIndex === 0);
  assert.deepEqual(
    firstLayer.sort((first, second) => first.slotIndex - second.slotIndex)
      .map((petal) => petal.angle),
    [-90, 30, 150]
  );
  const placeholder = result.emptyPetals[0];
  const placeholderGeometry = geometryFor(placeholder);
  const placeholderHull = convexHull(placeholderGeometry.segments.flatMap((segment) => [
    segment.start,
    segment.control1,
    segment.control2,
    segment.end,
  ]));
  result.petals
    .filter((petal) => petal.layerIndex > placeholder.layerIndex)
    .forEach((petal) => {
      const center = point(petal.labelCenterRadius, petal.angle);
      assert.ok(
        pointToConvexBodyDistance(center, placeholderHull) + 0.011
          >= petal.labelRegionRadius + 88 * 0.035 / 2,
        `back-layer label ${petal.index} intersects the foreground placeholder body`
      );
    });
});

test("unpinned petals fill inner deficits without moving hard-pinned petals", () => {
  const inputs = [
    {},
    {},
    {},
    {},
    {},
    { preferredLayer: 2 },
    { preferredLayer: 2 },
  ];
  const result = layoutRelationshipFlowerPetals(inputs, {
    hubRadius: 88,
    maxPerLayer: 9,
    density: "comfortable",
    layerCount: 2,
  });
  assert.deepEqual(result.layerCounts, [4, 3]);
  assert.equal(result.layerSlotCount, 4);
  assert.deepEqual(result.petals.map((petal) => petal.index), [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(result.petals.map((petal) => petal.layerIndex), [0, 0, 0, 0, 1, 1, 1]);
  assert.equal(result.petals[5].layerIndex, 1);
  assert.equal(result.petals[6].layerIndex, 1);
  assert.deepEqual(
    result.emptyPetals.map((petal) => [petal.layerIndex, petal.slotIndex]),
    [[1, 3]]
  );
});

test("bounds remain finite for empty and invalid input", () => {
  const empty = layoutRelationshipFlowerPetals([], {
    hubRadius: Number.NaN,
    maxPerLayer: Number.NaN,
    density: "comfortable",
  });
  assert.deepEqual(empty.petals, []);
  assert.deepEqual(empty.emptyPetals, []);
  assert.deepEqual(empty.layerCounts, []);
  assert.equal(empty.layerSlotCount, 0);
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
