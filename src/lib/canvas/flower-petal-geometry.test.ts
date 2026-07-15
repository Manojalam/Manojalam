import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFlowerPetalGeometry,
  flowerPetalGeometryBounds,
  type FlowerPetalCubicSegment,
  type FlowerPetalGeometry,
  type FlowerPetalPoint,
} from "./flower-petal-geometry";

const EPSILON = 1e-8;

function close(actual: number, expected: number, message: string): void {
  assert.ok(
    Math.abs(actual - expected) <= EPSILON,
    `${message}: expected ${expected}, received ${actual}`
  );
}

function closePoint(actual: FlowerPetalPoint, expected: FlowerPetalPoint, message: string): void {
  close(actual.x, expected.x, `${message} x`);
  close(actual.y, expected.y, `${message} y`);
}

function subtract(first: FlowerPetalPoint, second: FlowerPetalPoint): FlowerPetalPoint {
  return { x: first.x - second.x, y: first.y - second.y };
}

function magnitude(point: FlowerPetalPoint): number {
  return Math.hypot(point.x, point.y);
}

function dot(first: FlowerPetalPoint, second: FlowerPetalPoint): number {
  return first.x * second.x + first.y * second.y;
}

function localPoint(geometry: FlowerPetalGeometry, point: FlowerPetalPoint): FlowerPetalPoint {
  const relative = subtract(point, TEST_CENTER);
  return {
    x: dot(relative, geometry.profile.radialAxis),
    y: dot(relative, geometry.profile.tangentAxis),
  };
}

function cubicPoint(segment: FlowerPetalCubicSegment, t: number): FlowerPetalPoint {
  const inverse = 1 - t;
  return {
    x:
      inverse ** 3 * segment.start.x
      + 3 * inverse ** 2 * t * segment.control1.x
      + 3 * inverse * t ** 2 * segment.control2.x
      + t ** 3 * segment.end.x,
    y:
      inverse ** 3 * segment.start.y
      + 3 * inverse ** 2 * t * segment.control1.y
      + 3 * inverse * t ** 2 * segment.control2.y
      + t ** 3 * segment.end.y,
  };
}

const TEST_CENTER = { x: 41, y: -23 };

function contentCenter(angleDegrees: number, radius: number): FlowerPetalPoint {
  const radians = angleDegrees * Math.PI / 180;
  return {
    x: TEST_CENTER.x + Math.cos(radians) * radius,
    y: TEST_CENTER.y + Math.sin(radians) * radius,
  };
}

const CASES = [
  { name: "long narrow", angleDegrees: -90, radius: 430, width: 180, height: 560, hubRadius: 110 },
  { name: "short wide", angleDegrees: 0, radius: 390, width: 180, height: 560, hubRadius: 110 },
  { name: "square diagonal", angleDegrees: 37, radius: 360, width: 260, height: 260, hubRadius: 104 },
  { name: "minimum size reversed", angleDegrees: 180, radius: 120, width: 1, height: 1, hubRadius: 48 },
] as const;

function geometryFor(testCase: (typeof CASES)[number]): FlowerPetalGeometry {
  return buildFlowerPetalGeometry({
    center: TEST_CENTER,
    contentCenter: contentCenter(testCase.angleDegrees, testCase.radius),
    contentWidth: testCase.width,
    contentHeight: testCase.height,
    angleDegrees: testCase.angleDegrees,
    hubRadius: testCase.hubRadius,
  });
}

for (const testCase of CASES) {
  test(`${testCase.name} petal is a closed regular C1 cubic`, () => {
    const geometry = geometryFor(testCase);
    assert.equal(geometry.segments.length, 8);

    geometry.segments.forEach((segment, index) => {
      const next = geometry.segments[(index + 1) % geometry.segments.length];
      closePoint(segment.end, next.start, `join ${index} position`);
      const incoming = subtract(segment.end, segment.control2);
      const outgoing = subtract(next.control1, next.start);
      closePoint(incoming, outgoing, `join ${index} derivative`);
      assert.ok(magnitude(incoming) > EPSILON, `join ${index} must have a regular tangent`);
    });
  });
}

test("outer tip uses one nonzero tangent perpendicular to the radial axis", () => {
  for (const testCase of CASES) {
    const geometry = geometryFor(testCase);
    const incoming = subtract(geometry.segments[2].end, geometry.segments[2].control2);
    const outgoing = subtract(geometry.segments[3].control1, geometry.segments[3].start);
    closePoint(incoming, outgoing, `${testCase.name} tip derivative`);
    assert.ok(magnitude(incoming) > EPSILON);
    close(dot(incoming, geometry.profile.radialAxis), 0, `${testCase.name} radial tip component`);
  }
});

