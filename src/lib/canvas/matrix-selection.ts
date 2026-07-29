import type { Node } from "@xyflow/react";
import type { Hierarchy } from "../layout/hierarchy";

export interface SameLevelMatrixSelection {
  rootId: string;
  depth: number;
  parentIds: string[];
}

export interface DescendantSelectionLevel {
  level: number;
  nodeIds: string[];
}

/**
 * Group a node's descendants by their distance below that node.
 *
 * Level 1 contains direct children, level 2 contains grandchildren, and so
 * on. Breadth-first traversal preserves the hierarchy's authored sibling
 * order and creates only the levels that actually exist in the subtree.
 */
export function descendantSelectionLevels(
  rootId: string,
  hierarchy: Hierarchy
): DescendantSelectionLevel[] {
  const root = hierarchy.get(rootId);
  if (!root) return [];

  const levels: DescendantSelectionLevel[] = [];
  const visited = new Set([rootId]);
  let nodeIds = root.childIds.filter((nodeId) => !visited.has(nodeId));
  let level = 1;

  while (nodeIds.length) {
    nodeIds.forEach((nodeId) => visited.add(nodeId));
    levels.push({ level, nodeIds });
    nodeIds = nodeIds.flatMap((nodeId) =>
      (hierarchy.get(nodeId)?.childIds ?? []).filter((childId) => !visited.has(childId))
    );
    level += 1;
  }

  return levels;
}

function matrixRootIdForNode(
  node: Node,
  nodesById: ReadonlyMap<string, Node>,
  hierarchy: Hierarchy
): string | null {
  const data = (node.data ?? {}) as Record<string, unknown>;
  if (data.layoutMode === "matrix") return node.id;
  if (typeof data.matrixRootId === "string") {
    const rootCandidate = nodesById.get(data.matrixRootId);
    if (((rootCandidate?.data ?? {}) as Record<string, unknown>).layoutMode === "matrix") {
      return data.matrixRootId;
    }
  }

  let currentId: string | null = hierarchy.get(node.id)?.parentId ?? null;
  const visited = new Set<string>();
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const candidate = nodesById.get(currentId);
    if (((candidate?.data ?? {}) as Record<string, unknown>).layoutMode === "matrix") {
      return currentId;
    }
    currentId = hierarchy.get(currentId)?.parentId ?? null;
  }
  return null;
}

/**
 * Return the Matrix level represented by a multi-selection.
 *
 * Matrix sibling flow is stored on each selected cell's parent. Requiring one
 * Matrix root and one hierarchy depth keeps batch Row / Column edits scoped to
 * a coherent visual level, while still supporting cousin groups.
 */
export function sameLevelMatrixSelection(
  selectedNodes: readonly Node[],
  allNodes: readonly Node[],
  hierarchy: Hierarchy
): SameLevelMatrixSelection | null {
  if (selectedNodes.length < 2) return null;

  const nodesById = new Map(allNodes.map((node) => [node.id, node]));
  const firstHierarchyNode = hierarchy.get(selectedNodes[0].id);
  if (!firstHierarchyNode?.parentId) return null;

  const rootId = matrixRootIdForNode(selectedNodes[0], nodesById, hierarchy);
  if (!rootId) return null;

  const parentIds: string[] = [];
  const seenParents = new Set<string>();
  for (const node of selectedNodes) {
    const data = (node.data ?? {}) as Record<string, unknown>;
    if (data.matrixCell !== true && data.layoutMode !== "matrix") return null;

    const hierarchyNode = hierarchy.get(node.id);
    if (
      !hierarchyNode?.parentId
      || hierarchyNode.depth !== firstHierarchyNode.depth
      || matrixRootIdForNode(node, nodesById, hierarchy) !== rootId
    ) {
      return null;
    }

    if (!seenParents.has(hierarchyNode.parentId)) {
      seenParents.add(hierarchyNode.parentId);
      parentIds.push(hierarchyNode.parentId);
    }
  }

  return {
    rootId,
    depth: firstHierarchyNode.depth,
    parentIds,
  };
}
