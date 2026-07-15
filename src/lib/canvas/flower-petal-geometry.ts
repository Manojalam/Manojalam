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
  /** The five collinear circles whose convex envelope forms the petal. */
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

type LocalDisc = {
  x: number;
  radius: number;
};

type LocalPrimitive = {
  kind: "arc" | "tangent";
  start: FlowerPetalPoint;
  end: FlowerPetalPoint;
  startTangent: FlowerPetalPoint;
  endTangent: FlowerPetalPoint;
  startHandle: number;
  endHandle: number;
};

type DiscTangent = {
  angle: number;
  upperLeft: FlowerPetalPoint;
  upperRight: FlowerPetalPoint;
  lowerLeft: FlowerPetalPoint;
  lowerRight: FlowerPetalPoint;
};

const TAU = Math.PI * 2;
const MAX_ARC_RADIANS = Math.PI / 8;
const GEOMETRY_EPSILON = 1e-7;

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

function pointOnDisc(disc: LocalDisc, angle: number): FlowerPetalPoint {
  return {
    x: disc.x + Math.cos(angle) * disc.radius,
    y: Math.sin(angle) * disc.radius,
  };
}

function clockwiseTangent(angle: number): FlowerPetalPoint {
  return { x: Math.sin(angle), y: -Math.cos(angle) };
}

function tangentPrimitive(
  start: FlowerPetalPoint,
  end: FlowerPetalPoint,
  tangent: FlowerPetalPoint
): LocalPrimitive {
  return {
    kind: "tangent",
    start,
    end,
    startTangent: tangent,
    endTangent: tangent,
    startHandle: 0,
    endHandle: 0,
  };
}

/** Add clockwise circular arcs, split finely enough for a stable cubic hull. */
function appendClockwiseArc(
  primitives: LocalPrimitive[],
  disc: LocalDisc,
  startAngle: number,
  endAngle: number,
  forcedStart?: FlowerPetalPoint,
  forcedEnd?: FlowerPetalPoint,
  breakAngles: readonly number[] = []
): void {
  const breaks: number[] = [];
  for (const candidate of breakAngles) {
    for (let turn = -2; turn <= 2; turn += 1) {
      const angle = candidate + turn * TAU;
      if (angle < startAngle - GEOMETRY_EPSILON && angle > endAngle + GEOMETRY_EPSILON) {
        breaks.push(angle);
      }
    }
  }
  breaks.sort((first, second) => second - first);
  const boundaries = [startAngle, ...breaks, endAngle];

  boundaries.slice(0, -1).forEach((boundary, boundaryIndex) => {
    const nextBoundary = boundaries[boundaryIndex + 1];
    const count = Math.max(1, Math.ceil((boundary - nextBoundary) / MAX_ARC_RADIANS));
    const step = (nextBoundary - boundary) / count;
    const handle = 4 * disc.radius * Math.tan(Math.abs(step) / 4) / 3;

    for (let index = 0; index < count; index += 1) {
      const firstAngle = boundary + step * index;
      const secondAngle = boundary + step * (index + 1);
      const isFirst = boundaryIndex === 0 && index === 0;
      const isLast = boundaryIndex === boundaries.length - 2 && index === count - 1;
      primitives.push({
        kind: "arc",
        start: isFirst && forcedStart ? forcedStart : pointOnDisc(disc, firstAngle),
        end: isLast && forcedEnd ? forcedEnd : pointOnDisc(disc, secondAngle),
        startTangent: clockwiseTangent(firstAngle),
        endTangent: clockwiseTangent(secondAngle),
        startHandle: handle,
        endHandle: handle,
      });
    }
  });
}

/** Keep only circles that contribute to the upper convex envelope. */
function exposedDiscs(discs: readonly LocalDisc[]): LocalDisc[] {
  const envelope: LocalDisc[] = [];
  for (const disc of discs) {
    let contained = false;
    while (envelope.length) {
      const previous = envelope[envelope.length - 1];
      const distance = disc.x - previous.x;
      if (disc.radius >= previous.radius + distance - GEOMETRY_EPSILON) {
        envelope.pop();
        continue;
      }
      if (previous.radius >= disc.radius + distance - GEOMETRY_EPSILON) {
        contained = true;
      }
      break;
    }
    if (contained) continue;

    while (envelope.length >= 2) {
      const first = envelope[envelope.length - 2];
      const second = envelope[envelope.length - 1];
      const firstSlope = (second.radius - first.radius) / (second.x - first.x);
      const secondSlope = (disc.radius - second.radius) / (disc.x - second.x);
      if (firstSlope > secondSlope + GEOMETRY_EPSILON) break;
      envelope.pop();
    }
    envelope.push(disc);
  }
  return envelope;
}

function fitJoinHandleToSector(
  point: FlowerPetalPoint,
  tangent: FlowerPetalPoint,
  requestedHandle: number,
  sine: number,
  cosine: number,
  edgeClearance: number
): number {
  let maximum = Number.POSITIVE_INFINITY;
  for (const normal of [{ x: sine, y: -cosine }, { x: sine, y: cosine }]) {
    const slack = normal.x * point.x + normal.y * point.y - edgeClearance;
    const change = Math.abs(normal.x * tangent.x + normal.y * tangent.y);
    if (change > 1e-12) maximum = Math.min(maximum, Math.max(0, slack) / change);
  }
  if (maximum >= requestedHandle) return requestedHandle;
  return Math.max(0, maximum * (1 - 1e-9));
}

