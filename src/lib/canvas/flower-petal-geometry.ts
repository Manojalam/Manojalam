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

export type FlowerPetalGeometryInput = {
  center: FlowerPetalPoint;
  contentCenter: FlowerPetalPoint;
  contentWidth: number;
  contentHeight: number;
  angleDegrees: number;
  hubRadius: number;
  shapePadding?: number;
};

export type FlowerPetalProfile = {
  radialAxis: FlowerPetalPoint;
  tangentAxis: FlowerPetalPoint;
  contentNearRadius: number;
  contentFarRadius: number;
  contentHalfWidth: number;
  baseRadius: number;
  shoulderRadius: number;
  crownRadius: number;
  tipRadius: number;
  baseHalfWidth: number;
  shoulderHalfWidth: number;
  crownHalfWidth: number;
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

/** Cubic approximation constant for one quarter of an ellipse. */
export const FLOWER_PETAL_ELLIPSE_KAPPA = 0.5522847498307936;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

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
 * Build a closed, regular C1-continuous petal around an axis-aligned content
 * box. The body has a gentle shoulder while the outer and inner ends use
 * cubic half-ellipses, so neither end relies on a zero-length cusp control.
 */
export function buildFlowerPetalGeometry(input: FlowerPetalGeometryInput): FlowerPetalGeometry {
  const center = {
    x: finiteOr(input.center.x, 0),
    y: finiteOr(input.center.y, 0),
  };
  const contentCenter = {
    x: finiteOr(input.contentCenter.x, center.x),
    y: finiteOr(input.contentCenter.y, center.y),
  };
  const contentWidth = positiveOr(input.contentWidth, 1);
  const contentHeight = positiveOr(input.contentHeight, 1);
  const hubRadius = positiveOr(input.hubRadius, 1);
  const shapePadding = Math.max(0, finiteOr(input.shapePadding ?? 26, 26));
  const angleRadians = finiteOr(input.angleDegrees, -90) * Math.PI / 180;
  const radialAxis = {
    x: Math.cos(angleRadians),
    y: Math.sin(angleRadians),
  };
  const tangentAxis = {
    x: -radialAxis.y,
    y: radialAxis.x,
  };
  const contentHalfWidthX = contentWidth / 2 + shapePadding;
  const contentHalfHeightY = contentHeight / 2 + shapePadding;
  const radialHalfExtent =
    Math.abs(radialAxis.x) * contentHalfWidthX
    + Math.abs(radialAxis.y) * contentHalfHeightY;
  const contentHalfWidth =
    Math.abs(tangentAxis.x) * contentHalfWidthX
    + Math.abs(tangentAxis.y) * contentHalfHeightY;
  const contentCenterRadius = Math.hypot(
    contentCenter.x - center.x,
    contentCenter.y - center.y
  );
  const contentNearRadius = contentCenterRadius - radialHalfExtent;
  const contentFarRadius = contentCenterRadius + radialHalfExtent;

  // Keep the root under the hub while leaving enough radial room for a
  // gradual waist even when an unusually large content box reaches inward.
  const preferredBaseRadius = hubRadius * 0.7;
  const baseRadius = Math.max(
    hubRadius * 0.2,
    Math.min(preferredBaseRadius, contentNearRadius - 18)
  );
  const shoulderRadius = Math.max(baseRadius + 18, contentNearRadius - 12);
  const crownRadius = Math.max(contentFarRadius + 6, shoulderRadius + 48);
  const baseToShoulder = shoulderRadius - baseRadius;
  const shoulderToCrown = crownRadius - shoulderRadius;

  const baseHalfWidth = clamp(hubRadius * 0.15, 9, 24);
  const shoulderHalfWidth = contentHalfWidth + clamp(contentHalfWidth * 0.08, 6, 20);
  const crownHalfWidth = contentHalfWidth;
  // A deeper cap tapers the body into a soft botanical tip instead of the
  // shallow, rounded-rectangle end produced by a wide, flat half-ellipse.
  const desiredCapRadius = clamp(crownHalfWidth * 0.68, 30, 88);
  const capRadius = Math.max(
    6,
    Math.min(
      desiredCapRadius,
      shoulderToCrown * 0.55 / FLOWER_PETAL_ELLIPSE_KAPPA
    )
  );
  const tipRadius = crownRadius + capRadius;

  // Reuse each join handle on both adjacent cubics. That makes the first
  // derivative exactly equal, rather than only visually similar, at joins.
  const desiredBaseDepth = clamp(hubRadius * 0.14, 12, 26);
  const baseDepth = Math.min(
    desiredBaseDepth,
    baseToShoulder * 0.45 / FLOWER_PETAL_ELLIPSE_KAPPA
  );
  const baseHandle = baseDepth * FLOWER_PETAL_ELLIPSE_KAPPA;
  const shoulderHandle = Math.max(
    2,
    Math.min(baseToShoulder * 0.28, shoulderToCrown * 0.22)
  );
  const crownHandle = capRadius * FLOWER_PETAL_ELLIPSE_KAPPA;
  const tipHandle = Math.max(
    8,
    Math.min(
      crownHalfWidth * FLOWER_PETAL_ELLIPSE_KAPPA,
      capRadius * 0.55
    )
  );
  const baseCapHandle = baseHalfWidth * FLOWER_PETAL_ELLIPSE_KAPPA;
  const innerBaseRadius = baseRadius - baseDepth;

  const at = (radius: number, tangentOffset = 0): FlowerPetalPoint => ({
    x: center.x + radialAxis.x * radius + tangentAxis.x * tangentOffset,
    y: center.y + radialAxis.y * radius + tangentAxis.y * tangentOffset,
  });

  const baseA = at(baseRadius, baseHalfWidth);
  const shoulderA = at(shoulderRadius, shoulderHalfWidth);
  const crownA = at(crownRadius, crownHalfWidth);
  const tip = at(tipRadius);
  const crownB = at(crownRadius, -crownHalfWidth);
  const shoulderB = at(shoulderRadius, -shoulderHalfWidth);
  const baseB = at(baseRadius, -baseHalfWidth);
  const innerBase = at(innerBaseRadius);

  const segments: FlowerPetalCubicSegment[] = [
    {
      start: baseA,
      control1: at(baseRadius + baseHandle, baseHalfWidth),
      control2: at(shoulderRadius - shoulderHandle, shoulderHalfWidth),
      end: shoulderA,
    },
    {
      start: shoulderA,
      control1: at(shoulderRadius + shoulderHandle, shoulderHalfWidth),
      control2: at(crownRadius - crownHandle, crownHalfWidth),
      end: crownA,
    },
    {
      start: crownA,
      control1: at(crownRadius + crownHandle, crownHalfWidth),
      control2: at(tipRadius, tipHandle),
      end: tip,
    },
    {
      start: tip,
      control1: at(tipRadius, -tipHandle),
      control2: at(crownRadius + crownHandle, -crownHalfWidth),
      end: crownB,
    },
    {
      start: crownB,
      control1: at(crownRadius - crownHandle, -crownHalfWidth),
      control2: at(shoulderRadius + shoulderHandle, -shoulderHalfWidth),
      end: shoulderB,
    },
    {
      start: shoulderB,
      control1: at(shoulderRadius - shoulderHandle, -shoulderHalfWidth),
      control2: at(baseRadius + baseHandle, -baseHalfWidth),
      end: baseB,
    },
    {
      start: baseB,
      control1: at(baseRadius - baseHandle, -baseHalfWidth),
      control2: at(innerBaseRadius, -baseCapHandle),
      end: innerBase,
    },
    {
      start: innerBase,
      control1: at(innerBaseRadius, baseCapHandle),
      control2: at(baseRadius - baseHandle, baseHalfWidth),
      end: baseA,
    },
  ];

  return {
    segments,
    path: pathForSegments(segments),
    profile: {
      radialAxis,
      tangentAxis,
      contentNearRadius,
      contentFarRadius,
      contentHalfWidth,
      baseRadius,
      shoulderRadius,
      crownRadius,
      tipRadius,
      baseHalfWidth,
      shoulderHalfWidth,
      crownHalfWidth,
    },
  };
}
