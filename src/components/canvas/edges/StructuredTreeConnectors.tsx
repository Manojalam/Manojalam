"use client";

import { useEffect, useMemo, useState } from "react";
import { EdgeLabelRenderer, ViewportPortal, type Edge } from "@xyflow/react";
import { Trash2 } from "lucide-react";
import type { VidyaEdgeData } from "@/lib/types";
import {
  buildTreeConnectorModel,
  DEFAULT_TREE_CONNECTOR_WIDTH,
  type TreeConnectorGroup,
  type TreeConnectorModel,
} from "@/lib/layout/tree-layout";
import { resolveAccentColor } from "@/lib/style-utils";
import { useCanvasStore } from "@/store/canvas-store";
import { useUIStore } from "@/store/ui-store";

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

function markerId(edgeId: string): string {
  return `tree-arrow-${edgeId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function segmentPath(segment: { x1: number; y1: number; x2: number; y2: number }): string {
  return `M ${segment.x1} ${segment.y1} L ${segment.x2} ${segment.y2}`;
}

function branchPath(segments: Array<{ x1: number; y1: number; x2: number; y2: number }>): string {
  return segments.map(segmentPath).join(" ");
}

function visibleGroup(group: TreeConnectorGroup, manualIds: Set<string>): TreeConnectorGroup | null {
  if (manualIds.has(group.parentId)) return null;
  const branches = group.branches.filter((branch) => !manualIds.has(branch.childId));
  if (!branches.length) return null;
  return { ...group, branches };
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
 * Renders automatic Horizontal and Vertical hierarchy edges as one shared bus
 * per parent. Cross-links and manually moved endpoints stay on SmartBranchEdge.
 */
export function StructuredTreeConnectors() {
  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);
  const deleteEdges = useCanvasStore((state) => state.deleteEdges);
  const relationshipSelection = useUIStore((state) => state.relationshipSelection);
  const canvasDragging = useUIStore((state) => state.canvasDragging);
  const [model, setModel] = useState<TreeConnectorModel>(() => buildTreeConnectorModel(nodes, edges));

  useEffect(() => {
    if (canvasDragging) return;
    const frame = requestAnimationFrame(() => setModel(buildTreeConnectorModel(nodes, edges)));
    return () => cancelAnimationFrame(frame);
  }, [canvasDragging, edges, nodes]);

  const manualIds = useMemo(() => new Set(nodes
    .filter((node) => (node.data as Record<string, unknown>).treeManualOverride === true)
    .map((node) => node.id)), [nodes]);
  const groups = useMemo(() => model.groups
    .map((group) => visibleGroup(group, manualIds))
    .filter((group): group is TreeConnectorGroup => group !== null), [manualIds, model.groups]);
  const nodesById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  if (relationshipSelection || !groups.length) return null;

  const branches = groups.flatMap((group) => group.branches);
  const selectedBranches = branches.filter((branch) => branch.edge.selected);

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
              if (!hasArrowEnd(edge)) return null;
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
            const trunkColor = resolveAccentColor(parentData) ?? edgeColor(baseEdge, false);
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
                <path d={group.sharedSegments.map(segmentPath).join(" ")} {...commonStyle} />
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
        {selectedBranches.map(({ edge, segments }) => {
          const segment = segments[segments.length - 1];
          const x = (segment.x1 + segment.x2) / 2;
          const y = (segment.y1 + segment.y2) / 2;
          return (
            <button
              key={edge.id}
              type="button"
              title="Delete connection"
              aria-label="Delete connection"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                deleteEdges([edge.id]);
              }}
              style={{
                position: "absolute",
                transform: `translate(-50%, -50%) translate(${x}px,${y}px)`,
                pointerEvents: "all",
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full border bg-background text-destructive shadow-md"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          );
        })}
        {branches.map(({ edge, segments }) => {
          const label = edgeData(edge).label;
          if (!label) return null;
          const segment = segments[segments.length - 1];
          return (
            <div
              key={`label-${edge.id}`}
              style={{
                position: "absolute",
                transform: `translate(-50%, -50%) translate(${(segment.x1 + segment.x2) / 2}px,${(segment.y1 + segment.y2) / 2}px)`,
                pointerEvents: "all",
              }}
              className="rounded-md border bg-background px-1.5 py-0.5 text-[10px] font-medium shadow-sm"
            >
              {label}
            </div>
          );
        })}
      </EdgeLabelRenderer>
    </>
  );
}
