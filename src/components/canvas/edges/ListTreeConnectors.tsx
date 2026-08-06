"use client";

import { useEffect, useMemo, useState } from "react";
import { EdgeLabelRenderer, ViewportPortal, type Edge, type Node } from "@xyflow/react";
import type { VidyaEdgeData } from "@/lib/types";
import {
  buildListConnectorModel,
  DEFAULT_LIST_CONNECTOR_WIDTH,
  type ListConnectorModel,
} from "@/lib/layout/list-layout";
import { useCanvasStore } from "@/store/canvas-store";
import { useUIStore } from "@/store/ui-store";
import { resolveAccentColor, themeAwareLayoutConnectorColor } from "@/lib/style-utils";
import {
  getTextStyle,
  resolveBorderColor,
  resolveBorderStyle,
  resolveBorderWidth,
  resolveFillColor,
  resolveLayoutFillGradient,
  resolveNodeBorderRadius,
  resolveSurfaceEffectData,
} from "@/lib/style-utils";
import { nodePlainText } from "@/lib/canvas/node-text";
import { ShapeSurface } from "../nodes/ShapeNode";
import { ConnectionLabelEditor } from "./ConnectionLabelEditor";
import { ConnectorSvgPath } from "./ConnectorPath";
import {
  canvasLayerById,
  isCanvasItemLayerLocked,
  isCanvasItemLayerVisible,
} from "@/lib/canvas/layers";

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
  const configured = edgeData(edge).width;
  return typeof configured === "number" && Number.isFinite(configured) ? configured : DEFAULT_LIST_CONNECTOR_WIDTH;
}

