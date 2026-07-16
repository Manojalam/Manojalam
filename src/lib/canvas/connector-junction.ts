import type { Edge, Node } from "@xyflow/react";
import type { Side } from "../layout/edge-routing";

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

/** Splits one visual connection into two edges joined by a movable dot node. */
export function splitConnectorAtJunction(
  edge: Edge,
  point: { x: number; y: number },
  sourcePoint: { x: number; y: number },
  targetPoint: { x: number; y: number },
  ids: SplitConnectorIds
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
