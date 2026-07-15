export type FlowerPetalPoint = {
  x: number;
  y: number;
};

export type FlowerPetalCubicSegment = {
  start: FlowerPetalPoint;
  control1: FlowerPetalPoint;
  control2: FlowerPetalPoint;
  end: FlowerPetalPoint;
};

/**
 * A canonical petal is defined only by flower geometry. Label measurements
 * are deliberately absent: content is fitted after the flower is drawn.
 */
export type FlowerPetalGeometryInput = {
  center: FlowerPetalPoint;
  angleDegrees: number;
  rootRadius: number;
  length: number;
  halfWidth: number;
  labelCenterOffset?: number;
  labelRegionRadius?: number;
};

export type FlowerPetalProfile = {
  radialAxis: FlowerPetalPoint;
  tangentAxis: FlowerPetalPoint;
  root: FlowerPetalPoint;
  tip: FlowerPetalPoint;
  labelCenter: FlowerPetalPoint;
  rootRadius: number;
  tipRadius: number;
  length: number;
  halfWidth: number;
  labelCenterOffset: number;
  labelRegionRadius: number;
};

export type FlowerPetalGeometry = {
  segments: FlowerPetalCubicSegment[];
  path: string;
  profile: FlowerPetalProfile;
};

export type FlowerPetalBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function positiveOr(value: number, fallback: number): number {
  return Math.max(1, finiteOr(value, fallback));
}

function pathForSegments(segments: readonly FlowerPetalCubicSegment[]): string {
  if (!segments.length) return "";
  return [
    "M",
    segments[0].start.x,
    segments[0].start.y,
    ...segments.flatMap((segment) => [
      "C",
      segment.control1.x,
      segment.control1.y,
      segment.control2.x,
      segment.control2.y,
      segment.end.x,
      segment.end.y,
    ]),
    "Z",
  ].join(" ");
}

/**
 * Conservative bounds for the cubic outline after an optional item rotation.
 * Cubic curves remain inside the convex hull of their controls, so including
 * every transformed anchor and control point prevents rotated petals from
 * being clipped by the SVG viewBox.
 */
export function flowerPetalGeometryBounds(
  geometry: FlowerPetalGeometry,
  pivot: FlowerPetalPoint,
  rotationDegrees = 0
): FlowerPetalBounds {
  const radians = finiteOr(rotationDegrees, 0) * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const rotate = (point: FlowerPetalPoint): FlowerPetalPoint => {
    const x = point.x - pivot.x;
    const y = point.y - pivot.y;
    return {
      x: pivot.x + x * cosine - y * sine,
      y: pivot.y + x * sine + y * cosine,
    };
  };
  const points = geometry.segments.flatMap((segment) => [
    segment.start,
    segment.control1,
    segment.control2,
    segment.end,
  ]).map(rotate);

  return points.reduce<FlowerPetalBounds>((bounds, point) => ({
    minX: Math.min(bounds.minX, point.x),
    minY: Math.min(bounds.minY, point.y),
    maxX: Math.max(bounds.maxX, point.x),
    maxY: Math.max(bounds.maxY, point.y),
  }), {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  });
}

/**
 * Build one smooth lotus-like petal. Every petal using the same profile is
 * byte-for-byte identical in local space; only its root position and angle
 * change around the flower.
 */
export function buildFlowerPetalGeometry(input: FlowerPetalGeometryInput): FlowerPetalGeometry {
  const center = {
    x: finiteOr(input.center.x, 0),
    y: finiteOr(input.center.y, 0),
  };
  const rootRadius = Math.max(0, finiteOr(input.rootRadius, 0));
  const length = positiveOr(input.length, 240);
  const halfWidth = positiveOr(input.halfWidth, 100);
  const labelCenterOffset = Math.max(
    length * 0.35,
    Math.min(length * 0.75, finiteOr(input.labelCenterOffset ?? length * 0.58, length * 0.58))
  );
  const labelRegionRadius = Math.max(
    1,
    Math.min(
      halfWidth * 0.82,
      length * 0.34,
      finiteOr(input.labelRegionRadius ?? Math.min(halfWidth * 0.72, length * 0.29), halfWidth * 0.72)
    )
  );
  const angleRadians = finiteOr(input.angleDegrees, -90) * Math.PI / 180;
  const radialAxis = {
    x: Math.cos(angleRadians),
    y: Math.sin(angleRadians),
  };
  const tangentAxis = {
    x: -radialAxis.y,
    y: radialAxis.x,
  };
  const at = (outward: number, tangent = 0): FlowerPetalPoint => ({
    x: center.x + radialAxis.x * (rootRadius + outward) + tangentAxis.x * tangent,
    y: center.y + radialAxis.y * (rootRadius + outward) + tangentAxis.y * tangent,
  });

  const root = at(0);
  const upper = at(length * 0.47, halfWidth);
  const tip = at(length);
  const lower = at(length * 0.47, -halfWidth);
  const segments: FlowerPetalCubicSegment[] = [
    {
      start: root,
      control1: at(0, halfWidth * 0.28),
      control2: at(length * 0.30, halfWidth),
      end: upper,
    },
    {
      start: upper,
      control1: at(length * 0.64, halfWidth),
      control2: at(length, halfWidth * 0.18),
      end: tip,
    },
    {
      start: tip,
      control1: at(length, -halfWidth * 0.18),
      control2: at(length * 0.64, -halfWidth),
      end: lower,
    },
    {
      start: lower,
      control1: at(length * 0.30, -halfWidth),
      control2: at(0, -halfWidth * 0.28),
      end: root,
    },
  ];

  return {
    segments,
    path: pathForSegments(segments),
    profile: {
      radialAxis,
      tangentAxis,
      root,
      tip,
      labelCenter: at(labelCenterOffset),
      rootRadius,
      tipRadius: rootRadius + length,
      length,
      halfWidth,
      labelCenterOffset,
      labelRegionRadius,
    },
  };
}
