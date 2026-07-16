import type { Edge, Node } from "@xyflow/react";
import { getNodeRect } from "../layout/geometry";
import type { RoutePoint, Side } from "../layout/edge-routing";

export const CONNECTOR_JUNCTION_SIZE = 28;

interface SplitConnectorIds {
  junctionId: string;
  firstEdgeId: string;
  secondEdgeId: string;
}

function sideToward(origin: { x: number; y: number }, target: { x: number; y: number }): Side {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "right" : "left";
  return dy >= 0 ? "bottom" : "top";
}

function samePoint(first: RoutePoint, second: RoutePoint): boolean {
  return Math.abs(first.x - second.x) < 0.5 && Math.abs(first.y - second.y) < 0.5;
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

function segmentLength(first: RoutePoint, second: RoutePoint): number {
  return Math.abs(second.x - first.x) + Math.abs(second.y - first.y);
}

function progressAlongRoute(routePoints: readonly RoutePoint[], point: RoutePoint): number | null {
  let progress = 0;
  for (let index = 0; index < routePoints.length - 1; index++) {
    const first = routePoints[index];
    const second = routePoints[index + 1];
    if (pointOnSegment(point, first, second)) return progress + segmentLength(first, point);
    progress += segmentLength(first, second);
  }
  return null;
}

function storedRoutePoints(value: unknown): RoutePoint[] {
  if (!Array.isArray(value)) return [];
  return value.filter((point): point is RoutePoint => (
    !!point
    && typeof point === "object"
    && typeof (point as { x?: unknown }).x === "number"
    && typeof (point as { y?: unknown }).y === "number"
  ));
}

function splitStoredWaypoints(
  routePoints: readonly RoutePoint[],
  splitPoint: RoutePoint,
  waypoints: readonly RoutePoint[]
): [RoutePoint[], RoutePoint[]] {
  const splitProgress = progressAlongRoute(routePoints, splitPoint);
  if (splitProgress === null) return [[], []];
  const first: RoutePoint[] = [];
  const second: RoutePoint[] = [];
  for (const waypoint of waypoints) {
    const progress = progressAlongRoute(routePoints, waypoint);
    if (progress === null || samePoint(waypoint, splitPoint)) continue;
    (progress < splitProgress ? first : second).push(waypoint);
  }
  return [first, second];
}

function simplifyRoutePoints(points: RoutePoint[]): RoutePoint[] {
  const unique = points.filter((point, index) => index === 0 || !samePoint(point, points[index - 1]));
  return unique.filter((point, index) => {
    if (index === 0 || index === unique.length - 1) return true;
    const previous = unique[index - 1];
    const next = unique[index + 1];
    const betweenX = point.x >= Math.min(previous.x, next.x)
      && point.x <= Math.max(previous.x, next.x);
    const betweenY = point.y >= Math.min(previous.y, next.y)
      && point.y <= Math.max(previous.y, next.y);
    return !(previous.x === point.x && point.x === next.x && betweenY)
      && !(previous.y === point.y && point.y === next.y && betweenX);
  });
}

function splitRouteWaypoints(
  routePoints: readonly RoutePoint[],
  splitPoint: RoutePoint
): [RoutePoint[], RoutePoint[]] {
  for (let index = 0; index < routePoints.length - 1; index++) {
    const first = routePoints[index];
    const second = routePoints[index + 1];
    if (!pointOnSegment(splitPoint, first, second)) continue;
    const before = [...routePoints.slice(0, index + 1)];
    if (!samePoint(before[before.length - 1], splitPoint)) before.push(splitPoint);
    const after = [splitPoint];
    if (!samePoint(splitPoint, second)) after.push(second);
    after.push(...routePoints.slice(index + 2));
    const firstRoute = simplifyRoutePoints(before);
    const secondRoute = simplifyRoutePoints(after);
    return [firstRoute.slice(1, -1), secondRoute.slice(1, -1)];
  }
  return [[], []];
}

/** Splits one visual connection into two edges joined by a movable dot node. */
export function splitConnectorAtJunction(
  edge: Edge,
  point: { x: number; y: number },
  sourcePoint: { x: number; y: number },
  targetPoint: { x: number; y: number },
  ids: SplitConnectorIds,
  routePoints: readonly RoutePoint[] = []
): { junction: Node; edges: [Edge, Edge] } {
  const data = (edge.data ?? {}) as Record<string, unknown>;
  const color = typeof data.color === "string"
    ? data.color
    : typeof data.layoutColor === "string" ? data.layoutColor : "#6366f1";
  const commonData = {
    ...data,
    edgeType: "branch",
    curveStyle: "step",
    manualRoute: true,
    preserveHandles: true,
    layoutMode: "freeForm",
    waypoints: undefined,
    connectorJunctionId: ids.junctionId,
  };
  const [firstWaypoints, secondWaypoints] = splitRouteWaypoints(routePoints, point);
  const [firstUserWaypoints, secondUserWaypoints] = splitStoredWaypoints(
    routePoints,
    point,
    storedRoutePoints(data.waypoints)
  );
  const junctionCenter = { x: point.x, y: point.y };
  const first: Edge = {
    ...edge,
    id: ids.firstEdgeId,
    target: ids.junctionId,
    targetHandle: sideToward(junctionCenter, sourcePoint),
    markerEnd: undefined,
    selected: false,
    data: {
      ...commonData,
      label: undefined,
      arrowEnd: false,
      waypoints: firstWaypoints.length ? firstWaypoints : undefined,
      junctionPreservedWaypoints: firstWaypoints.length > 0 || undefined,
      junctionUserWaypoints: firstUserWaypoints.length ? firstUserWaypoints : undefined,
      connectorJunctionSegment: "incoming",
    },
  };
  const second: Edge = {
    ...edge,
    id: ids.secondEdgeId,
    source: ids.junctionId,
    sourceHandle: sideToward(junctionCenter, targetPoint),
    markerStart: undefined,
    selected: false,
    data: {
      ...commonData,
      arrowStart: false,
      waypoints: secondWaypoints.length ? secondWaypoints : undefined,
      junctionPreservedWaypoints: secondWaypoints.length > 0 || undefined,
      junctionUserWaypoints: secondUserWaypoints.length ? secondUserWaypoints : undefined,
      connectorJunctionSegment: "outgoing",
    },
  };
  const junction: Node = {
    id: ids.junctionId,
    type: "junction",
    position: {
      x: Math.round(point.x - CONNECTOR_JUNCTION_SIZE / 2),
      y: Math.round(point.y - CONNECTOR_JUNCTION_SIZE / 2),
    },
    style: { width: CONNECTOR_JUNCTION_SIZE, height: CONNECTOR_JUNCTION_SIZE },
    data: {
      connectorJunction: true,
      color,
      layoutMode: "freeForm",
      tags: [],
    },
    selected: true,
    selectable: true,
    draggable: true,
  };
  return { junction, edges: [first, second] };
}

/** Releases only the temporary anchors used to make junction insertion visually neutral. */
export function releaseConnectorJunctionRouteAnchors(
  edges: Edge[],
  junctionIds: ReadonlySet<string>
): Edge[] {
  if (!junctionIds.size) return edges;
  return edges.map((edge) => {
    const data = { ...(edge.data ?? {}) } as Record<string, unknown>;
    const junctionId = typeof data.connectorJunctionId === "string" ? data.connectorJunctionId : null;
    if (!junctionId || !junctionIds.has(junctionId) || data.junctionPreservedWaypoints !== true) {
      return edge;
    }
    const userWaypoints = storedRoutePoints(data.junctionUserWaypoints);
    if (userWaypoints.length) data.waypoints = userWaypoints;
    else delete data.waypoints;
    delete data.junctionPreservedWaypoints;
    delete data.junctionUserWaypoints;
    return { ...edge, data };
  });
}

/** Keeps each junction port facing the node at the other end while it moves. */
export function refreshConnectorJunctionHandles(
  nodes: Node[],
  edges: Edge[],
  junctionIds: ReadonlySet<string>
): Edge[] {
  if (!junctionIds.size) return edges;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return edges.map((edge) => {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source || !target) return edge;
    const sourceRect = getNodeRect(source);
    const targetRect = getNodeRect(target);
    const sourceCenter = { x: sourceRect.centerX, y: sourceRect.centerY };
    const targetCenter = { x: targetRect.centerX, y: targetRect.centerY };
    const sourceHandle = junctionIds.has(source.id) && source.type === "junction"
      ? sideToward(sourceCenter, targetCenter)
      : edge.sourceHandle;
    const targetHandle = junctionIds.has(target.id) && target.type === "junction"
      ? sideToward(targetCenter, sourceCenter)
      : edge.targetHandle;
    if (sourceHandle === edge.sourceHandle && targetHandle === edge.targetHandle) return edge;
    return { ...edge, sourceHandle, targetHandle };
  });
}

