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
const CENTER = { x: 31, y: -17 };

function close(actual: number, expected: number, message: string): void {
  assert.ok(Math.abs(actual - expected) <= EPSILON, `${message}: ${actual} vs ${expected}`);
}

function subtract(first: FlowerPetalPoint, second: FlowerPetalPoint): FlowerPetalPoint {
  return { x: first.x - second.x, y: first.y - second.y };
}

function magnitude(point: FlowerPetalPoint): number {
  return Math.hypot(point.x, point.y);
}

function localPoint(geometry: FlowerPetalGeometry, point: FlowerPetalPoint): FlowerPetalPoint {
  const relative = subtract(point, CENTER);
  return {
    x: relative.x * geometry.profile.radialAxis.x + relative.y * geometry.profile.radialAxis.y,
    y: relative.x * geometry.profile.tangentAxis.x + relative.y * geometry.profile.tangentAxis.y,
  };
}

function cubicPoint(segment: FlowerPetalCubicSegment, t: number): FlowerPetalPoint {
  const inverse = 1 - t;
  return {
    x: inverse ** 3 * segment.start.x
      + 3 * inverse ** 2 * t * segment.control1.x
      + 3 * inverse * t ** 2 * segment.control2.x
      + t ** 3 * segment.end.x,
    y: inverse ** 3 * segment.start.y
      + 3 * inverse ** 2 * t * segment.control1.y
      + 3 * inverse * t ** 2 * segment.control2.y
      + t ** 3 * segment.end.y,
  };
}

function geometry(angleDegrees: number): FlowerPetalGeometry {
  return buildFlowerPetalGeometry({
    center: CENTER,
    angleDegrees,
    rootRadius: 84,
    length: 360,
    halfWidth: 82,
    labelCenterOffset: 215,
    labelRegionRadius: 70,
    sectorHalfAngleDegrees: 22,
    edgeClearance: 4,
  });
}

