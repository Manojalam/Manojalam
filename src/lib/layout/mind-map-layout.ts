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

function storedSide(node: Node): MindMapSide | null {
  const side = ((node.data ?? {}) as Record<string, unknown>).mindMapSide;
  return side === "left" || side === "right" ? side : null;
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
