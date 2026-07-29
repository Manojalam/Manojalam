import type { Edge, Node } from "@xyflow/react";
import type {
  BoardContent,
  NodeRelationship,
  RelationshipDiagramSpec,
  RelationshipFanState,
} from "../types";
import { generateId } from "../utils";
import { buildHierarchy, getSubtree, type Hierarchy } from "../layout/hierarchy";
import { sizeOf } from "../layout";
import { singleRelationshipItemId } from "../relationship-diagram-items";
import {
  prepareDuplicatedNodeData,
  selectionWithHierarchyDescendants,
} from "./clipboard";
import { translateTextCalloutAnchor } from "./text-callout";

export interface CrossBoardDiagramPayload {
  nodes: Node[];
  edges: Edge[];
  relationships: NodeRelationship[];
  relationshipFans: RelationshipFanState[];
}

interface CrossBoardSourceContent {
  nodes: Node[];
  edges: Edge[];
  relationships: NodeRelationship[];
  relationshipFans: RelationshipFanState[];
}

const CHART_NODE_TYPES = new Set(["relationshipDiagram", "sunburst"]);
const COPY_GAP = 96;

function relationshipGroupKey(sourceNodeId: string, relationType: string): string {
  return `${sourceNodeId}\u0000${relationType.trim().toLocaleLowerCase()}`;
}

function relationshipDiagramSpec(value: unknown): RelationshipDiagramSpec | null {
  if (!value || typeof value !== "object") return null;
  const spec = value as Partial<RelationshipDiagramSpec>;
  if (
    !spec.scope
    || !Array.isArray(spec.scope.sourceNodeIds)
    || typeof spec.scope.mode !== "string"
  ) return null;
  return structuredClone(spec) as RelationshipDiagramSpec;
}

function expandedDiagramSourceIds(
  spec: RelationshipDiagramSpec,
  hierarchy: Hierarchy,
  availableNodeIds: ReadonlySet<string>
): string[] {
  let sourceNodeIds = spec.scope.sourceNodeIds;
  if (spec.scope.mode === "selected-branch") {
    const roots = spec.scope.branchRootNodeIds?.length
      ? spec.scope.branchRootNodeIds
      : spec.scope.branchRootNodeId
        ? [spec.scope.branchRootNodeId]
        : spec.scope.sourceNodeIds;
    sourceNodeIds = roots.flatMap((rootId) => getSubtree(rootId, hierarchy));
  } else if (spec.scope.mode === "selected-node") {
    sourceNodeIds = spec.scope.sourceNodeIds.slice(0, 1);
  }
  return [...new Set(sourceNodeIds)].filter((id) => availableNodeIds.has(id));
}

function diagramSourceIds(
  node: Node,
  content: Pick<CrossBoardSourceContent, "nodes" | "edges" | "relationships">
): string[] {
  if (node.type !== "relationshipDiagram") return [];
  const data = (node.data ?? {}) as Record<string, unknown>;
  const rawSpec = data.relationshipDiagramSpec;
  const spec = relationshipDiagramSpec(rawSpec);
  if (!spec) return [];
  const hierarchy = buildHierarchy(content.nodes, content.edges);
  return expandedDiagramSourceIds(
    spec,
    hierarchy,
    new Set(content.nodes.map((candidate) => candidate.id))
  );
}

/**
 * Captures a portable diagram selection. Hierarchy selections include their
 * descendants, while generated charts also carry the source nodes and saved
 * relationships they need in order to remain editable on another board.
 */
