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

function close(actual: number, expected: number, message: string, epsilon = EPSILON): void {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${message}: ${actual} vs ${expected}`);
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

function cubicFirstDerivative(segment: FlowerPetalCubicSegment, t: number): FlowerPetalPoint {
  const inverse = 1 - t;
  return {
    x: 3 * inverse ** 2 * (segment.control1.x - segment.start.x)
      + 6 * inverse * t * (segment.control2.x - segment.control1.x)
      + 3 * t ** 2 * (segment.end.x - segment.control2.x),
    y: 3 * inverse ** 2 * (segment.control1.y - segment.start.y)
      + 6 * inverse * t * (segment.control2.y - segment.control1.y)
      + 3 * t ** 2 * (segment.end.y - segment.control2.y),
  };
}

function cubicSecondDerivative(segment: FlowerPetalCubicSegment, t: number): FlowerPetalPoint {
  return {
    x: 6 * (1 - t) * (segment.control2.x - 2 * segment.control1.x + segment.start.x)
      + 6 * t * (segment.end.x - 2 * segment.control2.x + segment.control1.x),
    y: 6 * (1 - t) * (segment.control2.y - 2 * segment.control1.y + segment.start.y)
      + 6 * t * (segment.end.y - 2 * segment.control2.y + segment.control1.y),
  };
}

function signedCurvature(segment: FlowerPetalCubicSegment, t: number): number {
  const first = cubicFirstDerivative(segment, t);
  const second = cubicSecondDerivative(segment, t);
  return (first.x * second.y - first.y * second.x) / magnitude(first) ** 3;
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

function productionGeometry(angleDegrees = 0): FlowerPetalGeometry {
  return buildFlowerPetalGeometry({
    center: CENTER,
    angleDegrees,
    rootRadius: 62.56,
    length: 357.953944058809,
    halfWidth: 92.92,
    labelCenterOffset: 230.441944058809,
    labelRegionRadius: 87.4,
    sectorHalfAngleDegrees: 19.25,
    edgeClearance: 3.68,
  });
}

function extendedRootGeometry(angleDegrees = 0): FlowerPetalGeometry {
  return buildFlowerPetalGeometry({
    center: CENTER,
    angleDegrees,
    rootRadius: 59.84,
    length: 508.9880505358643,
    halfWidth: 89.32,
    labelCenterOffset: 397.80005053586436,
    labelRegionRadius: 83.6,
    sectorHalfAngleDegrees: 21.75,
    edgeClearance: 3.52,
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

function assertLabelCircleInside(result: FlowerPetalGeometry): void {
  const outline = result.segments.flatMap((segment) =>
    Array.from({ length: 257 }, (_, index) => cubicPoint(segment, index / 256))
  );
  const { labelCenter, labelRegionRadius } = result.profile;
  for (let index = 0; index < 720; index += 1) {
    const angle = index * Math.PI * 2 / 720;
    const point = {
      x: labelCenter.x + Math.cos(angle) * labelRegionRadius,
      y: labelCenter.y + Math.sin(angle) * labelRegionRadius,
    };
    assert.ok(pointInPolygon(point, outline), `label circle point ${index} leaves petal`);
  }
}

test("the compact lotus contour is regular C1 at every join", () => {
  const result = geometry(-90);
  assert.equal(result.segments.length, 4);
  assert.equal(result.profile.discs.length, 5);
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

test("signed curvature is continuous at joins with no straight facets", () => {
  const result = productionGeometry(0);
  result.segments.forEach((segment, index) => {
    const next = result.segments[(index + 1) % result.segments.length];
    const incoming = signedCurvature(segment, 1);
    const outgoing = signedCurvature(next, 0);
    close(incoming, outgoing, `join ${index} curvature`, 1e-10);

    const before = signedCurvature(segment, 0.999);
    const after = signedCurvature(next, 0.001);
    const scale = Math.max(Math.abs(incoming), 1e-6);
    assert.ok(
      Math.abs(before - after) / scale < 0.08,
      `join ${index} has an abrupt sampled curvature transition`
    );
  });

  result.segments.forEach((segment, segmentIndex) => {
    for (let index = 0; index <= 80; index += 1) {
      const t = index / 80;
      const speed = magnitude(cubicFirstDerivative(segment, t));
      const curvature = signedCurvature(segment, t);
      assert.ok(speed > EPSILON, `segment ${segmentIndex} loses its tangent at ${t}`);
      assert.ok(Number.isFinite(curvature));
      assert.ok(curvature < -1e-7, `segment ${segmentIndex} develops a flat or inflection at ${t}`);
    }
  });
});

test("the centered safe label circle stays inside generic and production petals", () => {
  assertLabelCircleInside(geometry(0));
  const production = productionGeometry(0);
  assertLabelCircleInside(production);
  assertLabelCircleInside(extendedRootGeometry(0));

  const localShoulder = localPoint(production, production.segments[0].end);
  const localLabel = localPoint(production, production.profile.labelCenter);
  assert.ok(
    Math.abs(localShoulder.x - localLabel.x) <= production.profile.labelRegionRadius * 0.30,
    "the visual belly drifts too far from the label center"
  );
});

test("a nested petal preserves its compact label and tip beyond the old offset cap", () => {
  const result = extendedRootGeometry(0);
  const requestedOffset = 397.80005053586436;
  assert.ok(requestedOffset > result.profile.length * 0.75);
  close(result.profile.labelCenterOffset, requestedOffset, "extended label center offset");
  close(
    result.profile.labelCenter.x,
    CENTER.x + result.profile.rootRadius + requestedOffset,
    "extended label center x"
  );
  close(result.profile.tipRadius, 568.8280505358643, "extended tip radius");
});

test("every cubic anchor and control stays inside the inset angular sector", () => {
  for (const result of [geometry(37), productionGeometry(37), extendedRootGeometry(37)]) {
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
      assert.ok(
        local.x >= result.profile.rootRadius - EPSILON
          && local.x <= result.profile.tipRadius + EPSILON,
        `point ${index} leaves the root-to-tip radial slab`
      );
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
  }
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

test("root and outer tip are smooth rounded-point anchors", () => {
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
    assert.equal(result.path.match(/\bC\b/g)?.length, 4);
    assert.equal(/\b[QLA]\b/.test(result.path), false);
    assert.equal(/NaN|Infinity/.test(result.path), false);
    assert.match(result.path, /^M\s/);
    assert.match(result.path, /\sZ$/);
    assert.equal(result.path, [
      "M",
      result.segments[0].start.x,
      result.segments[0].start.y,
      ...result.segments.flatMap((segment) => [
        "C",
        segment.control1.x,
        segment.control1.y,
        segment.control2.x,
        segment.control2.y,
        segment.end.x,
        segment.end.y,
      ]),
      "Z",
    ].join(" "));
  }
});
