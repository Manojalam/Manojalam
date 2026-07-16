import type { Edge, Node } from "@xyflow/react";
import type { LayoutMode, VidyaEdgeData } from "../types";
import {
  resolveInsertedNodeCollisions,
  routeForMode,
} from "../layout";
import { buildHierarchy, getSubtree, type Hierarchy } from "../layout/hierarchy";

const FLOWCHART_STRUCTURED_MODES = new Set<LayoutMode>(["list", "matrix", "radial"]);
const LEGACY_IMPLICIT_FLOWCHART_MODES = new Set<LayoutMode>(["horizontal", "vertical", "topDown"]);

/** Flowchart shape additions are local unless a specialized layout owns them. */
export function usesManualFlowchartPlacement(parent: Node, mode?: LayoutMode): boolean {
  return parent.type === "shape" && (!mode || !FLOWCHART_STRUCTURED_MODES.has(mode));
}

/**
 * Converts an automatically arranged shape branch into a manual flowchart
 * without moving or restyling anything. Its real edges become individually
 * rendered and keep using their existing perimeter handles.
 */
export function manualizeFlowchartBranch(
  nodes: Node[],
  edges: Edge[],
  rootId: string,
  hierarchy: Hierarchy
): { nodes: Node[]; edges: Edge[] } {
  const scope = new Set(getSubtree(rootId, hierarchy));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return {
    nodes: nodes.map((node) => node.id === rootId
      ? {
          ...node,
          data: { ...(node.data ?? {}), layoutMode: "freeForm" as LayoutMode },
        }
      : node),
    edges: edges.map((edge) => {
      if (!scope.has(edge.source) || !scope.has(edge.target)) return edge;
      const source = byId.get(edge.source);
      const target = byId.get(edge.target);
      const route = source && target ? routeForMode("freeForm", source, target) : null;
      const data = (edge.data ?? {}) as VidyaEdgeData;
      return {
        ...edge,
        sourceHandle: edge.sourceHandle ?? route?.sourceHandle,
        targetHandle: edge.targetHandle ?? route?.targetHandle,
        data: {
          ...data,
          layoutMode: "freeForm" as LayoutMode,
          curveStyle: data.curveStyle ?? "step",
          manualRoute: true,
        },
      };
    }),
  };
}

/** Resolve overlap by moving only newly inserted flowchart nodes. */
export function placeFlowchartInsertions(nodes: Node[], insertedIds: string[]): Node[] {
  let placed = nodes;
  for (const insertedId of insertedIds) {
    const placements = resolveInsertedNodeCollisions(placed, insertedId);
    if (!Object.keys(placements).length) continue;
    placed = placed.map((node) => placements[node.id]
      ? { ...node, position: placements[node.id] }
      : node);
  }
  return placed;
}

/**
 * Old `+` actions wrote Horizontal edge metadata without assigning an actual
 * layout owner. Repair only those implicit shape edges so existing boards load
 * with attached individual connectors; explicitly applied layouts stay intact.
 */
export function normalizeImplicitFlowchartRoutes(nodes: Node[], edges: Edge[]): Edge[] {
  const hierarchy = buildHierarchy(nodes, edges);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  let changed = false;
  const normalized = edges.map((edge) => {
    const data = (edge.data ?? {}) as VidyaEdgeData;
    const mode = data.layoutMode;
    if (!mode || !LEGACY_IMPLICIT_FLOWCHART_MODES.has(mode) || data.manualRoute === true) return edge;
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (source?.type !== "shape" || target?.type !== "shape") return edge;
    if (hierarchy.get(edge.target)?.parentId !== edge.source) return edge;

    let cursor: string | null = edge.source;
    const seen = new Set<string>();
    let hasLayoutOwner = false;
    while (cursor && !seen.has(cursor)) {
      seen.add(cursor);
      const nodeMode = (byId.get(cursor)?.data as { layoutMode?: LayoutMode } | undefined)?.layoutMode;
      if (nodeMode === mode) {
        hasLayoutOwner = true;
        break;
      }
      cursor = hierarchy.get(cursor)?.parentId ?? null;
    }
    if (hasLayoutOwner) return edge;

    changed = true;
    return {
      ...edge,
      data: {
        ...data,
        layoutMode: "freeForm" as LayoutMode,
        curveStyle: data.curveStyle ?? "step",
        manualRoute: true,
      },
    };
  });
  return changed ? normalized : edges;
}
