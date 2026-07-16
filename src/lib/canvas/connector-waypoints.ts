import type { RoutePoint, Side } from "../layout/edge-routing";

export interface DraggableRouteSegment {
  index: number;
  start: RoutePoint;
  end: RoutePoint;
  orientation: "horizontal" | "vertical";
  length: number;
}

/**
 * Compensate for a route midpoint that shifts while one complete segment is
 * translated. The rendered label then moves by exactly the segment's delta,
 * preserving any offset the user previously chose.
 */
export function labelOffsetAfterSegmentTranslation(
  startAnchor: RoutePoint,
  startOffset: RoutePoint,
  nextAnchor: RoutePoint,
  orientation: "horizontal" | "vertical",
  delta: number
): RoutePoint {
  const translation = orientation === "horizontal"
    ? { x: 0, y: delta }
    : { x: delta, y: 0 };
  return {
    x: startAnchor.x + startOffset.x + translation.x - nextAnchor.x,
    y: startAnchor.y + startOffset.y + translation.y - nextAnchor.y,
  };
}

interface RouteSegmentCandidate {
  point: RoutePoint;
  progress: number;
  length: number;
}

function segmentLength(first: RoutePoint, second: RoutePoint): number {
  return Math.abs(second.x - first.x) + Math.abs(second.y - first.y);
}

function routeStub(point: RoutePoint, side: Side, distance: number): RoutePoint {
  switch (side) {
    case "top": return { x: point.x, y: point.y - distance };
    case "right": return { x: point.x + distance, y: point.y };
    case "bottom": return { x: point.x, y: point.y + distance };
    case "left": return { x: point.x - distance, y: point.y };
  }
}

function samePoint(first: RoutePoint, second: RoutePoint): boolean {
  return Math.abs(first.x - second.x) < 0.5 && Math.abs(first.y - second.y) < 0.5;
}

const DEFAULT_SEGMENT_ALIGNMENT_SNAP_DISTANCE = 8;

export function snapDraggedSegmentCoordinate(
  routePoints: readonly RoutePoint[],
  segmentIndex: number,
  coordinate: number,
  snapDistance = DEFAULT_SEGMENT_ALIGNMENT_SNAP_DISTANCE
): number {
  const segment = draggableRouteSegments(routePoints).find(({ index }) => index === segmentIndex);
  if (!segment || !Number.isFinite(coordinate)) return coordinate;
  let snapped = coordinate;
  let closestDistance = Math.max(0, snapDistance);
  for (const point of routePoints) {
    const candidate = segment.orientation === "horizontal" ? point.y : point.x;
    const distance = Math.abs(candidate - coordinate);
    if (distance > closestDistance) continue;
    snapped = candidate;
    closestDistance = distance;
  }
  return snapped;
}

/** Returns every non-zero orthogonal segment that can be dragged directly. */
export function draggableRouteSegments(routePoints: readonly RoutePoint[]): DraggableRouteSegment[] {
  const segments: DraggableRouteSegment[] = [];
  for (let index = 0; index < routePoints.length - 1; index++) {
    const start = routePoints[index];
    const end = routePoints[index + 1];
    const horizontal = Math.abs(start.y - end.y) < 0.5;
    const vertical = Math.abs(start.x - end.x) < 0.5;
    const length = segmentLength(start, end);
    if (!length || (!horizontal && !vertical)) continue;
    segments.push({
      index,
      start: { ...start },
      end: { ...end },
      orientation: horizontal ? "horizontal" : "vertical",
      length,
    });
  }
  return segments;
}

/**
 * Translates a complete orthogonal segment and returns manual route anchors.
 * Endpoint stubs are implicit in the manual router, so they are used to form
 * clean doglegs but are not persisted as user waypoints.
 */
export function dragRouteSegmentToWaypoints(
  routePoints: readonly RoutePoint[],
  segmentIndex: number,
  coordinate: number,
  sourceSide: Side,
  targetSide: Side,
  endpointOptions: { sourceStubDistance?: number; targetStubDistance?: number } = {},
  snapDistance = DEFAULT_SEGMENT_ALIGNMENT_SNAP_DISTANCE
): RoutePoint[] {
  const segment = draggableRouteSegments(routePoints).find(({ index }) => index === segmentIndex);
  const lastIndex = routePoints.length - 1;
  if (!segment || lastIndex < 1 || !Number.isFinite(coordinate)) return [];

  const sourceStub = routeStub(
    routePoints[0],
    sourceSide,
    endpointOptions.sourceStubDistance ?? 20
  );
  const targetStub = routeStub(
    routePoints[lastIndex],
    targetSide,
    endpointOptions.targetStubDistance ?? 20
  );
  const startsAtSource = segmentIndex === 0;
  const endsAtTarget = segmentIndex + 1 === lastIndex;
  const snappedCoordinate = snapDraggedSegmentCoordinate(
    routePoints,
    segmentIndex,
    coordinate,
    snapDistance
  );
  const firstBase = startsAtSource ? sourceStub : segment.start;
  const secondBase = endsAtTarget ? targetStub : segment.end;
  const translatedStart = segment.orientation === "horizontal"
    ? { x: firstBase.x, y: snappedCoordinate }
    : { x: snappedCoordinate, y: firstBase.y };
  const translatedEnd = segment.orientation === "horizontal"
    ? { x: secondBase.x, y: snappedCoordinate }
    : { x: snappedCoordinate, y: secondBase.y };
  const prefix = startsAtSource
    ? [routePoints[0], sourceStub]
    : routePoints.slice(0, segmentIndex);
  const suffix = endsAtTarget
    ? [targetStub, routePoints[lastIndex]]
    : routePoints.slice(segmentIndex + 2);
  const desiredRoute = [
    ...prefix,
    translatedStart,
    translatedEnd,
    ...suffix,
  ];

  return routeBendPoints(desiredRoute).filter((point) => (
    !samePoint(point, sourceStub) && !samePoint(point, targetStub)
  ));
}

