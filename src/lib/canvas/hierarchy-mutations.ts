import type { Edge, Node } from "@xyflow/react";
import { buildHierarchy, getSubtree } from "../layout/hierarchy";
import { routeForMode } from "../layout";
import type { LayoutMode, VidyaEdgeData } from "../types";
import { includeAttachedExternalNoteIds } from "./node-note";
import {
  connectorEndpointAnchor,
  rebindConnectorAnchorHandles,
} from "./connector-anchors";

export interface HierarchyMutationResult {
  nodes: Node[];
  edges: Edge[];
  changed: boolean;
  affectedParentIds: string[];
  changedEdgeIds: string[];
}

type EdgeFactory = (source: string, target: string) => Edge;

/** A connector handle move on the same shapes must not rewrite tree metadata. */
export function reconnectChangesEndpointNodes(
  edge: Pick<Edge, "source" | "target">,
  connection: Pick<Edge, "source" | "target">
): boolean {
  return edge.source !== connection.source || edge.target !== connection.target;
}

/** Recalculate automatic hierarchy-edge handles from settled layout geometry. */
export function rerouteStructuredHierarchyEdges(
  nodes: Node[],
  edges: Edge[],
  rootId: string,
  mode: LayoutMode
): Edge[] {
  const hierarchy = buildHierarchy(nodes, edges);
  const scopeIds = new Set(getSubtree(rootId, hierarchy));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  let changed = false;
  const nextEdges = edges.map((edge) => {
    if (
      !scopeIds.has(edge.source)
      || !scopeIds.has(edge.target)
      || hierarchy.get(edge.target)?.parentId !== edge.source
    ) return edge;

    const data = (edge.data ?? {}) as VidyaEdgeData;
    const sourceAnchor = connectorEndpointAnchor(edge, "source");
    const targetAnchor = connectorEndpointAnchor(edge, "target");
    if (data.preserveHandles === true && !sourceAnchor && !targetAnchor) return edge;

    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source || !target) return edge;
    const route = routeForMode(mode, source, target);
    const sourceHandle = sourceAnchor ? edge.sourceHandle : route.sourceHandle;
    const targetHandle = targetAnchor ? edge.targetHandle : route.targetHandle;
    if (
      sourceHandle === edge.sourceHandle
      && targetHandle === edge.targetHandle
      && data.curveStyle === route.curveStyle
      && data.layoutMode === mode
    ) return edge;

    changed = true;
    return rebindConnectorAnchorHandles({
      ...edge,
      sourceHandle,
      targetHandle,
      data: {
        ...data,
        curveStyle: route.curveStyle,
        layoutMode: mode,
      },
    });
  });
  return changed ? nextEdges : edges;
}

function dataOf(node: Node): Record<string, unknown> {
  return (node.data ?? {}) as Record<string, unknown>;
}

export function unselectedHierarchyDescendants(
  nodes: Node[],
  edges: Edge[],
  selectedNodeIds: ReadonlySet<string>
): string[] {
  const hierarchy = buildHierarchy(nodes, edges);
  return [...new Set([...selectedNodeIds].flatMap((nodeId) =>
    getSubtree(nodeId, hierarchy).filter((descendantId) => !selectedNodeIds.has(descendantId))
  ))];
}

export function hierarchyDeletionNodeIds(
  nodes: Node[],
  edges: Edge[],
  selectedNodeIds: ReadonlySet<string>,
  includeDescendants: boolean
): Set<string> {
  const hierarchyNodeIds = includeDescendants ? new Set([
    ...selectedNodeIds,
    ...unselectedHierarchyDescendants(nodes, edges, selectedNodeIds),
  ]) : new Set(selectedNodeIds);
  return new Set(includeAttachedExternalNoteIds(nodes, [...hierarchyNodeIds]));
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
