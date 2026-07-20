"use client";

import { memo } from "react";
import {
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  useNodesData,
  useNodes,
  useEdges,
  Position,
  type EdgeProps,
} from "@xyflow/react";
import type { VidyaEdgeData } from "@/lib/types";
import { getNodeRect, type NodeRect } from "@/lib/layout";
import {
  routeLayoutEdge,
  routeManualOrthogonalEdge,
  routeOrthogonalEdge,
  type LayoutRouteOptions,
  type RoutePoint,
  type Side,
} from "@/lib/layout/edge-routing";
import { useUIStore } from "@/store/ui-store";
import { useCanvasStore } from "@/store/canvas-store";
import { generateId } from "@/lib/utils";
import {
  findConnectorLabelOwnerEdge,
  findLogicalConnectorEdgeIds,
  splitConnectorAtJunction,
} from "@/lib/canvas/connector-junction";
import { closestPointOnRoute, insertWaypointOnRoute } from "@/lib/canvas/connector-waypoints";
import { isConnectorRoutingObstacle } from "@/lib/canvas/connector-obstacles";
import { ConnectionLabelEditor } from "./ConnectionLabelEditor";
import { ConnectorBendHandles } from "./ConnectorBendHandles";
import { ConnectorPath } from "./ConnectorPath";
import { ConnectorSegmentHandles } from "./ConnectorSegmentHandles";

const ROUTING_CORRIDOR_PAD = 360;
const MAX_ROUTING_OBSTACLES = 160;

function positionSide(position: Position): Side {
  switch (position) {
    case Position.Top: return "top";
    case Position.Bottom: return "bottom";
    case Position.Left: return "left";
    case Position.Right: return "right";
  }
}

function edgeWaypoints(data: VidyaEdgeData): RoutePoint[] {
  if (!Array.isArray(data.waypoints)) return [];
  return data.waypoints.filter((point) => (
    !!point && Number.isFinite(point.x) && Number.isFinite(point.y)
  ));
}