function pointOnSegment(point: RoutePoint, first: RoutePoint, second: RoutePoint): boolean {
  const epsilon = 0.5;
  if (Math.abs(first.x - second.x) <= epsilon) {
    return Math.abs(point.x - first.x) <= epsilon
      && point.y >= Math.min(first.y, second.y) - epsilon
      && point.y <= Math.max(first.y, second.y) + epsilon;
  }
  if (Math.abs(first.y - second.y) <= epsilon) {
    return Math.abs(point.y - first.y) <= epsilon
      && point.x >= Math.min(first.x, second.x) - epsilon
      && point.x <= Math.max(first.x, second.x) + epsilon;
  }
  return false;
}

function progressAlongRoute(routePoints: readonly RoutePoint[], point: RoutePoint): number | null {
  let progress = 0;
  for (let index = 0; index < routePoints.length - 1; index++) {
    const first = routePoints[index];
    const second = routePoints[index + 1];
    if (pointOnSegment(point, first, second)) {
      return progress + segmentLength(first, point);
    }
    progress += segmentLength(first, second);
  }
  return null;
}

/** Returns only real internal corners, excluding endpoints and collinear points. */
export function routeBendPoints(routePoints: readonly RoutePoint[]): RoutePoint[] {
  const unique = routePoints.filter((point, index) => (
    index === 0 || !samePoint(point, routePoints[index - 1])
  ));
  return unique.slice(1, -1).filter((point, index) => {
    const previous = unique[index];
    const next = unique[index + 2];
    return !(
      (Math.abs(previous.x - point.x) < 0.5 && Math.abs(point.x - next.x) < 0.5)
      || (Math.abs(previous.y - point.y) < 0.5 && Math.abs(point.y - next.y) < 0.5)
    );
  }).map((point) => ({ ...point }));
}

/** Projects an arbitrary canvas click onto the closest location on a routed connector. */
export function closestPointOnRoute(
  routePoints: readonly RoutePoint[],
  point: RoutePoint
): RoutePoint {
  let closest = { ...point };
  let closestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < routePoints.length - 1; index++) {
    const first = routePoints[index];
    const second = routePoints[index + 1];
    const dx = second.x - first.x;
    const dy = second.y - first.y;
    const squaredLength = dx * dx + dy * dy;
    if (!squaredLength) continue;
    const ratio = Math.max(0, Math.min(1, (
      (point.x - first.x) * dx + (point.y - first.y) * dy
    ) / squaredLength));
    const projected = {
      x: first.x + dx * ratio,
      y: first.y + dy * ratio,
    };
    const distance = (point.x - projected.x) ** 2 + (point.y - projected.y) ** 2;
    if (distance >= closestDistance) continue;
    closest = projected;
    closestDistance = distance;
  }
  return closest;
}

/**
 * Adds a bend anchor on the longest visible route segment and inserts it in
 * traversal order. Because the point starts on the existing path, adding it is
 * visually neutral until the user drags it.
 */
export function insertWaypointOnRoute(
  routePoints: readonly RoutePoint[],
  waypoints: readonly RoutePoint[]
): RoutePoint[] {
  let progress = 0;
  const candidates: RouteSegmentCandidate[] = [];
  for (let index = 0; index < routePoints.length - 1; index++) {
    const first = routePoints[index];
    const second = routePoints[index + 1];
    const length = segmentLength(first, second);
    if (length > 0) {
      candidates.push({
        point: {
          x: Math.round((first.x + second.x) / 2),
          y: Math.round((first.y + second.y) / 2),
        },
        progress: progress + length / 2,
        length,
      });
    }
    progress += length;
  }

  const existingProgress = waypoints.map((waypoint) => progressAlongRoute(routePoints, waypoint));
  const unused = candidates.filter((candidate) => waypoints.every((waypoint) => (
    Math.abs(candidate.point.x - waypoint.x) + Math.abs(candidate.point.y - waypoint.y) >= 16
  )));
  const candidate = (unused.length ? unused : candidates)
    .sort((first, second) => second.length - first.length || first.progress - second.progress)[0];
  if (!candidate) return [...waypoints];

  const insertionIndex = existingProgress.filter((value) => (
    value !== null && value < candidate.progress
  )).length;
  return [
    ...waypoints.slice(0, insertionIndex),
    candidate.point,
    ...waypoints.slice(insertionIndex),
  ];
}
