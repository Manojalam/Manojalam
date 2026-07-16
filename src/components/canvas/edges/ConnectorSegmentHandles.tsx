"use client";

import { useRef } from "react";
import { useReactFlow } from "@xyflow/react";
import type { RoutePoint, Side } from "@/lib/layout/edge-routing";
import {
  dragRouteSegmentToWaypoints,
  draggableRouteSegments,
} from "@/lib/canvas/connector-waypoints";
import { useCanvasStore } from "@/store/canvas-store";

interface ConnectorSegmentHandlesProps {
  edgeId: string;
  routePoints: RoutePoint[];
  sourceSide: Side;
  targetSide: Side;
  endpointOptions?: { sourceStubDistance?: number; targetStubDistance?: number };
}

interface SegmentDragState {
  segmentIndex: number;
  orientation: "horizontal" | "vertical";
  routePoints: RoutePoint[];
}

function replaceWaypoints(edgeId: string, waypoints: RoutePoint[]): void {
  useCanvasStore.setState((state) => ({
    edges: state.edges.map((edge) => edge.id === edgeId
      ? {
          ...edge,
          data: {
            ...(edge.data ?? {}),
            manualRoute: true,
            preserveHandles: true,
            waypoints,
          },
        }
      : edge),
    saveStatus: "unsaved",
  }));
}

/** Wide invisible grab areas that translate complete orthogonal segments. */
export function ConnectorSegmentHandles({
  edgeId,
  routePoints,
  sourceSide,
  targetSide,
  endpointOptions,
}: ConnectorSegmentHandlesProps) {
  const dragging = useRef<SegmentDragState | null>(null);
  const pushHistory = useCanvasStore((state) => state.pushHistory);
  const { screenToFlowPosition } = useReactFlow();
  const segments = draggableRouteSegments(routePoints);

  return (
    <g data-export-ignore className="nodrag nopan nowheel">
      {segments.map((segment) => (
        <path
          key={`${edgeId}-segment-${segment.index}`}
          d={`M ${segment.start.x} ${segment.start.y} L ${segment.end.x} ${segment.end.y}`}
          fill="none"
          stroke="transparent"
          strokeWidth={24}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          pointerEvents="stroke"
          className="transition-colors hover:stroke-primary/20"
          style={{ cursor: segment.orientation === "horizontal" ? "ns-resize" : "ew-resize" }}
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            pushHistory();
            dragging.current = {
              segmentIndex: segment.index,
              orientation: segment.orientation,
              routePoints: routePoints.map((point) => ({ ...point })),
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const active = dragging.current;
            if (!active || active.segmentIndex !== segment.index) return;
            event.preventDefault();
            event.stopPropagation();
            const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
            const coordinate = active.orientation === "horizontal" ? point.y : point.x;
            const waypoints = dragRouteSegmentToWaypoints(
              active.routePoints,
              active.segmentIndex,
              Math.round(coordinate),
              sourceSide,
              targetSide,
              endpointOptions
            );
            replaceWaypoints(edgeId, waypoints);
          }}
          onPointerUp={(event) => {
            event.preventDefault();
            event.stopPropagation();
            dragging.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
          }}
          onPointerCancel={() => {
            dragging.current = null;
          }}
        >
          <title>
            {segment.orientation === "horizontal"
              ? "Drag up or down to move this connection segment"
              : "Drag left or right to move this connection segment"}
          </title>
        </path>
      ))}
    </g>
  );
}
