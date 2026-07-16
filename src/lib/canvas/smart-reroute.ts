import { MarkerType, type Edge, type Node } from "@xyflow/react";
import type { LayoutMode } from "../types";
import { isMatrixHierarchyEdge, routeForMode } from "../layout";
import { buildHierarchy, getSubtree } from "../layout/hierarchy";

const STEP_LAYOUT_MODES = new Set<LayoutMode>([
  "horizontal",
  "vertical",
  "topDown",
  "list",
  "matrix",
  "linear",
]);

export interface SmartRerouteOptions {
  /** Clears user bend anchors and chooses new attachment sides. */
  resetManualAdjustments?: boolean;
}

export interface SmartRerouteResult {
  edges: Edge[];
  reroutedCount: number;
  preservedManualCount: number;
  unresolvedCount: number;
  changedCount: number;
}

function storedLayoutMode(value: unknown): LayoutMode | undefined {
  return typeof value === "string" ? value as LayoutMode : undefined;
}

function findLayoutOwner(
  nodeId: string,
  byId: Map<string, Node>
): { id: string; mode?: LayoutMode } {
  let current = byId.get(nodeId);
  let fallback = nodeId;
  const visited = new Set<string>();
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    fallback = current.id;
    const data = (current.data ?? {}) as Record<string, unknown>;
    const mode = storedLayoutMode(data.layoutMode);
    if (mode) return { id: current.id, mode };
    current = typeof data.parentId === "string" ? byId.get(data.parentId) : undefined;
  }
  return { id: fallback };
}

function hasManualAdjustment(data: Record<string, unknown>): boolean {
  return data.preserveHandles === true
    || (Array.isArray(data.waypoints) && data.waypoints.length > 0);
}

function usesSmartStep(
  source: Node,
  target: Node,
  mode: LayoutMode,
  existingStyle: unknown
): boolean {
  if (STEP_LAYOUT_MODES.has(mode)) return true;
  if (source.type === "junction" || target.type === "junction") return true;
  if (source.type === "shape" || target.type === "shape") {
    return existingStyle !== "straight" && existingStyle !== "smooth";
  }
  return false;
}

function sameEdge(first: Edge, second: Edge): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

/**
 * Repairs routing metadata for the whole board. The safe default preserves
 * intentional bend anchors and attachment ports; reset mode removes them.
 * Actual obstacle avoidance remains render-time so routes respond to node moves.
 */
export function smartRerouteBoardEdges(
  nodes: Node[],
  edges: Edge[],
  options: SmartRerouteOptions = {}
): SmartRerouteResult {
  const resetManual = options.resetManualAdjustments === true;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const hierarchy = buildHierarchy(nodes, edges);
  const matrixScopes = new Map<string, Set<string>>();
  for (const node of nodes) {
    const data = (node.data ?? {}) as Record<string, unknown>;
    if (data.layoutMode === "matrix") {
      matrixScopes.set(node.id, new Set(getSubtree(node.id, hierarchy)));
    }
  }

  let reroutedCount = 0;
  let preservedManualCount = 0;
  let unresolvedCount = 0;
  let changedCount = 0;

  const nextEdges = edges.map((edge) => {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source || !target) {
      unresolvedCount++;
      return edge;
    }

    const edgeData = (edge.data ?? {}) as Record<string, unknown>;
    const sourceData = (source.data ?? {}) as Record<string, unknown>;
    const targetData = (target.data ?? {}) as Record<string, unknown>;
    const junctionEndpoint = source.type === "junction" || target.type === "junction";
    const manualAdjustment = hasManualAdjustment(edgeData);
    const preserveManual = manualAdjustment && !resetManual;
    if (preserveManual) preservedManualCount++;
    else reroutedCount++;

    const layoutOwner = findLayoutOwner(source.id, byId);
    const mode = junctionEndpoint
      ? "freeForm"
      : storedLayoutMode(edgeData.layoutMode) ?? layoutOwner.mode ?? "freeForm";
    const route = routeForMode(mode, source, target);
    const matrixRootId = typeof sourceData.matrixRootId === "string"
      ? sourceData.matrixRootId
      : typeof targetData.matrixRootId === "string"
        ? targetData.matrixRootId
        : mode === "matrix" ? layoutOwner.id : null;
    const matrixScope = matrixRootId ? matrixScopes.get(matrixRootId) : undefined;
    const hiddenInMatrix = mode === "matrix"
      && !!matrixScope
      && isMatrixHierarchyEdge(edge, hierarchy, matrixScope);
    const hiddenInSunburst = mode === "radial";
    const baseHidden = !!edge.hidden
      && edgeData.hiddenInMatrix !== true
      && edgeData.hiddenInSunburst !== true;
    const nextData: Record<string, unknown> = {
      ...edgeData,
      edgeType: "branch",
      curveStyle: usesSmartStep(source, target, mode, edgeData.curveStyle)
        ? "step"
        : edgeData.curveStyle ?? route.curveStyle,
      hiddenInMatrix,
      hiddenInMatrixFor: hiddenInMatrix ? matrixRootId : undefined,
      hiddenInSunburst,
      hiddenInSunburstFor: hiddenInSunburst ? edge.source : undefined,
      layoutMode: mode,
    };

    if (resetManual) {
      delete nextData.waypoints;
      delete nextData.waypointOrigin;
      if (junctionEndpoint) nextData.preserveHandles = true;
      else delete nextData.preserveHandles;
    }

    const nextEdge: Edge = {
      ...edge,
      hidden: baseHidden || hiddenInMatrix || hiddenInSunburst,
      sourceHandle: preserveManual ? edge.sourceHandle ?? route.sourceHandle : route.sourceHandle,
      targetHandle: preserveManual ? edge.targetHandle ?? route.targetHandle : route.targetHandle,
      markerEnd: edge.markerEnd ?? (edgeData.arrowEnd === false
        ? undefined
        : { type: MarkerType.ArrowClosed, color: "#6366f1" }),
      data: nextData,
    };
    if (sameEdge(edge, nextEdge)) return edge;
    changedCount++;
    return nextEdge;
  });

  return {
    edges: nextEdges,
    reroutedCount,
    preservedManualCount,
    unresolvedCount,
    changedCount,
  };
}
