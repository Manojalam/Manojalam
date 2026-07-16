import type { Edge, Node } from "@xyflow/react";
import type { Side } from "../layout/edge-routing";

export const CONNECTOR_JUNCTION_SIZE = 20;

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