export function createCrossBoardDiagramPayload(
  content: CrossBoardSourceContent,
  selectedNodeIds: readonly string[]
): CrossBoardDiagramPayload {
  const initial = selectionWithHierarchyDescendants(
    content.nodes,
    content.edges,
    selectedNodeIds
  );
  const includedNodeIds = new Set(initial.nodes.map((node) => node.id));
  const nodesById = new Map(content.nodes.map((node) => [node.id, node]));
  const hierarchy = buildHierarchy(content.nodes, content.edges);

  let changed = true;
  while (changed) {
    changed = false;
    for (const nodeId of [...includedNodeIds]) {
      const node = nodesById.get(nodeId);
      if (!node || !CHART_NODE_TYPES.has(node.type ?? "")) continue;

      if (node.type === "sunburst") {
        const data = (node.data ?? {}) as Record<string, unknown>;
        const rootId = typeof data.rootId === "string"
          ? data.rootId
          : typeof data.sunburstFor === "string"
            ? data.sunburstFor
            : null;
        if (rootId && nodesById.has(rootId)) {
          for (const descendantId of getSubtree(rootId, hierarchy)) {
            if (includedNodeIds.has(descendantId)) continue;
            includedNodeIds.add(descendantId);
            changed = true;
          }
        }
        continue;
      }

      const sourceIds = diagramSourceIds(node, content);
      const sourceIdSet = new Set(sourceIds);
      const data = (node.data ?? {}) as Record<string, unknown>;
      const spec = relationshipDiagramSpec(data.relationshipDiagramSpec);
      if (!spec) continue;
      const chartRootNodeId = spec.scope.chartRootNodeId;
      if (chartRootNodeId && nodesById.has(chartRootNodeId)) {
        sourceIdSet.add(chartRootNodeId);
      }
      for (const sourceId of sourceIdSet) {
        if (!includedNodeIds.has(sourceId)) {
          includedNodeIds.add(sourceId);
          changed = true;
        }
      }
      for (const relationship of content.relationships) {
        if (!sourceIdSet.has(relationship.sourceNodeId)) continue;
        for (const dependencyId of [
          relationship.sourceNodeId,
          relationship.targetNodeId,
        ]) {
          if (!nodesById.has(dependencyId) || includedNodeIds.has(dependencyId)) continue;
          includedNodeIds.add(dependencyId);
          changed = true;
        }
      }
    }
  }

  // Notes attached to any copied object should travel with their owner.
  for (const node of content.nodes) {
    const noteForNodeId = (node.data as Record<string, unknown> | undefined)
      ?.noteForNodeId;
    if (typeof noteForNodeId === "string" && includedNodeIds.has(noteForNodeId)) {
      includedNodeIds.add(node.id);
    }
  }

  const relationships = content.relationships.filter(
    (relationship) => (
      includedNodeIds.has(relationship.sourceNodeId)
      && includedNodeIds.has(relationship.targetNodeId)
    )
  );
  const populatedGroups = new Set(
    relationships.map((relationship) =>
      relationshipGroupKey(relationship.sourceNodeId, relationship.relationType)
    )
  );

  return {
    nodes: structuredClone(
      content.nodes.filter((node) => includedNodeIds.has(node.id))
    ),
    edges: structuredClone(
      content.edges.filter(
        (edge) => includedNodeIds.has(edge.source) && includedNodeIds.has(edge.target)
      )
    ),
    relationships: structuredClone(relationships),
    relationshipFans: structuredClone(
      content.relationshipFans.filter((fan) =>
        populatedGroups.has(relationshipGroupKey(fan.sourceNodeId, fan.relationType))
      )
    ),
  };
}

function allocateId(usedIds: Set<string>): string {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const id = generateId();
    if (usedIds.has(id)) continue;
    usedIds.add(id);
    return id;
  }
  throw new Error("Could not allocate a unique ID for the copied diagram.");
}

function sourceBounds(nodes: readonly Node[]) {
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const node of nodes) {
    const { w, h } = sizeOf(node);
    left = Math.min(left, node.position.x);
    top = Math.min(top, node.position.y);
    right = Math.max(right, node.position.x + w);
    bottom = Math.max(bottom, node.position.y + h);
  }
  return { left, top, right, bottom };
}

function destinationOffset(
  copiedNodes: readonly Node[],
  destinationNodes: readonly Node[]
): { x: number; y: number } {
  if (!copiedNodes.length) return { x: 0, y: 0 };
  const source = sourceBounds(copiedNodes);
  if (!destinationNodes.length) {
    return { x: 80 - source.left, y: 80 - source.top };
  }
  const destination = sourceBounds(destinationNodes);
  return {
    x: destination.right + COPY_GAP - source.left,
    y: destination.top - source.top,
  };
}

function translatedPoints(
  value: unknown,
  offset: { x: number; y: number }
): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((point) => {
    if (
      !point
      || typeof point !== "object"
      || typeof (point as { x?: unknown }).x !== "number"
      || typeof (point as { y?: unknown }).y !== "number"
    ) return point;
    const { x, y } = point as { x: number; y: number };
    return { ...point, x: x + offset.x, y: y + offset.y };
  });
}

