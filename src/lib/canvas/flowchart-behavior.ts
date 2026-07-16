import type { Edge, Node } from "@xyflow/react";
import type { LayoutMode, VidyaEdgeData } from "../types";
import {
  getNodeDimensions,
  getNodeRect,
  nodePositionFromTopLeft,
  resolveInsertedNodeCollisions,
  routeForMode,
} from "../layout";
import { buildHierarchy, getSubtree, type Hierarchy } from "../layout/hierarchy";

const FLOWCHART_STRUCTURED_MODES = new Set<LayoutMode>(["list", "matrix", "radial"]);
const LEGACY_IMPLICIT_FLOWCHART_MODES = new Set<LayoutMode>(["horizontal", "vertical", "topDown"]);
const FLOWCHART_CHILD_GAP_X = 104;
const FLOWCHART_CHILD_GAP_Y = 64;
const FLOWCHART_SIBLING_GAP_X = 64;
const FLOWCHART_SIBLING_GAP_Y = 40;

type Vector = { x: number; y: number };
type PerimeterSide = "top" | "right" | "bottom" | "left";

type ConnectorConnection = {
  source?: string | null;
  target?: string | null;
};

/**
 * Reject duplicate connectors while allowing one selected connector to move
 * between handles on its existing pair of nodes.
 */
export function isConnectorConnectionAllowed(
  edges: Edge[],
  connection: ConnectorConnection,
  reconnectingEdgeId?: string | null
): boolean {
  if (!connection.source || !connection.target || connection.source === connection.target) return false;
  return !edges.some((edge) => (
    edge.id !== reconnectingEdgeId
    && edge.source === connection.source
    && edge.target === connection.target
  ));
}

function centerVector(from: Node, to: Node): Vector {
  const fromRect = getNodeRect(from);
  const toRect = getNodeRect(to);
  return {
    x: toRect.centerX - fromRect.centerX,
    y: toRect.centerY - fromRect.centerY,
  };
}

function positionFromCenter(node: Node, center: Vector): Vector {
  const size = getNodeDimensions(node);
  return nodePositionFromTopLeft(
    node,
    { x: center.x - size.width / 2, y: center.y - size.height / 2 },
    size
  );
}

function continuationPosition(parent: Node, child: Node, rawDirection: Vector): Vector {
  const parentRect = getNodeRect(parent);
  const childSize = getNodeDimensions(child);
  const direction = Math.abs(rawDirection.x) + Math.abs(rawDirection.y) >= 1
    ? rawDirection
    : { x: 1, y: 0 };
  const horizontal = Math.abs(direction.x) >= Math.abs(direction.y);
  const mainDistance = horizontal
    ? (parentRect.width + childSize.width) / 2 + FLOWCHART_CHILD_GAP_X
    : (parentRect.height + childSize.height) / 2 + FLOWCHART_CHILD_GAP_Y;
  return positionFromCenter(child, {
    x: parentRect.centerX + (horizontal ? Math.sign(direction.x || 1) * mainDistance : 0),
    y: parentRect.centerY + (horizontal ? 0 : Math.sign(direction.y || 1) * mainDistance),
  });
}

function directionThroughTargetHandle(targetHandle?: string | null): Vector | null {
  const directions: Record<PerimeterSide, Vector> = {
    top: { x: 0, y: 1 },
    right: { x: -1, y: 0 },
    bottom: { x: 0, y: -1 },
    left: { x: 1, y: 0 },
  };
  return targetHandle && targetHandle in directions
    ? directions[targetHandle as PerimeterSide]
    : null;
}

function liveIncomingDirection(nodes: Node[], edges: Edge[], parent: Node): Vector | null {
  const incoming = edges.filter((edge) => (
    !edge.hidden
    && edge.target === parent.id
    && edge.source !== parent.id
  ));
  if (!incoming.length) return null;

  const storedParentId = (parent.data as { parentId?: unknown } | undefined)?.parentId;
  const edge = typeof storedParentId === "string"
    ? incoming.find((candidate) => candidate.source === storedParentId) ?? incoming[0]
    : incoming[0];
  const handleDirection = directionThroughTargetHandle(edge.targetHandle);
  if (handleDirection) return handleDirection;

  const source = nodes.find((node) => node.id === edge.source);
  return source ? centerVector(source, parent) : null;
}

function priorSiblings(nodes: Node[], edges: Edge[], parent: Node, insertedId: string): Node[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  // Reversing a connector deliberately does not rewrite the user's hierarchy
  // metadata. Do not let the former child continue to influence placement as a
  // sibling when its live connector now flows back into this parent.
  const reversedChildIds = new Set(edges
    .filter((edge) => !edge.hidden && edge.target === parent.id)
    .map((edge) => edge.source));
  const storedOrder = (parent.data as { childOrder?: unknown } | undefined)?.childOrder;
  const orderedIds = Array.isArray(storedOrder)
    ? storedOrder.filter((value): value is string => (
        typeof value === "string" && !reversedChildIds.has(value)
      ))
    : nodes
        .filter((node) => (
          (node.data as { parentId?: unknown } | undefined)?.parentId === parent.id
          && !reversedChildIds.has(node.id)
        ))
        .map((node) => node.id);
  const insertionIndex = orderedIds.indexOf(insertedId);
  const precedingIds = insertionIndex >= 0
    ? orderedIds.slice(0, insertionIndex)
    : orderedIds.filter((id) => id !== insertedId);
  return precedingIds
    .map((id) => byId.get(id))
    .filter((node): node is Node => Boolean(node));
}

