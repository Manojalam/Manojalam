"use client";

import { useEffect, useMemo, useState } from "react";
import { EdgeLabelRenderer, ViewportPortal, type Edge } from "@xyflow/react";
import type { VidyaEdgeData } from "@/lib/types";
import {
  buildTreeConnectorModel,
  DEFAULT_TREE_CONNECTOR_WIDTH,
  type TreeConnectorModel,
} from "@/lib/layout/tree-layout";
import { resolveAccentColor } from "@/lib/style-utils";
import { useCanvasStore } from "@/store/canvas-store";
import { useUIStore } from "@/store/ui-store";
import { ConnectionLabelEditor } from "./ConnectionLabelEditor";

function edgeData(edge: Edge): VidyaEdgeData {
  return (edge.data ?? {}) as VidyaEdgeData;
}

function edgeColor(edge: Edge, selected = edge.selected): string {
  return selected ? "#4f46e5" : edgeData(edge).color ?? edgeData(edge).layoutColor ?? "#94a3b8";
}

function edgeWidth(edge: Edge): number {
  const width = edgeData(edge).width;
  return typeof width === "number" && Number.isFinite(width) ? width : DEFAULT_TREE_CONNECTOR_WIDTH;
}

function hasArrowEnd(edge: Edge): boolean {
  const configured = edgeData(edge).arrowEnd;
  return configured === true || (configured !== false && edge.markerEnd !== undefined);
}

function hasArrowStart(edge: Edge): boolean {
  return edgeData(edge).arrowStart === true || edge.markerStart !== undefined;
}

function markerId(edgeId: string): string {
  return `tree-arrow-${edgeId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function segmentPath(segment: { x1: number; y1: number; x2: number; y2: number }): string {
  return `M ${segment.x1} ${segment.y1} L ${segment.x2} ${segment.y2}`;
}

function branchPath(segments: Array<{ x1: number; y1: number; x2: number; y2: number }>): string {
  return segments.map(segmentPath).join(" ");
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

/**
 * Renders Horizontal and Vertical hierarchy edges as one shared bus per parent,
 * including manually adjusted endpoints.
 */
export function StructuredTreeConnectors() {
  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);
  const relationshipSelection = useUIStore((state) => state.relationshipSelection);
  const [model, setModel] = useState<TreeConnectorModel>(() => buildTreeConnectorModel(nodes, edges));

  useEffect(() => {
    const frame = requestAnimationFrame(() => setModel(buildTreeConnectorModel(nodes, edges)));
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
              if (!hasArrowEnd(edge) && !hasArrowStart(edge)) return null;
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
            const trunkWidth = Math.max(...group.branches.map((branch) => edgeWidth(branch.edge)));
            const commonStyle = {
              fill: "none",
              stroke: trunkColor,
              strokeWidth: trunkWidth,
              strokeDasharray: data.dashed ? "6 4" : undefined,
              strokeLinecap: "round" as const,
              strokeLinejoin: "round" as const,
              vectorEffect: "non-scaling-stroke" as const,
            };
            return (
              <g key={group.parentId}>
                {group.sharedSegments.map((segment, index) => (
                  <path
                    key={`shared-${index}`}
                    d={segmentPath(segment)}
                    {...commonStyle}
                    markerStart={index === 0 && group.branches.length === 1 && hasArrowStart(baseEdge)
                      ? `url(#${markerId(baseEdge.id)})`
                      : undefined}
                  />
                ))}
                {group.branches.map(({ edge, segments }) => {
                  const data = edgeData(edge);
                  const path = branchPath(segments);
                  return (
                    <g key={edge.id}>
                      <path
                        d={path}
                        fill="none"
                        stroke={edgeColor(edge)}
                        strokeWidth={edgeWidth(edge)}
                        strokeDasharray={data.dashed ? "6 4" : undefined}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        vectorEffect="non-scaling-stroke"
                        markerEnd={hasArrowEnd(edge) ? `url(#${markerId(edge.id)})` : undefined}
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
          return (
            <ConnectionLabelEditor
              key={`label-${edge.id}`}
              edgeId={edge.id}
              x={(segment.x1 + segment.x2) / 2}
              y={(segment.y1 + segment.y2) / 2}
              label={data.label}
              selected={edge.selected}
            />
          );
        })}
      </EdgeLabelRenderer>
    </>
  );
}
