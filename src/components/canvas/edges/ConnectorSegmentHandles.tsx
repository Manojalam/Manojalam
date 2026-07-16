"use client";

import { useRef } from "react";
import { useReactFlow } from "@xyflow/react";
import {
  routeManualOrthogonalEdge,
  type RoutePoint,
  type Side,
} from "@/lib/layout/edge-routing";
import {
  dragRouteSegmentToWaypoints,
  draggableRouteSegments,
  labelOffsetAfterSegmentTranslation,
} from "@/lib/canvas/connector-waypoints";
import { useCanvasStore } from "@/store/canvas-store";

interface ConnectorSegmentHandlesProps {
  edgeId: string;
  routePoints: RoutePoint[];
  sourceSide: Side;
  targetSide: Side;
  endpointOptions?: { sourceStubDistance?: number; targetStubDistance?: number };
  labelEdgeId?: string;
  labelAnchor: RoutePoint;
}

interface SegmentDragState {
  segmentIndex: number;
  orientation: "horizontal" | "vertical";
  routePoints: RoutePoint[];
  startCoordinate: number;
  startLabelAnchor: RoutePoint;
  startLabelOffset?: RoutePoint;
}

function replaceWaypoints(
  edgeId: string,
  waypoints: RoutePoint[],
  labelUpdate?: { edgeId: string; offset: RoutePoint }
): void {
  useCanvasStore.setState((state) => ({
    edges: state.edges.map((edge) => {
      if (edge.id !== edgeId && edge.id !== labelUpdate?.edgeId) return edge;
      const data = { ...(edge.data ?? {}) } as Record<string, unknown>;
      if (edge.id === edgeId) {
        data.manualRoute = true;
        data.preserveHandles = true;
        data.waypoints = waypoints;
      }
      if (edge.id === labelUpdate?.edgeId) {
        const x = Math.round(labelUpdate.offset.x);
        const y = Math.round(labelUpdate.offset.y);
        if (x || y) data.labelOffset = { x, y };
        else delete data.labelOffset;
      }
      return { ...edge, data };
    }),
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
  labelEdgeId,
  labelAnchor,
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
              startCoordinate: segment.orientation === "horizontal" ? segment.start.y : segment.start.x,
              startLabelAnchor: { ...labelAnchor },
              startLabelOffset: (() => {
                if (!labelEdgeId) return undefined;
                const value = useCanvasStore.getState().edges.find((edge) => (
                  edge.id === labelEdgeId
                ))?.data?.labelOffset as { x?: unknown; y?: unknown } | undefined;
                return {
                  x: typeof value?.x === "number" ? value.x : 0,
                  y: typeof value?.y === "number" ? value.y : 0,
                };
              })(),
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
            const nextLabelAnchor = waypoints.length
              ? (() => {
                  const nextRoute = routeManualOrthogonalEdge(
                    active.routePoints[0],
                    active.routePoints[active.routePoints.length - 1],
                    sourceSide,
                    targetSide,
                    waypoints,
                    endpointOptions
                  );
                  return { x: nextRoute.labelX, y: nextRoute.labelY };
                })()
              : active.startLabelAnchor;
            const labelUpdate = labelEdgeId && active.startLabelOffset
              ? {
                  edgeId: labelEdgeId,
                  offset: labelOffsetAfterSegmentTranslation(
                    active.startLabelAnchor,
                    active.startLabelOffset,
                    nextLabelAnchor,
                    active.orientation,
                    coordinate - active.startCoordinate
                  ),
                }
              : undefined;
            replaceWaypoints(edgeId, waypoints, labelUpdate);
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
