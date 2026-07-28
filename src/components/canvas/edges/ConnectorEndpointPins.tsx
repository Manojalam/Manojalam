"use client";

import { useRef } from "react";
import { useReactFlow, type Node } from "@xyflow/react";
import type { VidyaEdgeData } from "@/lib/types";
import { getNodeRect } from "@/lib/layout";
import { closestNodeShapeConnectionAnchor } from "@/lib/canvas/shape-connection-geometry";
import { CONNECTOR_CONTROL_Z_INDEX } from "@/lib/canvas/connector-control-layer";
import { useCanvasStore } from "@/store/canvas-store";

type Endpoint = "source" | "target";

interface ConnectorEndpointPinsProps {
  edgeId: string;
  sourceNode?: Node;
  targetNode?: Node;
  sourcePoint: { x: number; y: number };
  targetPoint: { x: number; y: number };
}

function isStructuredLayout(mode: VidyaEdgeData["layoutMode"]): boolean {
  return mode === "list"
    || mode === "horizontal"
    || mode === "vertical"
    || mode === "topDown"
    || mode === "linear";
}

function updateEndpointAnchor(
  edgeId: string,
  endpoint: Endpoint,
  node: Node,
  pointer: { x: number; y: number }
): void {
  const snapped = closestNodeShapeConnectionAnchor(node, getNodeRect(node), pointer);
  const key = endpoint === "source" ? "sourceAnchor" : "targetAnchor";
  useCanvasStore.setState((state) => ({
    edges: state.edges.map((edge) => edge.id === edgeId
      ? {
          ...edge,
          data: {
            ...(edge.data ?? {}),
            [key]: snapped.anchor,
            manualRoute: true,
            preserveHandles: true,
          },
        }
      : edge),
    saveStatus: "unsaved",
  }));
}

function resetEndpointAnchor(edgeId: string, endpoint: Endpoint): void {
  const key = endpoint === "source" ? "sourceAnchor" : "targetAnchor";
  useCanvasStore.setState((state) => ({
    edges: state.edges.map((edge) => {
      if (edge.id !== edgeId) return edge;
      const data = { ...(edge.data ?? {}) } as VidyaEdgeData;
      if (key === "sourceAnchor") delete data.sourceAnchor;
      else delete data.targetAnchor;
      const hasOtherPin = !!data.sourceAnchor || !!data.targetAnchor;
      const hasBends = Array.isArray(data.waypoints) && data.waypoints.length > 0;
      if (!hasOtherPin && !hasBends && isStructuredLayout(data.layoutMode)) {
        delete data.manualRoute;
        delete data.preserveHandles;
      }
      return { ...edge, data };
    }),
    saveStatus: "unsaved",
  }));
}

function EndpointPin({
  edgeId,
  endpoint,
  node,
  point,
}: {
  edgeId: string;
  endpoint: Endpoint;
  node: Node;
  point: { x: number; y: number };
}) {
  const dragging = useRef(false);
  const historyPushed = useRef(false);
  const pushHistory = useCanvasStore((state) => state.pushHistory);
  const { screenToFlowPosition } = useReactFlow();

  return (
    <button
      data-export-ignore
      type="button"
      aria-label={`Move connection ${endpoint} pin`}
      title={`Drag to pin the ${endpoint} anywhere on this object's outline. Double-click to reset.`}
      style={{
        position: "absolute",
        transform: `translate(-50%, -50%) translate(${point.x}px,${point.y}px)`,
        pointerEvents: "all",
        zIndex: CONNECTOR_CONTROL_Z_INDEX,
      }}
      className={`nodrag nopan nowheel touch-none h-5 w-5 cursor-grab rounded-full border-[3px] border-background shadow-md outline-none hover:scale-125 focus-visible:ring-2 focus-visible:ring-primary active:cursor-grabbing ${
        endpoint === "source" ? "bg-primary" : "bg-background ring-2 ring-primary"
      }`}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        dragging.current = true;
        historyPushed.current = false;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!dragging.current) return;
        event.preventDefault();
        event.stopPropagation();
        if (!historyPushed.current) {
          pushHistory();
          historyPushed.current = true;
        }
        const currentNode = useCanvasStore.getState().nodes.find((candidate) => candidate.id === node.id);
        if (!currentNode) return;
        updateEndpointAnchor(
          edgeId,
          endpoint,
          currentNode,
          screenToFlowPosition({ x: event.clientX, y: event.clientY })
        );
      }}
      onPointerUp={(event) => {
        event.preventDefault();
        event.stopPropagation();
        dragging.current = false;
        historyPushed.current = false;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
      onPointerCancel={() => {
        dragging.current = false;
        historyPushed.current = false;
      }}
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        pushHistory();
        resetEndpointAnchor(edgeId, endpoint);
      }}
    />
  );
}

/** Direct-manipulation pins that slide continuously around both object outlines. */
export function ConnectorEndpointPins({
  edgeId,
  sourceNode,
  targetNode,
  sourcePoint,
  targetPoint,
}: ConnectorEndpointPinsProps) {
  return (
    <>
      {sourceNode && (
        <EndpointPin
          edgeId={edgeId}
          endpoint="source"
          node={sourceNode}
          point={sourcePoint}
        />
      )}
      {targetNode && (
        <EndpointPin
          edgeId={edgeId}
          endpoint="target"
          node={targetNode}
          point={targetPoint}
        />
      )}
    </>
  );
}