export interface ClearConnectorJunctionResult {
  nodes: Node[];
  edges: Edge[];
  mergedEdgeId?: string;
  removedEdgeCount: number;
  merged: boolean;
}

function edgeSegment(edge: Edge): unknown {
  return (edge.data as Record<string, unknown> | undefined)?.connectorJunctionSegment;
}

function edgeWaypoints(edge: Edge): Array<{ x: number; y: number }> {
  const value = (edge.data as Record<string, unknown> | undefined)?.waypoints;
  if (!Array.isArray(value)) return [];
  return value.filter((point): point is { x: number; y: number } => (
    !!point
    && typeof point === "object"
    && typeof (point as { x?: unknown }).x === "number"
    && typeof (point as { y?: unknown }).y === "number"
  ));
}

/** Removes a junction while preserving its original through-connection when identifiable. */
export function clearConnectorJunctionGraph(
  nodes: Node[],
  edges: Edge[],
  junctionId: string
): ClearConnectorJunctionResult {
  const attached = edges.filter((edge) => edge.source === junctionId || edge.target === junctionId);
  const incomingEdges = attached.filter((edge) => edge.target === junctionId && edge.source !== junctionId);
  const outgoingEdges = attached.filter((edge) => edge.source === junctionId && edge.target !== junctionId);
  const incoming = incomingEdges.find((edge) => edgeSegment(edge) === "incoming")
    ?? (incomingEdges.length === 1 ? incomingEdges[0] : undefined);
  const outgoing = outgoingEdges.find((edge) => edgeSegment(edge) === "outgoing")
    ?? (outgoingEdges.length === 1 ? outgoingEdges[0] : undefined);
  const remainingNodes = nodes.filter((node) => node.id !== junctionId);
  const attachedIds = new Set(attached.map((edge) => edge.id));
  const remainingEdges = edges.filter((edge) => !attachedIds.has(edge.id));

  if (!incoming || !outgoing || incoming.id === outgoing.id) {
    return {
      nodes: remainingNodes,
      edges: remainingEdges,
      removedEdgeCount: attached.length,
      merged: false,
    };
  }

  const incomingData = { ...(incoming.data ?? {}) } as Record<string, unknown>;
  const outgoingData = { ...(outgoing.data ?? {}) } as Record<string, unknown>;
  const waypoints = [...edgeWaypoints(incoming), ...edgeWaypoints(outgoing)];
  const data: Record<string, unknown> = {
    ...incomingData,
    ...outgoingData,
    edgeType: outgoingData.edgeType ?? incomingData.edgeType ?? "branch",
    curveStyle: "step",
    manualRoute: true,
    preserveHandles: true,
    layoutMode: "freeForm",
    arrowStart: incomingData.arrowStart,
    arrowEnd: outgoingData.arrowEnd,
  };
  delete data.connectorJunctionId;
  delete data.connectorJunctionSegment;
  delete data.junctionPreservedWaypoints;
  delete data.junctionUserWaypoints;
  if (waypoints.length) data.waypoints = waypoints;
  else delete data.waypoints;

  const merged: Edge = {
    ...outgoing,
    source: incoming.source,
    target: outgoing.target,
    sourceHandle: incoming.sourceHandle,
    targetHandle: outgoing.targetHandle,
    markerStart: incoming.markerStart,
    markerEnd: outgoing.markerEnd,
    selected: true,
    reconnectable: true,
    data,
  };

  return {
    nodes: remainingNodes,
    edges: [...remainingEdges, merged],
    mergedEdgeId: merged.id,
    removedEdgeCount: attached.length,
    merged: true,
  };
}
