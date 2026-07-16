"use client";

import { Fragment, useRef } from "react";
import { useReactFlow } from "@xyflow/react";
import { X } from "lucide-react";
import { useCanvasStore } from "@/store/canvas-store";

interface ConnectorBendHandlesProps {
  edgeId: string;
  waypoints: Array<{ x: number; y: number }>;
}

function updateWaypoint(edgeId: string, index: number, point: { x: number; y: number }): void {
  useCanvasStore.setState((state) => ({
    edges: state.edges.map((edge) => {
      if (edge.id !== edgeId) return edge;
      const data = (edge.data ?? {}) as Record<string, unknown>;
      const waypoints = Array.isArray(data.waypoints)
        ? data.waypoints.map((waypoint) => ({ ...(waypoint as { x: number; y: number }) }))
        : [];
      if (!waypoints[index]) return edge;
      waypoints[index] = point;
      return { ...edge, data: { ...data, waypoints } };
    }),
    saveStatus: "unsaved",
  }));
}

function removeWaypoint(edgeId: string, index: number): void {
  useCanvasStore.setState((state) => ({
    edges: state.edges.map((edge) => {
      if (edge.id !== edgeId) return edge;
      const data = { ...(edge.data ?? {}) } as Record<string, unknown>;
      const waypoints = Array.isArray(data.waypoints)
        ? data.waypoints.map((waypoint) => ({ ...(waypoint as { x: number; y: number }) }))
        : [];
      if (!waypoints[index]) return edge;
      waypoints.splice(index, 1);
      if (waypoints.length) data.waypoints = waypoints;
      else delete data.waypoints;
      return { ...edge, data };
    }),
    saveStatus: "unsaved",
  }));
}

/** Draggable canvas-space anchors for a manually adjusted connector. */
export function ConnectorBendHandles({ edgeId, waypoints }: ConnectorBendHandlesProps) {
  const draggingIndex = useRef<number | null>(null);
  const pushHistory = useCanvasStore((state) => state.pushHistory);
  const { screenToFlowPosition } = useReactFlow();

  return (
    <>
      {waypoints.map((waypoint, index) => (
        <Fragment key={`${edgeId}-bend-${index}`}>
          <button
            data-export-ignore
            type="button"
            aria-label={`Drag connector bend ${index + 1}`}
            title="Drag to bend the connector"
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${waypoint.x}px,${waypoint.y}px)`,
              pointerEvents: "all",
            }}
            className="nodrag nopan z-20 h-4 w-4 cursor-move rounded-full border-2 border-primary bg-background shadow-md outline-none hover:scale-125 focus-visible:ring-2 focus-visible:ring-primary"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              pushHistory();
              draggingIndex.current = index;
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (draggingIndex.current !== index) return;
              event.preventDefault();
              event.stopPropagation();
              const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
              updateWaypoint(edgeId, index, {
                x: Math.round(point.x),
                y: Math.round(point.y),
              });
            }}
            onPointerUp={(event) => {
              event.stopPropagation();
              draggingIndex.current = null;
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
            }}
            onPointerCancel={() => {
              draggingIndex.current = null;
            }}
          />
          <button
            data-export-ignore
            type="button"
            aria-label={`Remove connector bend ${index + 1}`}
            title="Clear this bend point"
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${waypoint.x + 13}px,${waypoint.y - 13}px)`,
              pointerEvents: "all",
            }}
            className="nodrag nopan z-20 flex h-4 w-4 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm hover:border-destructive hover:bg-destructive/10 hover:text-destructive"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              pushHistory();
              removeWaypoint(edgeId, index);
            }}
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </Fragment>
      ))}
    </>
  );
}