test("petal controls remain symmetric and monotonic without loops", () => {
  for (const testCase of CASES) {
    const geometry = geometryFor(testCase);
    const anchors = geometry.segments.map((segment) => localPoint(geometry, segment.start));
    for (const [first, second] of [[0, 6], [1, 5], [2, 4]] as const) {
      close(anchors[first].x, anchors[second].x, `${testCase.name} mirrored radius`);
      close(anchors[first].y, -anchors[second].y, `${testCase.name} mirrored width`);
    }
    close(anchors[3].y, 0, `${testCase.name} tip center`);
    close(anchors[7].y, 0, `${testCase.name} base center`);

    for (const index of [0, 1, 2]) {
      const values = [
        geometry.segments[index].start,
        geometry.segments[index].control1,
        geometry.segments[index].control2,
        geometry.segments[index].end,
      ].map((point) => localPoint(geometry, point).x);
      values.slice(1).forEach((value, valueIndex) => {
        assert.ok(value >= values[valueIndex] - EPSILON, `${testCase.name} segment ${index} folds outward`);
      });
    }
    for (const index of [3, 4, 5]) {
      const values = [
        geometry.segments[index].start,
        geometry.segments[index].control1,
        geometry.segments[index].control2,
        geometry.segments[index].end,
      ].map((point) => localPoint(geometry, point).x);
      values.slice(1).forEach((value, valueIndex) => {
        assert.ok(value <= values[valueIndex] + EPSILON, `${testCase.name} segment ${index} folds inward`);
      });
    }
  }
});

test("the smooth body contains the padded content span", () => {
  for (const testCase of CASES) {
    const geometry = geometryFor(testCase);
    const { contentNearRadius, contentFarRadius, contentHalfWidth } = geometry.profile;
    let sampledContentBoundary = false;
    for (const segment of geometry.segments.slice(0, 3)) {
      for (let step = 0; step <= 100; step += 1) {
        const point = localPoint(geometry, cubicPoint(segment, step / 100));
        if (point.x < contentNearRadius - EPSILON || point.x > contentFarRadius + EPSILON) continue;
        sampledContentBoundary = true;
        assert.ok(
          point.y >= contentHalfWidth - EPSILON,
          `${testCase.name} body narrows inside the padded content span`
        );
      }
    }
    assert.ok(sampledContentBoundary, `${testCase.name} content boundary was sampled`);
  }
});

test("path output is finite and contains only smooth cubic segments", () => {
  for (const testCase of CASES) {
    const geometry = geometryFor(testCase);
    assert.equal(geometry.path.match(/\bC\b/g)?.length, 8);
    assert.equal(/\b[QLA]\b/.test(geometry.path), false);
    assert.equal(/NaN|Infinity/.test(geometry.path), false);
    assert.match(geometry.path, /^M\s/);
    assert.match(geometry.path, /\sZ$/);
  }
});

test("bounds include petals rotated around their content center", () => {
  const geometry = geometryFor(CASES[0]);
  const pivot = contentCenter(CASES[0].angleDegrees, CASES[0].radius);
  const rotations = [0, 90, 180] as const;
  const boundsByRotation = rotations.map((rotation) =>
    flowerPetalGeometryBounds(geometry, pivot, rotation)
  );

  assert.notDeepEqual(boundsByRotation[0], boundsByRotation[1]);
  rotations.forEach((rotation, rotationIndex) => {
    const bounds = boundsByRotation[rotationIndex];
    const radians = rotation * Math.PI / 180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    geometry.segments.flatMap((segment) => [
      segment.start,
      segment.control1,
      segment.control2,
      segment.end,
    ]).forEach((point) => {
      const x = point.x - pivot.x;
      const y = point.y - pivot.y;
      const rotated = {
        x: pivot.x + x * cosine - y * sine,
        y: pivot.y + x * sine + y * cosine,
      };
      assert.ok(rotated.x >= bounds.minX - EPSILON && rotated.x <= bounds.maxX + EPSILON);
      assert.ok(rotated.y >= bounds.minY - EPSILON && rotated.y <= bounds.maxY + EPSILON);
    });
    assert.ok(Object.values(bounds).every(Number.isFinite));
    assert.ok(bounds.minX < bounds.maxX);
    assert.ok(bounds.minY < bounds.maxY);
  });
});