function markerId(edgeId: string): string {
  return `list-arrow-${edgeId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function segmentPath(segment: { x1: number; y1: number; x2: number; y2: number }): string {
  return `M ${segment.x1} ${segment.y1} L ${segment.x2} ${segment.y2}`;
}

function selectEdges(edgeIds: string[], additive: boolean): void {
  useCanvasStore.setState((state) => {
    const layersById = canvasLayerById(state.layers);
    const editableEdgeIds = edgeIds.filter((edgeId) => {
      const edge = state.edges.find((candidate) => candidate.id === edgeId);
      return edge && !isCanvasItemLayerLocked(edge, layersById);
    });
    if (!editableEdgeIds.length) return {};
    const selectedIds = new Set(additive ? state.selectedEdgeIds : []);
    const wholeGroupSelected = editableEdgeIds.every((edgeId) => selectedIds.has(edgeId));
    if (additive && wholeGroupSelected) editableEdgeIds.forEach((edgeId) => selectedIds.delete(edgeId));
    else editableEdgeIds.forEach((edgeId) => selectedIds.add(edgeId));
    return {
      nodes: additive ? state.nodes : state.nodes.map((node) => node.selected ? { ...node, selected: false } : node),
      edges: state.edges.map((edge) => ({ ...edge, selected: selectedIds.has(edge.id) })),
      selectedNodeIds: additive ? state.selectedNodeIds : [],
      selectedEdgeIds: Array.from(selectedIds),
    };
  });
}

function selectNode(nodeId: string, additive: boolean): void {
  useCanvasStore.setState((state) => {
    const node = state.nodes.find((candidate) => candidate.id === nodeId);
    if (!node || isCanvasItemLayerLocked(node, canvasLayerById(state.layers))) return {};
    const selectedIds = new Set(additive ? state.selectedNodeIds : []);
    if (additive && selectedIds.has(nodeId)) selectedIds.delete(nodeId);
    else selectedIds.add(nodeId);
    return {
      nodes: state.nodes.map((node) => ({ ...node, selected: selectedIds.has(node.id) })),
      edges: state.edges.map((edge) => edge.selected ? { ...edge, selected: false } : edge),
      selectedNodeIds: Array.from(selectedIds),
      selectedEdgeIds: [],
    };
  });
}

function ListFoldRootCopy({
  source,
  copy,
  selected,
}: {
  source: Node;
  copy: ListConnectorModel["rootCopies"][number];
  selected: boolean;
}) {
  const data = (source.data ?? {}) as Record<string, unknown>;
  const size = { width: copy.width, height: copy.height };
  const fillColor = resolveFillColor(data);
  const borderColor = resolveBorderColor(data) ?? (data.color as string | undefined) ?? "#4262ff";
  const richText = typeof data.richText === "string" && data.richText.trim()
    ? data.richText
    : undefined;
  const text = nodePlainText(data);
  const textAlign = data.textAlign === "left"
    || data.textAlign === "right"
    || data.textAlign === "justify"
    ? data.textAlign
    : "center";
  const shapeType = source.type === "shape" || source.type === "mindmap"
    ? String(data.shapeType ?? "rounded")
    : "rounded";

  return (
    <>
      <div
        data-list-fold-root-copy={copy.key}
        data-export-node-id={copy.sourceNodeId}
        className="pointer-events-none absolute"
        style={{
          left: copy.x,
          top: copy.y,
          width: copy.width,
          height: copy.height,
          zIndex: Math.max(1, source.zIndex ?? 0),
        }}
      >
        <div className="relative h-full w-full">
          <ShapeSurface
            shapeType={shapeType}
            fillColor={fillColor}
            fillGradient={resolveLayoutFillGradient(data)}
            borderColor={borderColor}
            borderWidth={resolveBorderWidth(data)}
            borderStyle={resolveBorderStyle(data)}
            borderRadius={resolveNodeBorderRadius(data, size, 40)}
            selected={selected}
            petalCount={typeof data.petalCount === "number" ? data.petalCount : undefined}
            effectData={resolveSurfaceEffectData(data)}
          />
          <div
            className="absolute inset-0 z-10 flex items-center justify-center overflow-hidden px-4 py-2 font-medium [&_p]:m-0"
            style={{
              ...getTextStyle(data, fillColor),
              textAlign,
            }}
          >
            {richText
              ? <div className="w-full" dangerouslySetInnerHTML={{ __html: richText }} />
              : <div className="w-full">{text}</div>}
          </div>
        </div>
      </div>
      <button
        type="button"
        data-export-ignore
        aria-label={`Select ${text || "List Fold root"}`}
        aria-pressed={selected}
        className="nodrag nopan pointer-events-auto absolute z-30 cursor-pointer border-0 bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        style={{ left: copy.x, top: copy.y, width: copy.width, height: copy.height }}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          selectNode(copy.sourceNodeId, event.shiftKey || event.ctrlKey || event.metaKey);
        }}
      />
    </>
  );
}

function sharedGroupExplicitColor(edges: Edge[]): string | undefined {
  const colors = edges.map((edge) => edgeData(edge).color);
  const first = colors[0];
  return typeof first === "string" && first.length > 0 && colors.every((color) => color === first)
    ? first
    : undefined;
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
  const layers = useCanvasStore((state) => state.layers);
  const relationshipSelection = useUIStore((state) => state.relationshipSelection);
  const layersById = useMemo(() => canvasLayerById(layers), [layers]);
  const visibleNodes = useMemo(
    () => nodes.filter((node) => !node.hidden && isCanvasItemLayerVisible(node, layersById)),
    [layersById, nodes]
  );
  const visibleEdges = useMemo(
    () => edges.filter((edge) => !edge.hidden && isCanvasItemLayerVisible(edge, layersById)),
    [edges, layersById]
  );
  const [model, setModel] = useState<ListConnectorModel>(() =>
    buildListConnectorModel(visibleNodes, visibleEdges)
  );

  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      setModel(buildListConnectorModel(visibleNodes, visibleEdges))
    );
    return () => cancelAnimationFrame(frame);
  }, [visibleEdges, visibleNodes]);

  const groups = model.groups;
  const rootCopies = model.rootCopies;
  const nodesById = useMemo(
    () => new Map(visibleNodes.map((node) => [node.id, node])),
    [visibleNodes]
  );

  if (relationshipSelection || (!groups.length && !rootCopies.length)) return null;

  const branches = groups.flatMap((group) => group.branches);

  return (
    <>
      {rootCopies.length > 0 && (
        <ViewportPortal>
          {rootCopies.map((copy) => {
            const source = nodesById.get(copy.sourceNodeId);
            if (!source) return null;
            return (
              <ListFoldRootCopy
                key={copy.key}
                source={source}
                copy={copy}
                selected={source.selected === true}
              />
            );
          })}
        </ViewportPortal>
      )}
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
            const sharedPath = branchPath({ segments: group.sharedSegments });
            return (
              <g key={group.parentId}>
                <ConnectorSvgPath
                  data-export-edge-ids={groupEdgeIds.join(" ")}
                  d={sharedPath}
                  edgeData={data}
                  color={trunkColor}
                  normalColor={trunkNormalColor}
                  width={trunkWidth}
                  markerStart={group.branches.length === 1 && data.arrowStart === true
                    ? `url(#${markerId(baseEdge.id)})`
                    : undefined}
                />
                <path
                  data-export-ignore
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
                  const branchData = edgeData(edge);
                  const color = edgeColor(edge);
                  const path = branchPath({ segments });
                  const normalColor = normalEdgeColor(edge);
                  return (
                    <g key={edge.id} data-export-edge-id={edge.id}>
                      <ConnectorSvgPath
                        d={path}
                        edgeData={branchData}
                        color={color}
                        normalColor={normalColor}
                        width={edgeWidth(edge)}
                        markerEnd={branchData.arrowEnd === true ? `url(#${markerId(edge.id)})` : undefined}
                      />
                      <path
                        data-export-ignore
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
