import type { Node } from "@xyflow/react";
import type { Hierarchy } from "./hierarchy";
import { getSubtree } from "./hierarchy";
import {
  getNodeDimensions,
  getNodeRect,
  nodePositionFromTopLeft,
} from "./geometry";
import {
  computeOrthogonalTreeLayout,
  type TreePlacements,
} from "./tree-layout";

export type MindMapSide = "left" | "right";

export interface PersistMindMapRootSidesOptions {
  placements?: TreePlacements;
  balanceUnassigned?: ReadonlySet<string>;
}

function storedSide(node: Node): MindMapSide | null {
  const side = ((node.data ?? {}) as Record<string, unknown>).mindMapSide;
  return side === "left" || side === "right" ? side : null;
}

/**
 * Persist the visual side of every direct Mind Map branch. Older boards and
 * branches created after the initial conversion may not have `mindMapSide`.
 * Capturing it before an ordinary reflow prevents an unrelated hierarchy edit
 * from balancing established branches onto the opposite side.
 */
export function persistMindMapRootSides(
  nodes: Node[],
  rootId: string,
  hierarchy: Hierarchy,
  options: PersistMindMapRootSidesOptions = {}
): Node[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const root = byId.get(rootId);
  if (!root) return nodes;

  const placedNode = (node: Node): Node => {
    const placement = options.placements?.[node.id];
    return placement ? { ...node, position: placement } : node;
  };
  const rootCenterX = getNodeRect(placedNode(root)).centerX;
  const assignments = new Map<string, MindMapSide>();
  const counts: Record<MindMapSide, number> = { left: 0, right: 0 };
  const childIds = hierarchy.get(rootId)?.childIds ?? [];

  for (const childId of childIds) {
    const child = byId.get(childId);
    if (!child) continue;
    const explicit = storedSide(child);
    if (!explicit) continue;
    assignments.set(childId, explicit);
    counts[explicit] += 1;
  }

  for (const childId of childIds) {
    if (assignments.has(childId)) continue;
    const child = byId.get(childId);
    if (!child) continue;
    const deltaX = getNodeRect(placedNode(child)).centerX - rootCenterX;
    const geometric: MindMapSide = deltaX < 0 ? "left" : "right";
    const opposite: MindMapSide = geometric === "left" ? "right" : "left";
    const balance = options.balanceUnassigned?.has(childId) || Math.abs(deltaX) < 0.75;
    const side = balance && counts[geometric] > counts[opposite] ? opposite : geometric;
    assignments.set(childId, side);
    counts[side] += 1;
  }

  let changed = false;
  const nextNodes = nodes.map((node) => {
    const side = assignments.get(node.id);
    if (!side || storedSide(node) === side) return node;
    changed = true;
    return { ...node, data: { ...(node.data ?? {}), mindMapSide: side } };
  });
  return changed ? nextNodes : nodes;
}

function sideHierarchy(
  rootId: string,
  childIds: string[],
  hierarchy: Hierarchy
): Hierarchy {
  const included = new Set<string>([rootId]);
  childIds.forEach((childId) => {
    getSubtree(childId, hierarchy).forEach((nodeId) => included.add(nodeId));
  });

  const scoped: Hierarchy = new Map();
  for (const nodeId of included) {
    const item = hierarchy.get(nodeId);
    if (!item) continue;
    scoped.set(nodeId, {
      ...item,
      parentId: nodeId === rootId ? null : item.parentId,
      childIds: nodeId === rootId
        ? childIds
        : item.childIds.filter((childId) => included.has(childId)),
    });
  }
  return scoped;
}

function partitionRootChildren(
  rootId: string,
  hierarchy: Hierarchy,
  byId: Map<string, Node>
): Record<MindMapSide, string[]> {
  const root = byId.get(rootId);
  const result: Record<MindMapSide, string[]> = { left: [], right: [] };
  if (!root) return result;

  const rootCenterX = getNodeRect(root).centerX;
  for (const childId of hierarchy.get(rootId)?.childIds ?? []) {
    const child = byId.get(childId);
    if (!child) continue;
    const explicit = storedSide(child);
    if (explicit) {
      result[explicit].push(childId);
      continue;
    }

    const geometric: MindMapSide = getNodeRect(child).centerX < rootCenterX ? "left" : "right";
    const opposite: MindMapSide = geometric === "left" ? "right" : "left";
    const side = result[geometric].length <= result[opposite].length ? geometric : opposite;
    result[side].push(childId);
  }
  return result;
}

function mirrorLeftPlacements(
  placements: TreePlacements,
  rootId: string,
  rootCenterX: number,
  byId: Map<string, Node>
): TreePlacements {
  const mirrored: TreePlacements = {};
  for (const [nodeId, position] of Object.entries(placements)) {
    if (nodeId === rootId) continue;
    const node = byId.get(nodeId);
    if (!node) continue;
    const size = getNodeDimensions(node);
    const placedRect = getNodeRect({ ...node, position });
    mirrored[nodeId] = nodePositionFromTopLeft(
      node,
      {
        x: rootCenterX * 2 - placedRect.right,
        y: placedRect.top,
      },
      size
    );
  }
  return mirrored;
}

/**
 * Arrange a conventional two-sided mind map. Main branches share the central
 * root, while each branch and all of its descendants grow outward horizontally.
 */
export function computeMindMapLayout(
  rootId: string,
  hierarchy: Hierarchy,
  byId: Map<string, Node>
): TreePlacements {
  const root = byId.get(rootId);
  if (!root) return {};
  const sides = partitionRootChildren(rootId, hierarchy, byId);
  const placements: TreePlacements = { [rootId]: root.position };

  if (sides.right.length) {
    Object.assign(
      placements,
      computeOrthogonalTreeLayout(
        rootId,
        sideHierarchy(rootId, sides.right, hierarchy),
        byId,
        "horizontal"
      )
    );
  }
  if (sides.left.length) {
    const left = computeOrthogonalTreeLayout(
      rootId,
      sideHierarchy(rootId, sides.left, hierarchy),
      byId,
      "horizontal"
    );
    Object.assign(
      placements,
      mirrorLeftPlacements(left, rootId, getNodeRect(root).centerX, byId)
    );
  }

  return placements;
}
