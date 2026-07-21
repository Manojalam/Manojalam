import type { Edge, Node } from "@xyflow/react";
import { buildHierarchy, getSubtree } from "../layout/hierarchy";

export interface HierarchyMutationResult {
  nodes: Node[];
  edges: Edge[];
  changed: boolean;
  affectedParentIds: string[];
  changedEdgeIds: string[];
}

type EdgeFactory = (source: string, target: string) => Edge;

function dataOf(node: Node): Record<string, unknown> {
  return (node.data ?? {}) as Record<string, unknown>;
}

/** Move a hierarchy branch to a new parent while preserving its descendants. */
export function reparentHierarchy(
  nodes: Node[],
  edges: Edge[],
  nodeId: string,
  newParentId: string,
  createEdge: EdgeFactory
): HierarchyMutationResult {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  if (!byId.has(nodeId) || !byId.has(newParentId) || nodeId === newParentId) {
    return { nodes, edges, changed: false, affectedParentIds: [], changedEdgeIds: [] };
  }

  const hierarchy = buildHierarchy(nodes, edges);
  const oldParentId = hierarchy.get(nodeId)?.parentId ?? null;
  if (oldParentId === newParentId || getSubtree(nodeId, hierarchy).includes(newParentId)) {
    return { nodes, edges, changed: false, affectedParentIds: [], changedEdgeIds: [] };
  }

  const oldOrder = oldParentId ? hierarchy.get(oldParentId)?.childIds ?? [] : [];
  const newOrder = hierarchy.get(newParentId)?.childIds ?? [];
  const nextNodes = nodes.map((node) => {
    const data = dataOf(node);
    if (node.id === nodeId) {
      return { ...node, data: { ...data, parentId: newParentId } };
    }
    if (node.id === oldParentId) {
      return { ...node, data: { ...data, childOrder: oldOrder.filter((id) => id !== nodeId) } };
    }
    if (node.id === newParentId) {
      return {
        ...node,
        data: {
          ...data,
          childOrder: [...newOrder.filter((id) => id !== nodeId), nodeId],
        },
      };
    }
    return node;
  });

  const oldStructuralEdges = edges.filter((edge) => edge.target === nodeId && edge.source === oldParentId);
  const existingNewEdge = edges.find((edge) => edge.source === newParentId && edge.target === nodeId);
  const transferableEdge = oldStructuralEdges[0];
  const changedEdgeIds: string[] = [];
  let addedEdge: Edge | null = null;

  const nextEdges = edges.flatMap((edge) => {
    if (oldStructuralEdges.some((candidate) => candidate.id === edge.id)) {
      if (existingNewEdge || edge.id !== transferableEdge?.id) return [];
      changedEdgeIds.push(edge.id);
      return [{ ...edge, source: newParentId, target: nodeId }];
    }
    return [edge];
  });
  if (!existingNewEdge && !transferableEdge) {
    addedEdge = createEdge(newParentId, nodeId);
    nextEdges.push(addedEdge);
    changedEdgeIds.push(addedEdge.id);
  } else if (existingNewEdge) {
    changedEdgeIds.push(existingNewEdge.id);
  }

  return {
    nodes: nextNodes,
    edges: nextEdges,
    changed: true,
    affectedParentIds: [oldParentId, newParentId].filter((id): id is string => !!id),
    changedEdgeIds,
  };
}

/** Delete nodes while promoting each surviving child to its nearest surviving ancestor. */
export function deleteNodesPreservingHierarchy(
  nodes: Node[],
  edges: Edge[],
  deletedNodeIds: ReadonlySet<string>,
  createEdge: EdgeFactory
): HierarchyMutationResult {
  if (!deletedNodeIds.size) {
    return { nodes, edges, changed: false, affectedParentIds: [], changedEdgeIds: [] };
  }

  const hierarchy = buildHierarchy(nodes, edges);
  const survivingIds = new Set(nodes.filter((node) => !deletedNodeIds.has(node.id)).map((node) => node.id));
  const promotedParent = new Map<string, string | null>();
  const affectedParentIds = new Set<string>();

  for (const nodeId of survivingIds) {
    const originalParent = hierarchy.get(nodeId)?.parentId ?? null;
    if (!originalParent || !deletedNodeIds.has(originalParent)) continue;
    let parentId: string | null = originalParent;
    const visited = new Set<string>();
    while (parentId && deletedNodeIds.has(parentId) && !visited.has(parentId)) {
      visited.add(parentId);
      parentId = hierarchy.get(parentId)?.parentId ?? null;
    }
    const nextParent = parentId && survivingIds.has(parentId) ? parentId : null;
    promotedParent.set(nodeId, nextParent);
    if (nextParent) affectedParentIds.add(nextParent);
  }

  const projectedChildren = new Map<string, string[]>();
  const expand = (nodeId: string, ancestors: Set<string>): string[] => {
    if (ancestors.has(nodeId)) return [];
    if (!deletedNodeIds.has(nodeId)) return survivingIds.has(nodeId) ? [nodeId] : [];
    const nextAncestors = new Set(ancestors).add(nodeId);
    return (hierarchy.get(nodeId)?.childIds ?? []).flatMap((childId) => expand(childId, nextAncestors));
  };
  for (const parentId of survivingIds) {
    projectedChildren.set(
      parentId,
      (hierarchy.get(parentId)?.childIds ?? []).flatMap((childId) => expand(childId, new Set([parentId])))
    );
  }

  const nextNodes = nodes
    .filter((node) => survivingIds.has(node.id))
    .map((node) => {
      const data = dataOf(node);
      const nextParent = promotedParent.get(node.id);
      const childOrder = projectedChildren.get(node.id) ?? [];
      if (nextParent === undefined && JSON.stringify(data.childOrder ?? []) === JSON.stringify(childOrder)) return node;
      return {
        ...node,
        data: {
          ...data,
          ...(nextParent !== undefined ? { parentId: nextParent } : {}),
          childOrder,
        },
      };
    });

  const changedEdgeIds: string[] = [];
  const usedPromotionTargets = new Set<string>();
  const nextEdges: Edge[] = [];
  for (const edge of edges) {
    const promotedTo = promotedParent.get(edge.target);
    const wasStructuralIncoming = promotedTo !== undefined
      && edge.source === hierarchy.get(edge.target)?.parentId;
    if (wasStructuralIncoming && promotedTo && !usedPromotionTargets.has(edge.target)) {
      const duplicate = edges.some((candidate) => (
        candidate.id !== edge.id
        && candidate.source === promotedTo
        && candidate.target === edge.target
        && !deletedNodeIds.has(candidate.source)
      ));
      if (!duplicate) {
        nextEdges.push({ ...edge, source: promotedTo });
        changedEdgeIds.push(edge.id);
      }
      usedPromotionTargets.add(edge.target);
      continue;
    }
    if (deletedNodeIds.has(edge.source) || deletedNodeIds.has(edge.target)) continue;
    nextEdges.push(edge);
  }

  for (const [nodeId, parentId] of promotedParent) {
    if (!parentId) continue;
    if (nextEdges.some((edge) => edge.source === parentId && edge.target === nodeId)) continue;
    const edge = createEdge(parentId, nodeId);
    nextEdges.push(edge);
    changedEdgeIds.push(edge.id);
  }

  return {
    nodes: nextNodes,
    edges: nextEdges,
    changed: true,
    affectedParentIds: [...affectedParentIds],
    changedEdgeIds,
  };
}
