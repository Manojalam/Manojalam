"use client";

import { memo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  useNodesData,
  useNodes,
  useEdges,
  type EdgeProps,
} from "@xyflow/react";
import type { VidyaEdgeData } from "@/lib/types";
import { getNodeRect, type NodeRect } from "@/lib/layout";
import { routeLayoutEdge, type LayoutRouteOptions } from "@/lib/layout/edge-routing";
import { useUIStore } from "@/store/ui-store";
import { ConnectionLabelEditor } from "./ConnectionLabelEditor";

const ROUTING_CORRIDOR_PAD = 360;
const MAX_ROUTING_OBSTACLES = 160;

function nearRouteCorridor(rect: NodeRect, source: NodeRect, target: NodeRect): boolean {
  const minX = Math.min(source.x, target.x) - ROUTING_CORRIDOR_PAD;
  const minY = Math.min(source.y, target.y) - ROUTING_CORRIDOR_PAD;
  const maxX = Math.max(source.x + source.width, target.x + target.width) + ROUTING_CORRIDOR_PAD;
  const maxY = Math.max(source.y + source.height, target.y + target.height) + ROUTING_CORRIDOR_PAD;
  return rect.x < maxX && rect.x + rect.width > minX && rect.y < maxY && rect.y + rect.height > minY;
}

function orderedFraction(index: number, total: number): number {
  if (total <= 1) return 0.5;
  return 0.16 + (index / (total - 1)) * 0.68;
}

function routeOptionsForEdge(
  edgeId: string,
  sourceId: string,
  targetId: string,
  layoutMode: VidyaEdgeData["layoutMode"],
  nodes: ReturnType<typeof useNodes>,
  edges: ReturnType<typeof useEdges>
): LayoutRouteOptions {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const vertical = layoutMode === "vertical" || layoutMode === "topDown";
  const crossCenter = (nodeId: string): number => {
    const node = byId.get(nodeId);
    if (!node) return 0;
    const rect = getNodeRect(node);
    return vertical ? rect.centerX : rect.centerY;
  };
  const sameMode = (edge: (typeof edges)[number]) => {
    const edgeData = (edge.data ?? {}) as VidyaEdgeData;
    return !edge.hidden && edgeData.layoutMode === layoutMode;
  };
  const outgoing = edges
    .filter((edge) => edge.source === sourceId && sameMode(edge))
    .sort((a, b) => crossCenter(a.target) - crossCenter(b.target) || a.id.localeCompare(b.id));
  const incoming = edges
    .filter((edge) => edge.target === targetId && sameMode(edge))
    .sort((a, b) => crossCenter(a.source) - crossCenter(b.source) || a.id.localeCompare(b.id));
  const sourceIndex = Math.max(0, outgoing.findIndex((edge) => edge.id === edgeId));
  const targetIndex = Math.max(0, incoming.findIndex((edge) => edge.id === edgeId));
  const structured = layoutMode === "horizontal"
    || layoutMode === "vertical"
    || layoutMode === "topDown"
    || layoutMode === "linear";

  return {
    sourceFraction: orderedFraction(sourceIndex, outgoing.length),
    targetFraction: orderedFraction(targetIndex, incoming.length),
    laneOffset: structured
      ? Math.max(-42, Math.min(42, (sourceIndex - (outgoing.length - 1) / 2) * 12))
      : 0,
  };
}

function RoutedSmartBranchEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
  markerStart,
  markerEnd,
}: EdgeProps) {
  const d = (data ?? {}) as VidyaEdgeData;
  const edgeColor = d.color ?? d.layoutColor;
  const nodes = useNodes();
  const edges = useEdges();
  const canvasDragging = useUIStore((s) => s.canvasDragging);
  if (d.hiddenInMatrix || d.hiddenInSunburst) return null;

  let path: string;
  let labelX: number;
  let labelY: number;

  const curveStyle = d.curveStyle ?? "step";
  const sourceNode = nodes.find((n) => n.id === source);
  const targetNode = nodes.find((n) => n.id === target);
  const manualRoute = d.manualRoute === true;

  // Keep every connector inexpensive while nodes are moving. The obstacle-aware
  // route is recalculated from the final node geometry as soon as dragging ends.
  if (canvasDragging || curveStyle !== "step" || manualRoute) {
    const routed = curveStyle === "straight"
      ? getStraightPath({ sourceX, sourceY, targetX, targetY })
      : curveStyle === "smooth"
        ? getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
        : getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 8 });
    [path, labelX, labelY] = routed;
  } else if (sourceNode && targetNode) {
    const sourceRect = getNodeRect(sourceNode);
    const targetRect = getNodeRect(targetNode);
    const obstacles: NodeRect[] = [];
    for (const n of nodes) {
      if (n.id === source || n.id === target) continue;
      if (n.hidden || n.type === "frame") continue;
      const rect = getNodeRect(n);
      if (!nearRouteCorridor(rect, sourceRect, targetRect)) continue;
      obstacles.push(rect);
      if (obstacles.length >= MAX_ROUTING_OBSTACLES) break;
    }

    const routed = routeLayoutEdge(
      sourceRect,
      targetRect,
      d.layoutMode,
      obstacles,
      routeOptionsForEdge(id, source, target, d.layoutMode, nodes, edges)
    );
    if (!routed.path) return null;
    path = routed.path;
    labelX = routed.labelX;
    labelY = routed.labelY;
  } else {
    path = `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;
    labelX = (sourceX + targetX) / 2;
    labelY = (sourceY + targetY) / 2;
  }

  return (
    <>
      <BaseEdge
        data-export-normal-stroke={edgeColor ?? "#94a3b8"}
        id={id}
        path={path}
        markerStart={markerStart}
        markerEnd={markerEnd}
        interactionWidth={28}
        style={{
          stroke: selected ? "#6366f1" : edgeColor ?? "#94a3b8",
          strokeWidth: d.width ?? 2,
          strokeDasharray: d.dashed ? "6 4" : undefined,
        }}
      />
      {(selected || d.label) && (
        <EdgeLabelRenderer>
          <ConnectionLabelEditor
            edgeId={id}
            x={labelX}
            y={labelY}
            label={d.label}
            selected={selected}
          />
        </EdgeLabelRenderer>
      )}
    </>
  );
}

function SmartBranchEdgeComponent(props: EdgeProps) {
  const endpointData = useNodesData([props.source, props.target]);
  const targetData = (endpointData.find((node) => node.id === props.target)?.data ?? {}) as Record<string, unknown>;
  const data = (props.data ?? {}) as VidyaEdgeData;
  const manualRoute = data.manualRoute === true;
  const isGroupedListEdge = data.layoutMode === "list"
    && !manualRoute
    && targetData.parentId === props.source;
  const isGroupedTreeEdge = (
    data.layoutMode === "horizontal"
    || data.layoutMode === "vertical"
    || data.layoutMode === "topDown"
  )
    && !manualRoute
    && targetData.parentId === props.source;
  return isGroupedListEdge || isGroupedTreeEdge ? null : <RoutedSmartBranchEdge {...props} />;
}

export const SmartBranchEdge = memo(SmartBranchEdgeComponent);
