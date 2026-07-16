import type { RoutePoint } from "../layout/edge-routing";

interface RouteSegmentCandidate {
  point: RoutePoint;
  progress: number;
  length: number;
}

function segmentLength(first: RoutePoint, second: RoutePoint): number {
  return Math.abs(second.x - first.x) + Math.abs(second.y - first.y);
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
  return routePoints.slice(1, -1).filter((point, index) => {
    const previous = routePoints[index];
    const next = routePoints[index + 2];
    return !(
      (previous.x === point.x && point.x === next.x)
      || (previous.y === point.y && point.y === next.y)
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
