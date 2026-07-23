"use client";

import { useEffect, useMemo, useState } from "react";
import { EdgeLabelRenderer, ViewportPortal, type Edge } from "@xyflow/react";
import type { VidyaEdgeData } from "@/lib/types";
import {
  buildTreeConnectorModel,
  DEFAULT_TREE_CONNECTOR_WIDTH,
  type TreeConnectorModel,
} from "@/lib/layout/tree-layout";
import { resolveAccentColor, themeAwareLayoutConnectorColor } from "@/lib/style-utils";
import { useCanvasStore } from "@/store/canvas-store";
import { useUIStore } from "@/store/ui-store";
import { ConnectionLabelEditor } from "./ConnectionLabelEditor";
import { ConnectorSvgPath } from "./ConnectorPath";

function edgeData(edge: Edge): VidyaEdgeData {
  return (edge.data ?? {}) as VidyaEdgeData;
}

function normalEdgeColor(edge: Edge): string {
  const data = edgeData(edge);
  return data.color ?? data.layoutColor ?? "#94a3b8";
}

function edgeColor(edge: Edge, selected = edge.selected): string {
  if (selected) return "#4f46e5";
  const data = edgeData(edge);
  if (data.color) return data.color;
  return data.layoutColor ? themeAwareLayoutConnectorColor(data.layoutColor) : "#94a3b8";
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

function selectEdges(edgeIds: string[], additive: boolean): void {
  useCanvasStore.setState((state) => {
    const selectedIds = new Set(additive ? state.selectedEdgeIds : []);
    const wholeGroupSelected = edgeIds.every((edgeId) => selectedIds.has(edgeId));
    if (additive && wholeGroupSelected) edgeIds.forEach((edgeId) => selectedIds.delete(edgeId));
    else edgeIds.forEach((edgeId) => selectedIds.add(edgeId));
    return {
      nodes: additive ? state.nodes : state.nodes.map((node) => node.selected ? { ...node, selected: false } : node),
      edges: state.edges.map((edge) => ({ ...edge, selected: selectedIds.has(edge.id) })),
      selectedNodeIds: additive ? state.selectedNodeIds : [],
      selectedEdgeIds: Array.from(selectedIds),
    };
  });
}

function sharedGroupExplicitColor(edges: Edge[]): string | undefined {
  const colors = edges.map((edge) => edgeData(edge).color);
  const first = colors[0];
  return typeof first === "string" && first.length > 0 && colors.every((color) => color === first)
    ? first
    : undefined;
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
            const groupEdges = group.branches.map((branch) => branch.edge);
            const groupEdgeIds = groupEdges.map((edge) => edge.id);
            const groupSelected = groupEdges.length > 1 && groupEdges.every((edge) => edge.selected);
            const parentData = (nodesById.get(group.parentId)?.data ?? {}) as Record<string, unknown>;
            const parentAccent = resolveAccentColor(parentData) ?? edgeColor(baseEdge, false);
            const explicitGroupColor = sharedGroupExplicitColor(groupEdges);
            const trunkColor = groupSelected
              ? "#4f46e5"
              : explicitGroupColor
                ? explicitGroupColor
                : group.branches.length === 1
              ? edgeColor(baseEdge)
              : themeAwareLayoutConnectorColor(parentAccent);
            const trunkNormalColor = explicitGroupColor
              ?? (group.branches.length === 1
              ? normalEdgeColor(baseEdge)
              : parentAccent);
            const trunkWidth = Math.max(...group.branches.map((branch) => edgeWidth(branch.edge)));
            const sharedPath = branchPath(group.sharedSegments);
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
                    markerStart={index === 0 && group.branches.length === 1 && hasArrowStart(baseEdge)
                      ? `url(#${markerId(baseEdge.id)})`
                      : undefined}
                  />
                ))}
                <path
                  d={sharedPath}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={18}
                  pointerEvents="stroke"
                  className="cursor-pointer"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    selectEdges(groupEdgeIds, event.shiftKey || event.metaKey || event.ctrlKey);
                  }}
                />
                {group.branches.map(({ edge, segments }) => {
                  const data = edgeData(edge);
                  const path = branchPath(segments);
                  const normalColor = normalEdgeColor(edge);
                  return (
                    <g key={edge.id}>
                      <ConnectorSvgPath
                        d={path}
                        edgeData={data}
                        color={edgeColor(edge)}
                        normalColor={normalColor}
                        width={edgeWidth(edge)}
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
                          selectEdges([edge.id], event.shiftKey || event.metaKey || event.ctrlKey);
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
          const path = branchPath(segments);
          return (
            <ConnectionLabelEditor
              key={`label-${edge.id}`}
              edgeId={edge.id}
              x={(segment.x1 + segment.x2) / 2}
              y={(segment.y1 + segment.y2) / 2}
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