function remapDiagramItemId(
  itemId: string,
  nodeIdMap: ReadonlyMap<string, string>
): string {
  const direct = nodeIdMap.get(itemId);
  if (direct) return direct;
  const match = /^relationship:([^:]+):([^:]+)$/.exec(itemId);
  if (!match) return itemId;
  try {
    const sourceNodeId = nodeIdMap.get(decodeURIComponent(match[1]));
    const targetNodeId = nodeIdMap.get(decodeURIComponent(match[2]));
    return sourceNodeId && targetNodeId
      ? singleRelationshipItemId(sourceNodeId, targetNodeId)
      : itemId;
  } catch {
    return itemId;
  }
}

function remapRelationshipDiagramSpec(
  value: unknown,
  nodeIdMap: ReadonlyMap<string, string>
): RelationshipDiagramSpec | undefined {
  const spec = relationshipDiagramSpec(value);
  if (!spec) return undefined;
  const mapIds = (ids: readonly string[] | undefined) =>
    (ids ?? []).flatMap((id) => {
      const mapped = nodeIdMap.get(id);
      return mapped ? [mapped] : [];
    });
  const itemOrder = spec.itemOrder?.map((itemId) =>
    remapDiagramItemId(itemId, nodeIdMap)
  );
  const itemStyles = spec.itemStyles
    ? Object.fromEntries(
        Object.entries(spec.itemStyles).map(([itemId, style]) => [
          remapDiagramItemId(itemId, nodeIdMap),
          style,
        ])
      )
    : undefined;
  const chartRootNodeId = spec.scope.chartRootNodeId
    ? nodeIdMap.get(spec.scope.chartRootNodeId)
    : undefined;

  return {
    ...spec,
    scope: {
      ...spec.scope,
      sourceNodeIds: mapIds(spec.scope.sourceNodeIds),
      ...(spec.scope.branchRootNodeIds
        ? { branchRootNodeIds: mapIds(spec.scope.branchRootNodeIds) }
        : {}),
      ...(spec.scope.branchRootNodeId
        ? { branchRootNodeId: nodeIdMap.get(spec.scope.branchRootNodeId) }
        : {}),
      ...(chartRootNodeId ? { chartRootNodeId } : { chartRootNodeId: undefined }),
    },
    ...(itemOrder ? { itemOrder } : {}),
    ...(itemStyles ? { itemStyles } : {}),
  };
}

function remapNodeData(
  node: Node,
  nodeIdMap: ReadonlyMap<string, string>,
  groupIdMap: ReadonlyMap<string, string>,
  offset: { x: number; y: number }
): Record<string, unknown> {
  let data = prepareDuplicatedNodeData(
    (node.data ?? {}) as Record<string, unknown>,
    node.id,
    nodeIdMap
  );
  const groupId = typeof data.groupId === "string" ? data.groupId : null;
  if (groupId) data.groupId = groupIdMap.get(groupId) ?? groupId;

  const remappedSpec = remapRelationshipDiagramSpec(
    data.relationshipDiagramSpec,
    nodeIdMap
  );
  if (remappedSpec) data.relationshipDiagramSpec = remappedSpec;

  const translatedAnchor = translateTextCalloutAnchor(
    data.textCalloutAnchor,
    offset
  );
  if (translatedAnchor) data = { ...data, textCalloutAnchor: translatedAnchor };
  return data;
}

function remapEdgeData(
  edge: Edge,
  nodeIdMap: ReadonlyMap<string, string>,
  edgeIdMap: ReadonlyMap<string, string>,
  connectorGroupIdMap: ReadonlyMap<string, string>,
  offset: { x: number; y: number }
): Record<string, unknown> {
  const data = structuredClone((edge.data ?? {}) as Record<string, unknown>);
  data.waypoints = translatedPoints(data.waypoints, offset);
  data.junctionUserWaypoints = translatedPoints(data.junctionUserWaypoints, offset);

  for (const field of [
    "connectorJunctionId",
    "hiddenInMatrixFor",
    "hiddenInSunburstFor",
    "layoutColorRootId",
  ]) {
    const referencedId = data[field];
    if (typeof referencedId !== "string") continue;
    const remapped = nodeIdMap.get(referencedId);
    if (remapped) data[field] = remapped;
    else delete data[field];
  }

  if (typeof data.labelPathEdgeId === "string") {
    const remapped = edgeIdMap.get(data.labelPathEdgeId);
    if (remapped) data.labelPathEdgeId = remapped;
    else delete data.labelPathEdgeId;
  }
  if (typeof data.connectorGroupId === "string") {
    data.connectorGroupId = connectorGroupIdMap.get(data.connectorGroupId)
      ?? data.connectorGroupId;
  }
  return data;
}