function setEdgeWaypoints(edgeId: string, waypoints: RoutePoint[] | undefined): void {
  useCanvasStore.setState((state) => ({
    edges: state.edges.map((edge) => {
      if (edge.id !== edgeId) return edge;
      const data = { ...(edge.data ?? {}) } as VidyaEdgeData;
      if (waypoints?.length) {
        data.waypoints = waypoints;
        data.waypointOrigin = "bend";
      } else {
        delete data.waypoints;
        delete data.waypointOrigin;
      }
      return { ...edge, data };
    }),
    saveStatus: "unsaved",
  }));
}

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
  markerStart,
  markerEnd,
}: EdgeProps) {
  const d = (data ?? {}) as VidyaEdgeData;
  const edgeColor = d.color ?? d.layoutColor;
  const nodes = useNodes();
  const edges = useEdges();
  const pushHistory = useCanvasStore((state) => state.pushHistory);
  const canvasDragging = useUIStore((s) => s.canvasDragging);
  const connectorClickPoint = useUIStore((s) => s.connectorClickPoint);
  if (d.hiddenInMatrix || d.hiddenInSunburst) return null;

  let path: string;
  let labelX: number;
  let labelY: number;
  let routePoints: RoutePoint[];

  const curveStyle = d.curveStyle ?? "step";
  const sourceNode = nodes.find((n) => n.id === source);
  const targetNode = nodes.find((n) => n.id === target);
  const junctionEndpoint = sourceNode?.type === "junction" || targetNode?.type === "junction";
  const endpointOptions = {
    sourceStubDistance: sourceNode?.type === "junction" ? 0 : undefined,
    targetStubDistance: targetNode?.type === "junction" ? 0 : undefined,
  };
  const manualRoute = d.manualRoute === true;
  const waypoints = edgeWaypoints(d);
  const labelOwnerEdge = findConnectorLabelOwnerEdge(edges, id);
  const labelOwnerId = labelOwnerEdge?.id ?? id;
  const labelOwnerData = (labelOwnerEdge?.data ?? d) as VidyaEdgeData;
  const connectionLabel = typeof labelOwnerData.label === "string" ? labelOwnerData.label : undefined;
  const logicalEdgeIds = findLogicalConnectorEdgeIds(edges, id);
  const logicalEdgeIdSet = new Set(logicalEdgeIds);
  const storedLabelPathEdgeId = typeof labelOwnerData.labelPathEdgeId === "string"
    && logicalEdgeIdSet.has(labelOwnerData.labelPathEdgeId)
    ? labelOwnerData.labelPathEdgeId
    : labelOwnerId;
  const labelRendersOnThisEdge = storedLabelPathEdgeId === id;
  const logicalSelected = edges.some((edge) => logicalEdgeIdSet.has(edge.id) && edge.selected);
  const activeSegmentId = connectorClickPoint?.edgeId && logicalEdgeIdSet.has(connectorClickPoint.edgeId)
    ? connectorClickPoint.edgeId
    : labelOwnerId;
  const editorSelected = logicalSelected && activeSegmentId === id;

  // Keep every connector inexpensive while nodes are moving. The obstacle-aware
  // route is recalculated from the final node geometry as soon as dragging ends.
  if (curveStyle !== "step" || (canvasDragging && !waypoints.length && !junctionEndpoint)) {
    const routed = curveStyle === "straight"
      ? getStraightPath({ sourceX, sourceY, targetX, targetY })
      : curveStyle === "smooth"
        ? getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
        : getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 8 });
    [path, labelX, labelY] = routed;
    routePoints = [{ x: sourceX, y: sourceY }, { x: targetX, y: targetY }];
  } else if (sourceNode && targetNode) {
    const sourceRect = getNodeRect(sourceNode);
    const targetRect = getNodeRect(targetNode);
    const obstacles: NodeRect[] = [];
    for (const n of nodes) {
      if (n.id === source || n.id === target) continue;
      if (!isConnectorRoutingObstacle(n)) continue;
      const rect = getNodeRect(n);
      if (!nearRouteCorridor(rect, sourceRect, targetRect)) continue;
      obstacles.push(rect);
      if (obstacles.length >= MAX_ROUTING_OBSTACLES) break;
    }

    const routed = waypoints.length
      ? routeManualOrthogonalEdge(
          { x: sourceX, y: sourceY },
          { x: targetX, y: targetY },
          positionSide(sourcePosition),
          positionSide(targetPosition),
          waypoints,
          endpointOptions
        )
      : manualRoute
        ? routeOrthogonalEdge(
            { x: sourceX, y: sourceY },
            { x: targetX, y: targetY },
            positionSide(sourcePosition),
            positionSide(targetPosition),
            obstacles,
            [],
            endpointOptions
          )
        : routeLayoutEdge(
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
    routePoints = routed.points;
  } else {
    path = `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;
    labelX = (sourceX + targetX) / 2;
    labelY = (sourceY + targetY) / 2;
    routePoints = [{ x: sourceX, y: sourceY }, { x: targetX, y: targetY }];
  }

  return (
    <>
      <ConnectorPath
        id={id}
        path={path}
        edgeData={d}
        color={logicalSelected ? "#6366f1" : edgeColor ?? "#94a3b8"}
        normalColor={edgeColor ?? "#94a3b8"}
        width={d.width ?? 2}
        markerStart={sourceNode?.type === "junction" ? undefined : markerStart}
        markerEnd={targetNode?.type === "junction" ? undefined : markerEnd}
        interactionWidth={48}
      />
      {editorSelected && curveStyle === "step" && (
        <ConnectorSegmentHandles
          edgeId={id}
          routePoints={routePoints}
          sourceSide={positionSide(sourcePosition)}
          targetSide={positionSide(targetPosition)}
          endpointOptions={endpointOptions}
          labelEdgeId={labelRendersOnThisEdge && connectionLabel ? labelOwnerId : undefined}
          labelAnchor={{ x: labelX, y: labelY }}
          resultWaypointOrigin={d.waypointOrigin === "bend" ? "bend" : "segment-drag"}
        />
      )}
      {(logicalSelected || (labelRendersOnThisEdge && connectionLabel)) && (
        <EdgeLabelRenderer>
          <ConnectionLabelEditor
            edgeId={labelOwnerId}
            toolbarEdgeId={id}
            deleteEdgeId={id}
            x={labelX}
            y={labelY}
            path={path}
            label={connectionLabel}
            selected={editorSelected}
            showLabel={labelRendersOnThisEdge}
            onAddBend={curveStyle === "step" ? () => {
              pushHistory();
              setEdgeWaypoints(id, insertWaypointOnRoute(routePoints, waypoints));
            } : undefined}
            onResetRoute={waypoints.length ? () => {
              pushHistory();
              setEdgeWaypoints(id, undefined);
            } : undefined}
            onAddJunction={curveStyle === "step" ? () => {
              const state = useCanvasStore.getState();
              const edge = state.edges.find((candidate) => candidate.id === id);
              if (!edge) return;
              const junctionPoint = connectorClickPoint?.edgeId === id
                ? closestPointOnRoute(routePoints, connectorClickPoint)
                : { x: labelX, y: labelY };
              state.pushHistory();
              const split = splitConnectorAtJunction(
                edge,
                junctionPoint,
                { x: sourceX, y: sourceY },
                { x: targetX, y: targetY },
                {
                  junctionId: generateId(),
                  firstEdgeId: generateId(),
                  secondEdgeId: generateId(),
                },
                routePoints
              );
              useCanvasStore.setState((current) => ({
                nodes: [
                  ...current.nodes.map((node) => {
                    const nodeData = (node.data ?? {}) as Record<string, unknown>;
                    let nextData = nodeData;
                    if (node.id === source && Array.isArray(nodeData.childOrder)) {
                      nextData = {
                        ...nextData,
                        childOrder: (nodeData.childOrder as string[]).filter((childId) => childId !== target),
                      };
                    }
                    if (node.id === target && nodeData.parentId === source) {
                      nextData = { ...nextData, parentId: null };
                    }
                    return { ...node, selected: false, data: nextData };
                  }),
                  split.junction,
                ],
                edges: [
                  ...current.edges.filter((candidate) => candidate.id !== id).map((candidate) => (
                    candidate.selected ? { ...candidate, selected: false } : candidate
                  )),
                  ...split.edges,
                ],
                selectedNodeIds: [split.junction.id],
                selectedEdgeIds: [],
                saveStatus: "unsaved",
              }));
              useUIStore.getState().setConnectorClickPoint(null);
            } : undefined}
          />
          {editorSelected && curveStyle === "step" && d.waypointOrigin !== "segment-drag" && (
            <ConnectorBendHandles edgeId={id} routePoints={routePoints} waypoints={waypoints} />
          )}
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
  const hasWaypoints = Array.isArray(data.waypoints) && data.waypoints.length > 0;
  const isGroupedListEdge = data.layoutMode === "list"
    && !manualRoute
    && !hasWaypoints
    && !props.selected
    && targetData.parentId === props.source;
  const isGroupedTreeEdge = (
    data.layoutMode === "horizontal"
    || data.layoutMode === "vertical"
    || data.layoutMode === "topDown"
  )
    && !manualRoute
    && !hasWaypoints
    && !props.selected
    && targetData.parentId === props.source;
  return isGroupedListEdge || isGroupedTreeEdge ? null : <RoutedSmartBranchEdge {...props} />;
}

export const SmartBranchEdge = memo(SmartBranchEdgeComponent);
