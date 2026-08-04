"use client";

import { useEffect, useMemo, type CSSProperties } from "react";
import { Handle, Position, useConnection, useUpdateNodeInternals } from "@xyflow/react";
import {
  shapeConnectionPoint,
  type ConnectionSide,
  type ShapeConnectionPoint,
} from "@/lib/canvas/shape-connection-geometry";
import {
  connectorAnchorHandleId,
  connectorEndpointAnchor,
  PERIMETER_HANDLE_ID,
  type ConnectorEndpoint,
} from "@/lib/canvas/connector-anchors";
import { useCanvasStore } from "@/store/canvas-store";
import { useUIStore } from "@/store/ui-store";
import { connectorHandleInteractionState } from "@/lib/canvas/connector-handle-interaction";

/**
 * Renders one loose-mode handle on each side. In React Flow's loose connection
 * mode a source handle can also receive a connection, so overlapping source and
 * target handles only make pointer targeting ambiguous. Layout-aware edges keep
 * referencing these stable side ids.
 */
const SIDES: Array<{ id: ConnectionSide; pos: Position }> = [
  { id: "top", pos: Position.Top },
  { id: "right", pos: Position.Right },
  { id: "bottom", pos: Position.Bottom },
  { id: "left", pos: Position.Left },
];

function sidePosition(side: ConnectionSide): Position {
  switch (side) {
    case "top": return Position.Top;
    case "right": return Position.Right;
    case "bottom": return Position.Bottom;
    case "left": return Position.Left;
  }
}

function connectionPointStyle(
  side: ConnectionSide,
  point: ShapeConnectionPoint
): CSSProperties {
  switch (side) {
    case "top":
      return { top: `${point.y}%`, left: `${point.x}%` };
    case "right":
      return { top: `${point.y}%`, right: `${100 - point.x}%` };
    case "bottom":
      return { bottom: `${100 - point.y}%`, left: `${point.x}%` };
    case "left":
      return { top: `${point.y}%`, left: `${point.x}%` };
  }
}

export function NodeHandles({
  nodeId,
  color = "#6366f1",
  selected = false,
  compact = false,
  shapeType,
  width,
  height,
  borderRadius,
  petalCount,
  rotation,
}: {
  nodeId: string;
  color?: string;
  selected?: boolean;
  compact?: boolean;
  shapeType?: string;
  width?: number;
  height?: number;
  borderRadius?: number;
  petalCount?: number;
  rotation?: number;
}) {
  const activeTool = useUIStore((s) => s.activeTool);
  const reconnectInProgress = useUIStore((s) => s.connectorReconnectActive);
  const connectionInProgress = useConnection((connection) => connection.inProgress);
  const edges = useCanvasStore((state) => state.edges);
  const updateNodeInternals = useUpdateNodeInternals();
  const connectorActive = activeTool === "connector";
  const { perimeterActive, fixedHandlesActive } = connectorHandleInteractionState({
    connectorToolActive: connectorActive,
    connectionInProgress,
    reconnectInProgress,
    selected,
  });
  const anchoredEndpoints = useMemo(() => edges.flatMap((edge) => {
    const endpoints: Array<{
      edgeId: string;
      endpoint: ConnectorEndpoint;
      point: ShapeConnectionPoint & { side: ConnectionSide };
    }> = [];
    if (!edge.hidden && edge.source === nodeId) {
      const point = connectorEndpointAnchor(edge, "source");
      if (point) endpoints.push({ edgeId: edge.id, endpoint: "source", point });
    }
    if (!edge.hidden && edge.target === nodeId) {
      const point = connectorEndpointAnchor(edge, "target");
      if (point) endpoints.push({ edgeId: edge.id, endpoint: "target", point });
    }
    return endpoints;
  }), [edges, nodeId]);
  const anchorKey = anchoredEndpoints.map(({ edgeId, endpoint, point }) => (
    `${edgeId}:${endpoint}:${point.x}:${point.y}:${point.side}`
  )).join("|");

  useEffect(() => {
    updateNodeInternals(nodeId);
  }, [anchorKey, nodeId, updateNodeInternals]);

  return (
    <>
      {SIDES.map(({ id, pos }) => (
        <Handle
          key={id}
          data-export-ignore
          data-connector-handle={id}
          type="source"
          id={id}
          position={pos}
          isConnectableStart={fixedHandlesActive}
          isConnectableEnd={fixedHandlesActive}
          className={fixedHandlesActive
            ? compact
              ? "!h-2.5 !w-2.5 !border-2 !border-background !opacity-100 !shadow-sm"
              : "!h-3 !w-3 !border-2 !border-background !opacity-100 !shadow-sm"
            : compact
              ? "!h-2 !w-2 !border !border-background !opacity-0"
              : "!h-2.5 !w-2.5 !border !border-background !opacity-0"}
          style={{
            background: color,
            pointerEvents: fixedHandlesActive ? "all" : "none",
            ...connectionPointStyle(id, shapeConnectionPoint(shapeType, id, {
              width,
              height,
              borderRadius,
              petalCount,
              rotation,
            })),
          }}
        />
      ))}
      {anchoredEndpoints.map(({ edgeId, endpoint, point }) => (
        <Handle
          key={`${edgeId}:${endpoint}`}
          data-export-ignore
          data-connector-anchor={endpoint}
          type="source"
          id={connectorAnchorHandleId(edgeId, endpoint)}
          position={sidePosition(point.side)}
          isConnectableStart={false}
          isConnectableEnd={false}
          className="!h-1 !w-1 !border-0 !bg-transparent !opacity-0"
          style={{
            pointerEvents: "none",
            ...connectionPointStyle(point.side, point),
          }}
        />
      ))}
      <Handle
        data-export-ignore
        data-connector-handle="perimeter"
        type="source"
        id={PERIMETER_HANDLE_ID}
        position={Position.Top}
        isConnectableStart={perimeterActive}
        isConnectableEnd={perimeterActive}
        aria-label="Connect anywhere on shape"
        className="!absolute !m-0 !h-full !w-full !cursor-crosshair !border-0 !bg-transparent !opacity-0"
        style={{
          left: 0,
          top: 0,
          right: "auto",
          bottom: "auto",
          transform: "none",
          borderRadius: "inherit",
          pointerEvents: perimeterActive ? "all" : "none",
          zIndex: perimeterActive ? 20 : -1,
        }}
      />
    </>
  );
}