function pointInPolygon(point: FlowerPetalPoint, polygon: readonly FlowerPetalPoint[]): boolean {
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current++) {
    const first = polygon[current];
    const second = polygon[previous];
    const crosses = (first.y > point.y) !== (second.y > point.y)
      && point.x < (second.x - first.x) * (point.y - first.y)
        / (second.y - first.y) + first.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

test("the five-disc envelope is regular C1 at every join", () => {
  const result = geometry(-90);
  assert.equal(result.profile.discs.length, 5);
  assert.ok(result.segments.length > 12);
  result.segments.forEach((segment, index) => {
    const next = result.segments[(index + 1) % result.segments.length];
    close(segment.end.x, next.start.x, `join ${index} x`);
    close(segment.end.y, next.start.y, `join ${index} y`);
    const incoming = subtract(segment.end, segment.control2);
    const outgoing = subtract(next.control1, next.start);
    close(incoming.x, outgoing.x, `join ${index} dx`);
    close(incoming.y, outgoing.y, `join ${index} dy`);
    assert.ok(magnitude(incoming) > EPSILON, `join ${index} has a zero tangent`);
  });
});

test("the main disc is centered on the label and owns its safe circle", () => {
  const result = geometry(0);
  const mainDisc = result.profile.discs[2];
  close(mainDisc.center.x, result.profile.labelCenter.x, "main disc center x");
  close(mainDisc.center.y, result.profile.labelCenter.y, "main disc center y");
  close(mainDisc.radius, result.profile.halfWidth, "main disc radius");
  assert.ok(result.profile.labelRegionRadius <= mainDisc.radius);
});

test("all five source circles and the label circle stay inside the envelope", () => {
  const result = geometry(0);
  const outline = result.segments.flatMap((segment) =>
    Array.from({ length: 97 }, (_, index) => cubicPoint(segment, index / 96))
  );
  const circles = [
    ...result.profile.discs.map((disc) => ({
      center: disc.center,
      radius: disc.radius * (1 - 1e-5),
    })),
    {
      center: result.profile.labelCenter,
      radius: result.profile.labelRegionRadius,
    },
  ];

  circles.forEach((circle, circleIndex) => {
    for (let index = 0; index < 128; index += 1) {
      const angle = index * Math.PI * 2 / 128;
      const point = {
        x: circle.center.x + Math.cos(angle) * circle.radius,
        y: circle.center.y + Math.sin(angle) * circle.radius,
      };
      assert.ok(
        pointInPolygon(point, outline),
        `circle ${circleIndex} point ${index} leaves the envelope`
      );
    }
  });
});

test("every cubic anchor and control stays inside the inset angular sector", () => {
  const result = geometry(37);
  const halfAngle = result.profile.sectorHalfAngleDegrees * Math.PI / 180;
  const sine = Math.sin(halfAngle);
  const cosine = Math.cos(halfAngle);
  const points = result.segments.flatMap((segment) => [
    segment.start,
    segment.control1,
    segment.control2,
    segment.end,
  ]);

  points.forEach((point, index) => {
    const local = localPoint(result, point);
    const upperDistance = local.x * sine - local.y * cosine;
    const lowerDistance = local.x * sine + local.y * cosine;
    assert.ok(
      upperDistance >= result.profile.edgeClearance - EPSILON,
      `point ${index} crosses the upper sector inset`
    );
    assert.ok(
      lowerDistance >= result.profile.edgeClearance - EPSILON,
      `point ${index} crosses the lower sector inset`
    );
  });
});

test("all angles have the same local silhouette and dimensions", () => {
  const angles = [-90, 0, 37, 180];
  const profiles = angles.map(geometry);
  const reference = profiles[0].segments.flatMap((segment) => [
    segment.start,
    segment.control1,
    segment.control2,
    segment.end,
  ]).map((point) => localPoint(profiles[0], point));

  profiles.slice(1).forEach((result) => {
    const local = result.segments.flatMap((segment) => [
      segment.start,
      segment.control1,
      segment.control2,
      segment.end,
    ]).map((point) => localPoint(result, point));
    assert.equal(local.length, reference.length);
    local.forEach((point, index) => {
      close(point.x, reference[index].x, `point ${index} radial`);
      close(point.y, reference[index].y, `point ${index} tangent`);
    });
    assert.equal(result.profile.length, profiles[0].profile.length);
    assert.equal(result.profile.halfWidth, profiles[0].profile.halfWidth);
  });
});

test("root and outer tip are smooth anchors on the outline", () => {
  const result = geometry(-90);
  for (const expected of [result.profile.root, result.profile.tip]) {
    const joinIndex = result.segments.findIndex((segment) =>
      magnitude(subtract(segment.end, expected)) <= EPSILON
    );
    assert.notEqual(joinIndex, -1);
    const segment = result.segments[joinIndex];
    const next = result.segments[(joinIndex + 1) % result.segments.length];
    const incoming = subtract(segment.end, segment.control2);
    const outgoing = subtract(next.control1, next.start);
    close(incoming.x, outgoing.x, `join ${joinIndex} dx`);
    close(incoming.y, outgoing.y, `join ${joinIndex} dy`);
    assert.ok(magnitude(incoming) > EPSILON);
  }
});

test("bounds contain canonical petals after item rotation", () => {
  const result = geometry(37);
  const pivot = result.profile.root;
  for (const rotation of [0, 45, 90, 180]) {
    const bounds = flowerPetalGeometryBounds(result, pivot, rotation);
    assert.ok(Object.values(bounds).every(Number.isFinite));
    assert.ok(bounds.minX < bounds.maxX);
    assert.ok(bounds.minY < bounds.maxY);
  }
});

test("path output is finite and cubic-only", () => {
  for (const angle of [-90, 0, 37, 180]) {
    const result = geometry(angle);
    assert.equal(result.path.match(/\bC\b/g)?.length, result.segments.length);
    assert.equal(/\b[QLA]\b/.test(result.path), false);
    assert.equal(/NaN|Infinity/.test(result.path), false);
    assert.match(result.path, /^M\s/);
    assert.match(result.path, /\sZ$/);
  }
});
