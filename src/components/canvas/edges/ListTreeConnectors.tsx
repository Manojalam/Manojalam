"use client";

import { useEffect, useMemo, useState } from "react";
import { EdgeLabelRenderer, ViewportPortal, type Edge } from "@xyflow/react";
import type { VidyaEdgeData } from "@/lib/types";
import {
  buildListConnectorModel,
  DEFAULT_LIST_CONNECTOR_WIDTH,
  type ListConnectorModel,
} from "@/lib/layout/list-layout";
import { useCanvasStore } from "@/store/canvas-store";
import { useUIStore } from "@/store/ui-store";
import { resolveAccentColor } from "@/lib/style-utils";
import { ConnectionLabelEditor } from "./ConnectionLabelEditor";
import { ConnectorSvgPath } from "./ConnectorPath";

function edgeData(edge: Edge): VidyaEdgeData {
  return (edge.data ?? {}) as VidyaEdgeData;
}

function edgeColor(edge: Edge, selected = edge.selected): string {
  return selected ? "#4f46e5" : edgeData(edge).color ?? edgeData(edge).layoutColor ?? "#94a3b8";
}

function edgeWidth(edge: Edge): number {
  const configured = edgeData(edge).width;
  return typeof configured === "number" && Number.isFinite(configured) ? configured : DEFAULT_LIST_CONNECTOR_WIDTH;
}

function markerId(edgeId: string): string {
  return `list-arrow-${edgeId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function segmentPath(segment: { x1: number; y1: number; x2: number; y2: number }): string {
  return `M ${segment.x1} ${segment.y1} L ${segment.x2} ${segment.y2}`;
}

function selectEdge(edgeId: string, additive: boolean): void {
  useCanvasStore.setState((state) => ({
    nodes: additive ? state.nodes : state.nodes.map((node) => node.selected ? { ...node, selected: false } : node),
    edges: state.edges.map((edge) => ({
      ...edge,
      selected: additive ? edge.selected || edge.id === edgeId : edge.id === edgeId,
    })),
    selectedNodeIds: additive ? state.selectedNodeIds : [],
    selectedEdgeIds: additive
      ? [...new Set([...state.selectedEdgeIds, edgeId])]
      : [edgeId],
  }));
}

function branchPath(group: { segments: Array<{ x1: number; y1: number; x2: number; y2: number }> }): string {
  return group.segments.map(segmentPath).join(" ");
}

/**
 * Paints List hierarchy edges as shared outline buses. The logical React Flow
 * edges remain in state for persistence and reconnection, but their normal
 * edge components intentionally render nothing while represented here.
 */
export function ListTreeConnectors() {
  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);
  const relationshipSelection = useUIStore((state) => state.relationshipSelection);
  const [model, setModel] = useState<ListConnectorModel>(() => buildListConnectorModel(nodes, edges));

  useEffect(() => {
    const frame = requestAnimationFrame(() => setModel(buildListConnectorModel(nodes, edges)));
    return () => cancelAnimationFrame(frame);
  }, [edges, nodes]);

  const groups = model.groups;
  const nodesById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  if (relationshipSelection || !groups.length) return null;

  const branches = groups.flatMap((group) => group.branches);

  return (
    <>
      <ViewportPortal>
        <svg
          aria-hidden="true"
          className="absolute left-0 top-0 h-px w-px overflow-visible"
          style={{ zIndex: 0 }}
        >
          <defs>
            {branches.map(({ edge }) => {
              const data = edgeData(edge);
              if (data.arrowEnd !== true && data.arrowStart !== true) return null;
              const color = edgeColor(edge);
              return (
                <marker
                  key={markerId(edge.id)}
                  id={markerId(edge.id)}
                  viewBox="0 0 8 8"
                  refX="7"
                  refY="4"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                  markerUnits="strokeWidth"
                >
                  <path d="M 0 0 L 8 4 L 0 8 z" fill={color} />
                </marker>
              );
            })}
          </defs>

          {groups.map((group) => {
            const baseEdge = group.branches[0].edge;
            const data = edgeData(baseEdge);
            const parentData = (nodesById.get(group.parentId)?.data ?? {}) as Record<string, unknown>;
            const trunkColor = group.branches.length === 1
              ? edgeColor(baseEdge)
              : resolveAccentColor(parentData) ?? edgeColor(baseEdge, false);
            const trunkNormalColor = group.branches.length === 1
              ? edgeColor(baseEdge, false)
              : resolveAccentColor(parentData) ?? edgeColor(baseEdge, false);
            const trunkWidth = Math.max(...group.branches.map((branch) => edgeWidth(branch.edge)));
            return (
              <g key={group.parentId}>
                {group.sharedSegments.map((segment, index) => (
                  <ConnectorSvgPath
                    key={`shared-${index}`}
                    d={segmentPath(segment)}
                    edgeData={data}
                    color={trunkColor}
                    normalColor={trunkNormalColor}
                    width={trunkWidth}
                    markerStart={index === 0 && group.branches.length === 1 && data.arrowStart === true
                      ? `url(#${markerId(baseEdge.id)})`
                      : undefined}
                  />
                ))}
                {group.branches.map(({ edge, segments }) => {
                  const branchData = edgeData(edge);
                  const color = edgeColor(edge);
                  const path = branchPath({ segments });
                  const normalColor = branchData.color ?? branchData.layoutColor ?? "#94a3b8";
                  return (
                    <g key={edge.id}>
                      <ConnectorSvgPath
                        d={path}
                        edgeData={branchData}
                        color={color}
                        normalColor={normalColor}
                        width={edgeWidth(edge)}
                        markerEnd={branchData.arrowEnd === true ? `url(#${markerId(edge.id)})` : undefined}
                      />
                      <path
                        d={path}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={18}
                        pointerEvents="stroke"
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation();
                          selectEdge(edge.id, event.shiftKey || event.metaKey || event.ctrlKey);
                        }}
                      />
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </ViewportPortal>

      <EdgeLabelRenderer>
        {branches.map(({ edge, segments }) => {
          const data = edgeData(edge);
          if (!edge.selected && !data.label) return null;
          const segment = segments[segments.length - 1];
          const path = branchPath({ segments });
          return (
            <ConnectionLabelEditor
              key={`label-${edge.id}`}
              edgeId={edge.id}
              x={(segment.x1 + segment.x2) / 2}
              y={segment.y1}
              path={path}
              label={data.label}
              selected={edge.selected}
            />
          );
        })}
      </EdgeLabelRenderer>
    </>
  );
}