function siblingPosition(parent: Node, child: Node, siblings: Node[]): Vector | null {
  const previous = siblings[siblings.length - 1];
  if (!previous) return null;

  const previousRect = getNodeRect(previous);
  const childSize = getNodeDimensions(child);
  const branchDirection = centerVector(parent, previous);
  const horizontalBranch = Math.abs(branchDirection.x) >= Math.abs(branchDirection.y);
  const beforePrevious = siblings[siblings.length - 2];
  if (beforePrevious) {
    const siblingStep = centerVector(beforePrevious, previous);
    const followsSiblingAxis = horizontalBranch
      ? Math.abs(siblingStep.y) >= Math.abs(siblingStep.x)
      : Math.abs(siblingStep.x) >= Math.abs(siblingStep.y);
    if (followsSiblingAxis && Math.abs(siblingStep.x) + Math.abs(siblingStep.y) > 1) {
      return positionFromCenter(child, {
        x: previousRect.centerX + siblingStep.x,
        y: previousRect.centerY + siblingStep.y,
      });
    }
  }

  if (horizontalBranch) {
    return positionFromCenter(child, {
      x: previousRect.centerX,
      y: previousRect.bottom + FLOWCHART_SIBLING_GAP_Y + childSize.height / 2,
    });
  }
  return positionFromCenter(child, {
    x: previousRect.right + FLOWCHART_SIBLING_GAP_X + childSize.width / 2,
    y: previousRect.centerY,
  });
}

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

/**
 * Continue the branch's live direction and resolve overlap by moving only new
 * nodes. A first child follows its parent's incoming direction. Later children
 * stay on the side established by the most recently positioned sibling.
 */
export function placeFlowchartInsertions(
  nodes: Node[],
  edges: Edge[],
  insertedIds: string[]
): Node[] {
  let placed = nodes;
  const inserted = new Set(insertedIds);
  const completed = new Set<string>();
  for (const insertedId of insertedIds) {
    const child = placed.find((node) => node.id === insertedId);
    const parentId = (child?.data as { parentId?: unknown } | undefined)?.parentId;
    const parent = typeof parentId === "string"
      ? placed.find((node) => node.id === parentId)
      : undefined;
    if (!child || !parent) continue;

    const siblings = priorSiblings(placed, edges, parent, insertedId);
    const siblingPlacement = siblingPosition(parent, child, siblings);
    const parentParentId = (parent.data as { parentId?: unknown } | undefined)?.parentId;
    const parentParent = typeof parentParentId === "string"
      ? placed.find((node) => node.id === parentParentId)
      : undefined;
    const direction = liveIncomingDirection(placed, edges, parent)
      ?? (parentParent
        ? centerVector(parentParent, parent)
        : centerVector(parent, child));
    const position = siblingPlacement ?? continuationPosition(parent, child, direction);
    placed = placed.map((node) => node.id === insertedId ? { ...node, position } : node);

    const collisionScope = placed.filter((node) =>
      node.id === insertedId || !inserted.has(node.id) || completed.has(node.id)
    );
    const placements = resolveInsertedNodeCollisions(collisionScope, insertedId);
    completed.add(insertedId);
    if (!Object.keys(placements).length) continue;
    placed = placed.map((node) => placements[node.id]
      ? { ...node, position: placements[node.id] }
      : node);
  }
  return placed;
}

/** Reattach new connectors to the nearest sides after directional placement. */
export function rerouteFlowchartInsertionEdges(
  nodes: Node[],
  edges: Edge[],
  insertedIds: string[]
): Edge[] {
  const inserted = new Set(insertedIds);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  let changed = false;
  const routed = edges.map((edge) => {
    if (!inserted.has(edge.target)) return edge;
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source || !target) return edge;
    const route = routeForMode("freeForm", source, target);
    if (edge.sourceHandle === route.sourceHandle && edge.targetHandle === route.targetHandle) {
      return edge;
    }
    changed = true;
    return {
      ...edge,
      sourceHandle: route.sourceHandle,
      targetHandle: route.targetHandle,
    };
  });
  return changed ? routed : edges;
}

/**
 * Recalculate saved automatic flowchart ports from current node geometry.
 * Explicit endpoint reconnections set preserveHandles and are intentionally
 * excluded, so only handles still owned by the automatic router are refreshed.
 */
export function refreshAutomaticFlowchartHandles(nodes: Node[], edges: Edge[]): Edge[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  let changed = false;
  const refreshed = edges.map((edge) => {
    const data = (edge.data ?? {}) as VidyaEdgeData;
    if (data.manualRoute !== true || data.preserveHandles === true) return edge;
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (source?.type !== "shape" || target?.type !== "shape") return edge;
    const route = routeForMode("freeForm", source, target);
    if (edge.sourceHandle === route.sourceHandle && edge.targetHandle === route.targetHandle) {
      return edge;
    }
    changed = true;
    return {
      ...edge,
      sourceHandle: route.sourceHandle,
      targetHandle: route.targetHandle,
    };
  });
  return changed ? refreshed : edges;
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