/**
 * Inserts a portable diagram into a destination board without changing the
 * destination's viewport or appearance settings.
 */
export function insertCrossBoardDiagram(
  destination: BoardContent,
  payload: CrossBoardDiagramPayload
): BoardContent {
  if (!payload.nodes.length) {
    throw new Error("Select at least one diagram object to copy.");
  }

  const usedIds = new Set([
    ...destination.nodes.map((node) => node.id),
    ...destination.edges.map((edge) => edge.id),
    ...destination.relationships.map((relationship) => relationship.id),
  ]);
  const nodeIdMap = new Map(
    payload.nodes.map((node) => [node.id, allocateId(usedIds)])
  );
  const edgeIdMap = new Map(
    payload.edges.map((edge) => [edge.id, allocateId(usedIds)])
  );
  const relationshipIdMap = new Map(
    payload.relationships.map((relationship) => [
      relationship.id,
      allocateId(usedIds),
    ])
  );
  const groupIds = new Set(
    payload.nodes.flatMap((node) => {
      const groupId = (node.data as Record<string, unknown> | undefined)?.groupId;
      return typeof groupId === "string" ? [groupId] : [];
    })
  );
  const groupIdMap = new Map(
    [...groupIds].map((groupId) => [groupId, allocateId(usedIds)])
  );
  const connectorGroupIds = new Set(
    payload.edges.flatMap((edge) => {
      const groupId = (edge.data as Record<string, unknown> | undefined)
        ?.connectorGroupId;
      return typeof groupId === "string" ? [groupId] : [];
    })
  );
  const connectorGroupIdMap = new Map(
    [...connectorGroupIds].map((groupId) => [groupId, allocateId(usedIds)])
  );
  const offset = destinationOffset(payload.nodes, destination.nodes);

  const nodes = payload.nodes.map((node) => {
    const { w, h } = sizeOf(node);
    return {
      ...structuredClone(node),
      id: nodeIdMap.get(node.id)!,
      position: {
        x: node.position.x + offset.x,
        y: node.position.y + offset.y,
      },
      data: remapNodeData(node, nodeIdMap, groupIdMap, offset),
      style: { ...(node.style ?? {}), width: w, height: h },
      selected: false,
    };
  }) as BoardContent["nodes"];
  const edges = payload.edges.map((edge) => ({
    ...structuredClone(edge),
    id: edgeIdMap.get(edge.id)!,
    source: nodeIdMap.get(edge.source)!,
    target: nodeIdMap.get(edge.target)!,
    data: remapEdgeData(
      edge,
      nodeIdMap,
      edgeIdMap,
      connectorGroupIdMap,
      offset
    ),
    selected: false,
  })) as BoardContent["edges"];
  const relationships = payload.relationships.map((relationship) => ({
    ...structuredClone(relationship),
    id: relationshipIdMap.get(relationship.id)!,
    sourceNodeId: nodeIdMap.get(relationship.sourceNodeId)!,
    targetNodeId: nodeIdMap.get(relationship.targetNodeId)!,
  }));
  const relationshipFans = payload.relationshipFans.flatMap((fan) => {
    const sourceNodeId = nodeIdMap.get(fan.sourceNodeId);
    if (!sourceNodeId) return [];
    const targetBranchNodeId = fan.targetBranchNodeId
      ? nodeIdMap.get(fan.targetBranchNodeId)
      : undefined;
    return [{
      ...structuredClone(fan),
      sourceNodeId,
      ...(targetBranchNodeId
        ? { targetBranchNodeId }
        : { targetBranchNodeId: undefined }),
    }];
  });

  return {
    ...destination,
    nodes: [...destination.nodes, ...nodes],
    edges: [...destination.edges, ...edges],
    relationships: [...destination.relationships, ...relationships],
    relationshipFans: [...destination.relationshipFans, ...relationshipFans],
  };
}
