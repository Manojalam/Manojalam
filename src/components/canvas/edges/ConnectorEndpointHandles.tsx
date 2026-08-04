"use client";

import { useState } from "react";
import { useReactFlow } from "@xyflow/react";
import {
  connectorAnchorAtCanvasPoint,
  setConnectorEndpointAnchor,
  type ConnectorEndpoint,
} from "@/lib/canvas/connector-anchors";
import { CONNECTOR_CONTROL_Z_INDEX } from "@/lib/canvas/connector-control-layer";
import { getNodeRect } from "@/lib/layout";
import { useCanvasStore } from "@/store/canvas-store";

interface ConnectorEndpointHandlesProps {
  edgeId: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourcePoint: { x: number; y: number };
  targetPoint: { x: number; y: number };
}

function updateShapeBoundEndpoint(
  edgeId: string,
  endpoint: ConnectorEndpoint,
  nodeId: string,
  point: { x: number; y: number }
): void {
  useCanvasStore.setState((state) => {
    const node = state.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) return state;
    const anchor = connectorAnchorAtCanvasPoint(node, getNodeRect(node), point);
    return {
      edges: state.edges.map((edge) => edge.id === edgeId
        ? setConnectorEndpointAnchor(edge, endpoint, anchor)
        : edge),
      saveStatus: "unsaved",
    };
  });
}

/** Drag either endpoint along the perimeter of the shape it already belongs to. */
export function ConnectorEndpointHandles({
  edgeId,
  sourceNodeId,
  targetNodeId,
  sourcePoint,
  targetPoint,
}: ConnectorEndpointHandlesProps) {
  const [dragging, setDragging] = useState<ConnectorEndpoint | null>(null);
  const pushHistory = useCanvasStore((state) => state.pushHistory);
  const { screenToFlowPosition } = useReactFlow();
  const endpoints = [
    { endpoint: "source" as const, nodeId: sourceNodeId, point: sourcePoint },
    { endpoint: "target" as const, nodeId: targetNodeId, point: targetPoint },
  ];

  return endpoints.map(({ endpoint, nodeId, point }) => (
    <button
      key={`${edgeId}-${endpoint}-anchor`}
      data-export-ignore
      type="button"
      aria-label={`Move connector ${endpoint} along its shape`}
      title="Drag along the connected shape"
      style={{
        position: "absolute",
        transform: `translate(-50%, -50%) translate(${point.x}px,${point.y}px)`,
        pointerEvents: "all",
        zIndex: CONNECTOR_CONTROL_Z_INDEX,
      }}
      className="nodrag nopan nowheel touch-none h-5 w-5 cursor-grab rounded-full border-2 border-primary bg-background shadow-md outline-none hover:scale-125 focus-visible:ring-2 focus-visible:ring-primary active:cursor-grabbing"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        pushHistory();
        setDragging(endpoint);
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (dragging !== endpoint) return;
        event.preventDefault();
        event.stopPropagation();
        updateShapeBoundEndpoint(
          edgeId,
          endpoint,
          nodeId,
          screenToFlowPosition({ x: event.clientX, y: event.clientY })
        );
      }}
      onPointerUp={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setDragging(null);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
      onPointerCancel={() => {
        setDragging(null);
      }}
      onClick={(event) => event.stopPropagation()}
    />
  ));
}
