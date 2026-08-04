import type { Edge } from "@xyflow/react";

export interface ConnectorHandleInteractionInput {
  connectorToolActive: boolean;
  connectionInProgress: boolean;
  reconnectInProgress: boolean;
  selected: boolean;
}

/**
 * A moving connector gets one large drop target per node. The four fixed side
 * handles remain available only for deliberately starting a connection from a
 * selected node, so they cannot compete with perimeter snapping.
 */
export function connectorHandleInteractionState({
  connectorToolActive,
  connectionInProgress,
  reconnectInProgress,
  selected,
}: ConnectorHandleInteractionInput): {
  perimeterActive: boolean;
  fixedHandlesActive: boolean;
} {
  const perimeterActive = connectorToolActive || connectionInProgress || reconnectInProgress;
  return {
    perimeterActive,
    fixedHandlesActive: selected && !perimeterActive,
  };
}

/**
 * Existing edges may persist React Flow's topology-reconnect flag. The canvas
 * uses its own shape-bound endpoint controls, so suppress those updater anchors
 * at the display boundary without rewriting saved board data.
 */
export function suppressAutomaticEdgeReconnect<EdgeType extends Edge>(
  edges: EdgeType[]
): EdgeType[] {
  let changed = false;
  const nextEdges = edges.map((edge) => {
    if (!edge.reconnectable) return edge;
    changed = true;
    return { ...edge, reconnectable: false };
  });
  return changed ? nextEdges : edges;
}
