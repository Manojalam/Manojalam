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
  /** Half of the angular slot available on either side of the radial axis. */
  sectorHalfAngleDegrees?: number;
  /** Perpendicular inset, in canvas units, from both edges of the slot. */
  edgeClearance?: number;
};

export type FlowerPetalDisc = {
  center: FlowerPetalPoint;
  radius: number;
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
  sectorHalfAngleDegrees: number;
  edgeClearance: number;
  /** Compatibility construction guides; the outline is a smooth spline. */
  discs: FlowerPetalDisc[];
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

const GEOMETRY_EPSILON = 1e-7;
const SHOULDER_OFFSET_RATIO = 0.13;
const SHOULDER_HANDLE_RATIO = 0.37;
const END_HANDLE_RATIO = 0.19;

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function positiveOr(value: number, fallback: number): number {
  return Math.max(1, finiteOr(value, fallback));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
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
 * Build one soft lotus petal from four cubic spans. Opposite joins share the
 * same handle magnitudes: this gives exact C1 continuity and matching signed
 * curvature at the root, belly, and tip without any straight tangent facets.
 */
export function buildFlowerPetalGeometry(input: FlowerPetalGeometryInput): FlowerPetalGeometry {
  const center = {
    x: finiteOr(input.center.x, 0),
    y: finiteOr(input.center.y, 0),
  };
  const rootRadius = Math.max(0, finiteOr(input.rootRadius, 0));
  const length = positiveOr(input.length, 240);
  const tipRadius = rootRadius + length;
  const requestedHalfWidth = positiveOr(input.halfWidth, 100);
  const labelCenterOffset = clamp(
    finiteOr(input.labelCenterOffset ?? length * 0.58, length * 0.58),
    length * 0.35,
    length * 0.75
  );
  const labelCenterRadius = rootRadius + labelCenterOffset;
  const sectorHalfAngleDegrees = clamp(
    finiteOr(input.sectorHalfAngleDegrees ?? 89.5, 89.5),
    1,
    89.5
  );
  const sectorHalfAngleRadians = sectorHalfAngleDegrees * Math.PI / 180;
  const sectorSine = Math.sin(sectorHalfAngleRadians);
  const sectorCosine = Math.cos(sectorHalfAngleRadians);
  const requestedClearance = Math.max(0, finiteOr(input.edgeClearance ?? 0, 0));
  const edgeClearance = Math.min(
    requestedClearance,
    Math.max(0, rootRadius * sectorSine - GEOMETRY_EPSILON)
  );
  const radialRoom = Math.max(
    GEOMETRY_EPSILON,
    Math.min(labelCenterOffset, length - labelCenterOffset) - GEOMETRY_EPSILON
  );
  const sectorRoom = Math.max(
    GEOMETRY_EPSILON,
    labelCenterRadius * sectorSine - edgeClearance
  );
  const halfWidth = Math.max(
    GEOMETRY_EPSILON,
    Math.min(requestedHalfWidth, radialRoom, sectorRoom)
  );
  const labelRegionRadius = Math.max(
    GEOMETRY_EPSILON,
    Math.min(
      halfWidth,
      finiteOr(
        input.labelRegionRadius ?? Math.min(halfWidth * 0.72, length * 0.29),
        halfWidth * 0.72
      )
    )
  );

  // The upper-left belly control is the only non-endpoint control that can
  // approach a sector edge. Move the belly outward just enough to retain the
  // requested perpendicular gap; its mirrored control is then safe as well.
  let shoulderHandle = Math.max(
    GEOMETRY_EPSILON,
    labelRegionRadius * SHOULDER_HANDLE_RATIO
  );
  const minimumUpperControlRadius = sectorSine > GEOMETRY_EPSILON
    ? (halfWidth * sectorCosine + edgeClearance) / sectorSine
    : labelCenterRadius;
  const preferredShoulderRadius = labelCenterRadius
    + labelRegionRadius * SHOULDER_OFFSET_RATIO;
  const maximumShoulderRadius = Math.max(
    labelCenterRadius + GEOMETRY_EPSILON,
    tipRadius - shoulderHandle - GEOMETRY_EPSILON
  );
  const shoulderRadius = Math.min(
    maximumShoulderRadius,
    Math.max(
      preferredShoulderRadius,
      minimumUpperControlRadius + shoulderHandle + GEOMETRY_EPSILON
    )
  );
  if (shoulderRadius - shoulderHandle < minimumUpperControlRadius) {
    shoulderHandle = Math.max(
      GEOMETRY_EPSILON,
      shoulderRadius - minimumUpperControlRadius
    );
  }

  // One shared end handle makes the curvature on both sides of each belly
  // identical. It is capped against both sector edges at root and tip.
  const tangentCapacity = (radius: number): number => sectorCosine > GEOMETRY_EPSILON
    ? Math.max(0, (radius * sectorSine - edgeClearance) / sectorCosine)
    : halfWidth;
  const endHandle = Math.max(
    GEOMETRY_EPSILON,
    Math.min(
      halfWidth * END_HANDLE_RATIO,
      tangentCapacity(rootRadius),
      tangentCapacity(tipRadius)
    )
  );

  const root = { x: rootRadius, y: 0 };
  const upper = { x: shoulderRadius, y: halfWidth };
  const tip = { x: tipRadius, y: 0 };
  const lower = { x: shoulderRadius, y: -halfWidth };
  const localSegments: FlowerPetalCubicSegment[] = [
    {
      start: root,
      control1: { x: rootRadius, y: endHandle },
      control2: { x: shoulderRadius - shoulderHandle, y: halfWidth },
      end: upper,
    },
    {
      start: upper,
      control1: { x: shoulderRadius + shoulderHandle, y: halfWidth },
      control2: { x: tipRadius, y: endHandle },
      end: tip,
    },
    {
      start: tip,
      control1: { x: tipRadius, y: -endHandle },
      control2: { x: shoulderRadius + shoulderHandle, y: -halfWidth },
      end: lower,
    },
    {
      start: lower,
      control1: { x: shoulderRadius - shoulderHandle, y: -halfWidth },
      control2: { x: rootRadius, y: -endHandle },
      end: root,
    },
  ];

  const angleRadians = finiteOr(input.angleDegrees, -90) * Math.PI / 180;
  const radialAxis = {
    x: Math.cos(angleRadians),
    y: Math.sin(angleRadians),
  };
  const tangentAxis = {
    x: -radialAxis.y,
    y: radialAxis.x,
  };
  const toWorld = (point: FlowerPetalPoint): FlowerPetalPoint => ({
    x: center.x + radialAxis.x * point.x + tangentAxis.x * point.y,
    y: center.y + radialAxis.y * point.x + tangentAxis.y * point.y,
  });
  const segments = localSegments.map((segment) => ({
    start: toWorld(segment.start),
    control1: toWorld(segment.control1),
    control2: toWorld(segment.control2),
    end: toWorld(segment.end),
  }));
  const labelCenter = toWorld({ x: labelCenterRadius, y: 0 });
  const guideEndRadius = Math.max(GEOMETRY_EPSILON, endHandle);
  const guideShoulderRadius = Math.max(
    guideEndRadius,
    Math.min(halfWidth, labelRegionRadius * 0.68)
  );
  const guideDiscs = [
    { x: rootRadius + guideEndRadius, radius: guideEndRadius },
    {
      x: rootRadius + (labelCenterRadius - rootRadius) * 0.55,
      radius: guideShoulderRadius,
    },
    { x: labelCenterRadius, radius: halfWidth },
    {
      x: labelCenterRadius + (tipRadius - labelCenterRadius) * 0.50,
      radius: guideShoulderRadius,
    },
    { x: tipRadius - guideEndRadius, radius: guideEndRadius },
  ];

  return {
    segments,
    path: pathForSegments(segments),
    profile: {
      radialAxis,
      tangentAxis,
      root: toWorld(root),
      tip: toWorld(tip),
      labelCenter,
      rootRadius,
      tipRadius,
      length,
      halfWidth,
      labelCenterOffset,
      labelRegionRadius,
      sectorHalfAngleDegrees,
      edgeClearance,
      discs: guideDiscs.map((disc) => ({
        center: toWorld({ x: disc.x, y: 0 }),
        radius: disc.radius,
      })),
    },
  };
}