function localEnvelopeSegments(
  discs: readonly LocalDisc[],
  sectorHalfAngleRadians: number,
  edgeClearance: number
): FlowerPetalCubicSegment[] {
  const envelope = exposedDiscs(discs);
  if (envelope.length < 2) return [];

  const tangents: DiscTangent[] = envelope.slice(0, -1).map((left, index) => {
    const right = envelope[index + 1];
    const cosine = clamp((left.radius - right.radius) / (right.x - left.x), -1, 1);
    const angle = Math.acos(cosine);
    return {
      angle,
      upperLeft: pointOnDisc(left, angle),
      upperRight: pointOnDisc(right, angle),
      lowerLeft: pointOnDisc(left, -angle),
      lowerRight: pointOnDisc(right, -angle),
    };
  });
  const primitives: LocalPrimitive[] = [];

  tangents.forEach((tangent, index) => {
    primitives.push(tangentPrimitive(
      tangent.upperLeft,
      tangent.upperRight,
      clockwiseTangent(tangent.angle)
    ));
    if (index < tangents.length - 1) {
      appendClockwiseArc(
        primitives,
        envelope[index + 1],
        tangent.angle,
        tangents[index + 1].angle,
        tangent.upperRight,
        tangents[index + 1].upperLeft
      );
    } else {
      appendClockwiseArc(
        primitives,
        envelope[envelope.length - 1],
        tangent.angle,
        -tangent.angle,
        tangent.upperRight,
        tangent.lowerRight,
        [0]
      );
    }
  });

  for (let index = tangents.length - 1; index >= 0; index -= 1) {
    const tangent = tangents[index];
    primitives.push(tangentPrimitive(
      tangent.lowerRight,
      tangent.lowerLeft,
      clockwiseTangent(-tangent.angle)
    ));
    if (index > 0) {
      appendClockwiseArc(
        primitives,
        envelope[index],
        -tangent.angle,
        -tangents[index - 1].angle,
        tangent.lowerLeft,
        tangents[index - 1].lowerRight
      );
    } else {
      appendClockwiseArc(
        primitives,
        envelope[0],
        -tangent.angle,
        tangent.angle - TAU,
        tangent.lowerLeft,
        tangent.upperLeft,
        [-Math.PI]
      );
    }
  }

  const sine = Math.sin(sectorHalfAngleRadians);
  const cosine = Math.cos(sectorHalfAngleRadians);
  const joins = primitives.map((primitive, index) => {
    const previous = primitives[(index + primitives.length - 1) % primitives.length];
    const adjacentArcs = [previous, primitive].filter((item) => item.kind === "arc");
    const tangent = primitive.kind === "arc" ? primitive.startTangent : previous.endTangent;
    const requestedHandle = adjacentArcs.length
      ? Math.min(...adjacentArcs.map((item) => item === primitive ? item.startHandle : item.endHandle))
      : 0;
    return {
      point: primitive.start,
      tangent,
      handle: fitJoinHandleToSector(
        primitive.start,
        tangent,
        requestedHandle,
        sine,
        cosine,
        edgeClearance
      ),
    };
  });

  return primitives.map((_, index) => {
    const start = joins[index];
    const end = joins[(index + 1) % joins.length];
    return {
      start: start.point,
      control1: {
        x: start.point.x + start.tangent.x * start.handle,
        y: start.point.y + start.tangent.y * start.handle,
      },
      control2: {
        x: end.point.x - end.tangent.x * end.handle,
        y: end.point.y - end.tangent.y * end.handle,
      },
      end: end.point,
    };
  });
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
 * Build a rounded lotus petal as the convex envelope of five collinear discs.
 * The central disc owns the label region; the four smaller discs taper the
 * silhouette toward its root and tip without introducing polygonal corners.
 */
export function buildFlowerPetalGeometry(input: FlowerPetalGeometryInput): FlowerPetalGeometry {
  const center = {
    x: finiteOr(input.center.x, 0),
    y: finiteOr(input.center.y, 0),
  };
  const rootRadius = Math.max(0, finiteOr(input.rootRadius, 0));
  const length = positiveOr(input.length, 240);
  const requestedHalfWidth = positiveOr(input.halfWidth, 100);
  const labelCenterOffset = clamp(
    finiteOr(input.labelCenterOffset ?? length * 0.58, length * 0.58),
    length * 0.35,
    length * 0.75
  );
  const sectorHalfAngleDegrees = clamp(
    finiteOr(input.sectorHalfAngleDegrees ?? 89.5, 89.5),
    1,
    89.5
  );
  const sectorHalfAngleRadians = sectorHalfAngleDegrees * Math.PI / 180;
  const sectorSine = Math.sin(sectorHalfAngleRadians);
  const requestedClearance = Math.max(0, finiteOr(input.edgeClearance ?? 0, 0));
  const edgeClearance = Math.min(
    requestedClearance,
    Math.max(0, rootRadius * sectorSine - GEOMETRY_EPSILON)
  );
  const labelRadiusFromCenter = rootRadius + labelCenterOffset;
  const radialRoom = Math.max(
    GEOMETRY_EPSILON,
    Math.min(labelCenterOffset, length - labelCenterOffset) - GEOMETRY_EPSILON
  );
  const sectorRoom = Math.max(
    GEOMETRY_EPSILON,
    labelRadiusFromCenter * sectorSine - edgeClearance
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

  const preferredEndRadius = Math.max(
    GEOMETRY_EPSILON,
    Math.min(halfWidth * 0.16, length * 0.045)
  );
  const rootRadiusLimit = sectorSine < 1 - GEOMETRY_EPSILON
    ? (rootRadius * sectorSine - edgeClearance) / (1 - sectorSine)
    : preferredEndRadius;
  const tipRadius = rootRadius + length;
  const tipDiscRadiusLimit = (tipRadius * sectorSine - edgeClearance) / (1 + sectorSine);
  const rootDiscRadius = Math.max(
    GEOMETRY_EPSILON,
    Math.min(preferredEndRadius, Math.max(GEOMETRY_EPSILON, rootRadiusLimit))
  );
  const tipDiscRadius = Math.max(
    GEOMETRY_EPSILON,
    Math.min(preferredEndRadius, Math.max(GEOMETRY_EPSILON, tipDiscRadiusLimit))
  );

  const rootDisc: LocalDisc = { x: rootRadius + rootDiscRadius, radius: rootDiscRadius };
  const mainDisc: LocalDisc = { x: labelRadiusFromCenter, radius: halfWidth };
  const tipDisc: LocalDisc = { x: tipRadius - tipDiscRadius, radius: tipDiscRadius };
  const radiusCapacity = (x: number): number => Math.max(
    GEOMETRY_EPSILON,
    x * sectorSine - edgeClearance
  );

  const firstShoulderX = rootDisc.x + (mainDisc.x - rootDisc.x) * 0.52;
  const firstChordRadius = rootDisc.radius + (mainDisc.radius - rootDisc.radius) * 0.52;
  const firstShoulderMinimum = Math.max(
    firstChordRadius + GEOMETRY_EPSILON,
    mainDisc.radius - (mainDisc.x - firstShoulderX) * 0.98
  );
  const firstShoulderMaximum = Math.min(
    mainDisc.radius - GEOMETRY_EPSILON,
    rootDisc.radius + (firstShoulderX - rootDisc.x) * 0.98,
    radiusCapacity(firstShoulderX)
  );
  const firstDesiredRadius = firstChordRadius + (mainDisc.radius - rootDisc.radius) * 0.12;
  const firstShoulderRadius = firstShoulderMaximum > firstShoulderMinimum
    ? clamp(firstDesiredRadius, firstShoulderMinimum, firstShoulderMaximum)
    : firstChordRadius;

  const secondShoulderX = mainDisc.x + (tipDisc.x - mainDisc.x) * 0.48;
  const secondChordRadius = mainDisc.radius + (tipDisc.radius - mainDisc.radius) * 0.48;
  const secondShoulderMinimum = Math.max(
    secondChordRadius + GEOMETRY_EPSILON,
    mainDisc.radius - (secondShoulderX - mainDisc.x) * 0.98
  );
  const secondShoulderMaximum = Math.min(
    mainDisc.radius - GEOMETRY_EPSILON,
    tipDisc.radius + (tipDisc.x - secondShoulderX) * 0.98,
    radiusCapacity(secondShoulderX)
  );
  const secondDesiredRadius = secondChordRadius + (mainDisc.radius - tipDisc.radius) * 0.12;
  const secondShoulderRadius = secondShoulderMaximum > secondShoulderMinimum
    ? clamp(secondDesiredRadius, secondShoulderMinimum, secondShoulderMaximum)
    : secondChordRadius;

  const localDiscs: LocalDisc[] = [
    rootDisc,
    { x: firstShoulderX, radius: firstShoulderRadius },
    mainDisc,
    { x: secondShoulderX, radius: secondShoulderRadius },
    tipDisc,
  ];
  const localSegments = localEnvelopeSegments(
    localDiscs,
    sectorHalfAngleRadians,
    edgeClearance
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
  const discs = localDiscs.map((disc) => ({
    center: toWorld({ x: disc.x, y: 0 }),
    radius: disc.radius,
  }));
  const root = toWorld({ x: rootRadius, y: 0 });
  const tip = toWorld({ x: tipRadius, y: 0 });
  const labelCenter = toWorld({ x: labelRadiusFromCenter, y: 0 });

  return {
    segments,
    path: pathForSegments(segments),
    profile: {
      radialAxis,
      tangentAxis,
      root,
      tip,
      labelCenter,
      rootRadius,
      tipRadius,
      length,
      halfWidth,
      labelCenterOffset,
      labelRegionRadius,
      sectorHalfAngleDegrees,
      edgeClearance,
      discs,
    },
  };
}
