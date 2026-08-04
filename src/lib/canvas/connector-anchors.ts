import type { Edge, Node } from "@xyflow/react";
import type { VidyaEdgeData } from "../types";
import {
  nodeShapeConnectionAnchorAtPoint,
  type ShapeConnectionAnchor,
  type ShapeConnectionPoint,
  type ShapeConnectionRect,
} from "./shape-connection-geometry";

export type ConnectorEndpoint = "source" | "target";
export type ConnectorEndpointAnchor = NonNullable<VidyaEdgeData["sourceAnchor"]>;

export const PERIMETER_HANDLE_ID = "connector-perimeter";

const SIDES = new Set(["top", "right", "bottom", "left"]);

export function connectorAnchorHandleId(
  edgeId: string,
  endpoint: ConnectorEndpoint
): string {
  return `connector-anchor:${edgeId}:${endpoint}`;
}

export function isConnectorEndpointAnchor(value: unknown): value is ConnectorEndpointAnchor {
  if (!value || typeof value !== "object") return false;
  const anchor = value as Partial<ConnectorEndpointAnchor>;
  return typeof anchor.x === "number"
    && Number.isFinite(anchor.x)
    && typeof anchor.y === "number"
    && Number.isFinite(anchor.y)
    && typeof anchor.side === "string"
    && SIDES.has(anchor.side);
}

export function connectorEndpointAnchor(
  edge: Edge,
  endpoint: ConnectorEndpoint
): ConnectorEndpointAnchor | undefined {
  const data = (edge.data ?? {}) as VidyaEdgeData;
  const anchor = endpoint === "source" ? data.sourceAnchor : data.targetAnchor;
  return isConnectorEndpointAnchor(anchor) ? anchor : undefined;
}

export function edgeHasConnectorAnchor(edge: Edge): boolean {
  return !!connectorEndpointAnchor(edge, "source")
    || !!connectorEndpointAnchor(edge, "target");
}

export function setConnectorEndpointAnchor(
  edge: Edge,
  endpoint: ConnectorEndpoint,
  anchor: ConnectorEndpointAnchor
): Edge {
  const data = { ...(edge.data ?? {}) } as VidyaEdgeData;
  if (endpoint === "source") data.sourceAnchor = anchor;
  else data.targetAnchor = anchor;
  data.preserveHandles = true;
  data.manualRoute = true;
  const handleId = connectorAnchorHandleId(edge.id, endpoint);
  return endpoint === "source"
    ? { ...edge, sourceHandle: handleId, data }
    : { ...edge, targetHandle: handleId, data };
}

export function clearConnectorEndpointAnchor(
  edge: Edge,
  endpoint: ConnectorEndpoint
): Edge {
  const data = { ...(edge.data ?? {}) } as VidyaEdgeData;
  if (endpoint === "source") delete data.sourceAnchor;
  else delete data.targetAnchor;
  return { ...edge, data };
}

/** Drop only anchors whose attached shape changed during a reconnect/reparent. */
export function clearChangedConnectorEndpointAnchors(
  previous: Pick<Edge, "source" | "target">,
  next: Edge
): Edge {
  let result = next;
  if (previous.source !== next.source) {
    result = clearConnectorEndpointAnchor(result, "source");
  }
  if (previous.target !== next.target) {
    result = clearConnectorEndpointAnchor(result, "target");
  }
  return result;
}

/** Rebuild dynamic handle ids after an edge id or direction changes. */
export function rebindConnectorAnchorHandles(edge: Edge): Edge {
  const sourceAnchor = connectorEndpointAnchor(edge, "source");
  const targetAnchor = connectorEndpointAnchor(edge, "target");
  if (!sourceAnchor && !targetAnchor) return edge;
  const data = { ...(edge.data ?? {}), preserveHandles: true, manualRoute: true };
  return {
    ...edge,
    sourceHandle: sourceAnchor
      ? connectorAnchorHandleId(edge.id, "source")
      : edge.sourceHandle,
    targetHandle: targetAnchor
      ? connectorAnchorHandleId(edge.id, "target")
      : edge.targetHandle,
    data,
  };
}

export function connectorAnchorAtCanvasPoint(
  node: Node,
  rect: ShapeConnectionRect,
  point: ShapeConnectionPoint
): ConnectorEndpointAnchor {
  const anchor: ShapeConnectionAnchor = nodeShapeConnectionAnchorAtPoint(node, rect, point);
  return {
    x: anchor.x,
    y: anchor.y,
    side: anchor.side,
  };
}
