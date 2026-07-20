import type { Edge, Node } from "@xyflow/react";

import {
  createNodeRect,
  getNodeDimensions,
  getNodeRect,
  nodePositionFromTopLeft,
  type NodeRect,
} from "../layout";

export type FlowchartTidyDirection = "auto" | "vertical" | "horizontal";
export type ResolvedFlowchartTidyDirection = Exclude<FlowchartTidyDirection, "auto">;

export interface FlowchartTidyOptions {
  direction?: FlowchartTidyDirection;
  /** Space between nodes in the same layer. */
  nodeGap?: number;
  /** Clear routing corridor between consecutive layers. */
  layerGap?: number;
  /** Space between disconnected flow groups. */
  componentGap?: number;
}

export interface FlowchartTidyResult {
  nodes: Node[];
  direction: ResolvedFlowchartTidyDirection;
  layoutNodeIds: string[];
  rankByNodeId: Record<string, number>;
  componentCount: number;
  movedNodeCount: number;
  movedNoteCount: number;
  lockedNodeCount: number;
}

type GraphEdge = {
  key: string;
  source: string;
  target: string;
  index: number;
};

type Point = { x: number; y: number };
type Placement = Point & { width: number; height: number };

const EXCLUDED_NODE_TYPES = new Set(["frame", "relationshipDiagram", "sunburst"]);
const DEFAULT_NODE_GAP = 72;
const DEFAULT_LAYER_GAP = 112;
const DEFAULT_COMPONENT_GAP = 180;
const FIXED_OBSTACLE_PADDING = 36;

function nodeData(node: Node): Record<string, unknown> {
  return (node.data ?? {}) as Record<string, unknown>;
}

function isExternalNote(node: Node): boolean {
  return nodeData(node).externalNote === true;
}

function isLocked(node: Node): boolean {
  return nodeData(node).locked === true;
}

function isExcludedNode(node: Node): boolean {
  return node.hidden === true
    || isExternalNote(node)
    || EXCLUDED_NODE_TYPES.has(node.type ?? "");
}

function center(node: Node): Point {
  const rect = getNodeRect(node);
  return { x: rect.centerX, y: rect.centerY };
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function boundsOf(placements: Iterable<Placement>): NodeRect | null {
  const items = Array.from(placements);
  if (!items.length) return null;
  const left = Math.min(...items.map((item) => item.x));
  const top = Math.min(...items.map((item) => item.y));
  const right = Math.max(...items.map((item) => item.x + item.width));
  const bottom = Math.max(...items.map((item) => item.y + item.height));
  return createNodeRect("flowchart-tidy-bounds", left, top, right - left, bottom - top);
}

function overlaps(a: Placement, b: Placement, padding: number): boolean {
  return a.x - padding < b.x + b.width
    && a.x + a.width + padding > b.x
    && a.y - padding < b.y + b.height
    && a.y + a.height + padding > b.y;
}

function resolvedDirection(
  requested: FlowchartTidyDirection,
  nodesById: Map<string, Node>,
  edges: GraphEdge[],
  sourceEdges: Edge[]
): ResolvedFlowchartTidyDirection {
  if (requested !== "auto") return requested;

  let horizontal = 0;
  let vertical = 0;
  for (const graphEdge of edges) {
    const edge = sourceEdges[graphEdge.index];
    const mode = (edge.data as { layoutMode?: unknown } | undefined)?.layoutMode;
    if (mode === "horizontal" || mode === "list" || mode === "linear") horizontal += 3;
    if (mode === "vertical" || mode === "topDown") vertical += 3;

    const horizontalHandles = (edge.sourceHandle === "left" || edge.sourceHandle === "right")
      && (edge.targetHandle === "left" || edge.targetHandle === "right");
    const verticalHandles = (edge.sourceHandle === "top" || edge.sourceHandle === "bottom")
      && (edge.targetHandle === "top" || edge.targetHandle === "bottom");
    if (horizontalHandles) horizontal += 2;
    if (verticalHandles) vertical += 2;

    const source = nodesById.get(graphEdge.source);
    const target = nodesById.get(graphEdge.target);
    if (!source || !target) continue;
    const a = center(source);
    const b = center(target);
    const dx = Math.abs(b.x - a.x);
    const dy = Math.abs(b.y - a.y);
    if (dx > dy * 1.2) horizontal += 1;
    else if (dy > dx * 1.2) vertical += 1;
  }

  return horizontal > vertical * 1.15 ? "horizontal" : "vertical";
}

function weakComponents(nodeIds: string[], edges: GraphEdge[], inputOrder: Map<string, number>): string[][] {
  const neighbors = new Map(nodeIds.map((id) => [id, new Set<string>()]));
  for (const edge of edges) {
    neighbors.get(edge.source)?.add(edge.target);
    neighbors.get(edge.target)?.add(edge.source);
  }

  const components: string[][] = [];
  const seen = new Set<string>();
  for (const start of nodeIds) {
    if (seen.has(start)) continue;
    const component: string[] = [];
    const queue = [start];
    seen.add(start);
    while (queue.length) {
      const id = queue.shift()!;
      component.push(id);
      for (const neighbor of neighbors.get(id) ?? []) {
        if (seen.has(neighbor)) continue;
        seen.add(neighbor);
        queue.push(neighbor);
      }
    }
    component.sort((a, b) => (inputOrder.get(a) ?? 0) - (inputOrder.get(b) ?? 0));
    components.push(component);
  }
  return components;
}

function feedbackEdgeKeys(
  nodeIds: string[],
  edges: GraphEdge[],
  originalPrimary: Map<string, number>,
  inputOrder: Map<string, number>
): Set<string> {
  const outgoing = new Map(nodeIds.map((id) => [id, [] as GraphEdge[]]));
  const indegree = new Map(nodeIds.map((id) => [id, 0]));
  for (const edge of edges) {
    outgoing.get(edge.source)?.push(edge);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }
  const compareNode = (a: string, b: string) => (
    (originalPrimary.get(a) ?? 0) - (originalPrimary.get(b) ?? 0)
    || (inputOrder.get(a) ?? 0) - (inputOrder.get(b) ?? 0)
  );
  for (const entries of outgoing.values()) {
    entries.sort((a, b) => compareNode(a.target, b.target) || a.index - b.index);
  }

  const roots = nodeIds.filter((id) => (indegree.get(id) ?? 0) === 0).sort(compareNode);
  const starts = [...roots, ...nodeIds.filter((id) => !roots.includes(id)).sort(compareNode)];
  const state = new Map<string, 0 | 1 | 2>();
  const feedback = new Set<string>();
  const visit = (id: string) => {
    state.set(id, 1);
    for (const edge of outgoing.get(id) ?? []) {
      const targetState = state.get(edge.target) ?? 0;
      if (targetState === 1) {
        feedback.add(edge.key);
        continue;
      }
      if (targetState === 0) visit(edge.target);
    }
    state.set(id, 2);
  };
  for (const id of starts) if ((state.get(id) ?? 0) === 0) visit(id);
  return feedback;
}

function assignRanks(
  nodeIds: string[],
  edges: GraphEdge[],
  feedback: Set<string>,
  originalPrimary: Map<string, number>,
  inputOrder: Map<string, number>
): Map<string, number> {
  const forwardEdges = edges.filter((edge) => !feedback.has(edge.key));
  const outgoing = new Map(nodeIds.map((id) => [id, [] as GraphEdge[]]));
  const indegree = new Map(nodeIds.map((id) => [id, 0]));
  const rank = new Map(nodeIds.map((id) => [id, 0]));
  for (const edge of forwardEdges) {
    outgoing.get(edge.source)?.push(edge);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }
  const compareNode = (a: string, b: string) => (
    (originalPrimary.get(a) ?? 0) - (originalPrimary.get(b) ?? 0)
    || (inputOrder.get(a) ?? 0) - (inputOrder.get(b) ?? 0)
  );
  const queue = nodeIds.filter((id) => (indegree.get(id) ?? 0) === 0).sort(compareNode);
  while (queue.length) {
    const id = queue.shift()!;
    for (const edge of outgoing.get(id) ?? []) {
      rank.set(edge.target, Math.max(rank.get(edge.target) ?? 0, (rank.get(id) ?? 0) + 1));
      const nextIndegree = (indegree.get(edge.target) ?? 1) - 1;
      indegree.set(edge.target, nextIndegree);
      if (nextIndegree === 0) {
        queue.push(edge.target);
        queue.sort(compareNode);
      }
    }
  }
  return rank;
}

function reorderLayers(
  layers: Map<number, string[]>,
  ranks: Map<string, number>,
  edges: GraphEdge[],
  feedback: Set<string>,
  originalCross: Map<string, number>,
  inputOrder: Map<string, number>
): void {
  const forwardEdges = edges.filter((edge) => !feedback.has(edge.key));
  const layerNumbers = Array.from(layers.keys()).sort((a, b) => a - b);

  const sweep = (downward: boolean) => {
    const position = new Map<string, number>();
    for (const ids of layers.values()) {
      const denominator = Math.max(1, ids.length - 1);
      ids.forEach((id, index) => position.set(id, index / denominator));
    }
    const orderedRanks = downward ? layerNumbers.slice(1) : layerNumbers.slice(0, -1).reverse();
    for (const rank of orderedRanks) {
      const ids = layers.get(rank)!;
      const barycenter = new Map<string, number>();
      for (const id of ids) {
        const neighbors = forwardEdges.flatMap((edge) => {
          if (downward && edge.target === id && (ranks.get(edge.source) ?? rank) < rank) return [edge.source];
          if (!downward && edge.source === id && (ranks.get(edge.target) ?? rank) > rank) return [edge.target];
          return [];
        });
        if (neighbors.length) {
          barycenter.set(id, neighbors.reduce((sum, neighbor) => sum + (position.get(neighbor) ?? 0), 0) / neighbors.length);
        }
      }
      ids.sort((a, b) => {
        const aBarycenter = barycenter.get(a);
        const bBarycenter = barycenter.get(b);
        if (aBarycenter !== undefined && bBarycenter !== undefined && aBarycenter !== bBarycenter) {
          return aBarycenter - bBarycenter;
        }
        if (aBarycenter !== undefined) return -1;
        if (bBarycenter !== undefined) return 1;
        return (originalCross.get(a) ?? 0) - (originalCross.get(b) ?? 0)
          || (inputOrder.get(a) ?? 0) - (inputOrder.get(b) ?? 0);
      });
      const denominator = Math.max(1, ids.length - 1);
      ids.forEach((id, index) => position.set(id, index / denominator));
    }
  };

  for (let iteration = 0; iteration < 6; iteration++) {
    sweep(true);
    sweep(false);
  }
}

function packedCenters(
  ids: string[],
  desired: Map<string, number>,
  crossSize: (id: string) => number,
  gap: number
): Map<string, number> {
  if (!ids.length) return new Map();
  const centers: number[] = [];
  ids.forEach((id, index) => {
    const wanted = desired.get(id) ?? 0;
    if (index === 0) {
      centers.push(wanted);
      return;
    }
    const previousId = ids[index - 1];
    const minimum = centers[index - 1] + crossSize(previousId) / 2 + gap + crossSize(id) / 2;
    centers.push(Math.max(wanted, minimum));
  });
  const desiredMean = ids.reduce((sum, id) => sum + (desired.get(id) ?? 0), 0) / ids.length;
  const actualMean = centers.reduce((sum, value) => sum + value, 0) / centers.length;
  const offset = desiredMean - actualMean;
  return new Map(ids.map((id, index) => [id, centers[index] + offset]));
}

function layoutComponent(
  nodeIds: string[],
  edges: GraphEdge[],
  nodesById: Map<string, Node>,
  direction: ResolvedFlowchartTidyDirection,
  inputOrder: Map<string, number>,
  nodeGap: number,
  layerGap: number
): { placements: Map<string, Placement>; ranks: Map<string, number> } {
  const vertical = direction === "vertical";
  const originalPrimary = new Map(nodeIds.map((id) => {
    const point = center(nodesById.get(id)!);
    return [id, vertical ? point.y : point.x];
  }));
  const originalCross = new Map(nodeIds.map((id) => {
    const point = center(nodesById.get(id)!);
    return [id, vertical ? point.x : point.y];
  }));
  const feedback = feedbackEdgeKeys(nodeIds, edges, originalPrimary, inputOrder);
  const ranks = assignRanks(nodeIds, edges, feedback, originalPrimary, inputOrder);
  const layers = new Map<number, string[]>();
  for (const id of nodeIds) {
    const rank = ranks.get(id) ?? 0;
    if (!layers.has(rank)) layers.set(rank, []);
    layers.get(rank)!.push(id);
  }
  for (const ids of layers.values()) {
    ids.sort((a, b) => (originalCross.get(a) ?? 0) - (originalCross.get(b) ?? 0)
      || (inputOrder.get(a) ?? 0) - (inputOrder.get(b) ?? 0));
  }
  reorderLayers(layers, ranks, edges, feedback, originalCross, inputOrder);

  const dimensions = new Map(nodeIds.map((id) => [id, getNodeDimensions(nodesById.get(id)!)]));
  const primarySize = (id: string) => vertical ? dimensions.get(id)!.height : dimensions.get(id)!.width;
  const crossSize = (id: string) => vertical ? dimensions.get(id)!.width : dimensions.get(id)!.height;
  const layerNumbers = Array.from(layers.keys()).sort((a, b) => a - b);
  const primaryCenter = new Map<string, number>();
  let primaryCursor = 0;
  layerNumbers.forEach((rank, index) => {
    const ids = layers.get(rank)!;
    const largest = Math.max(...ids.map(primarySize));
    const centerValue = primaryCursor + largest / 2;
    ids.forEach((id) => primaryCenter.set(id, centerValue));
    primaryCursor += largest + (index === layerNumbers.length - 1 ? 0 : layerGap);
  });

  const crossCenter = new Map<string, number>();
  for (const ids of layers.values()) {
    const total = ids.reduce((sum, id) => sum + crossSize(id), 0) + nodeGap * Math.max(0, ids.length - 1);
    let cursor = -total / 2;
    for (const id of ids) {
      const size = crossSize(id);
      crossCenter.set(id, cursor + size / 2);
      cursor += size + nodeGap;
    }
  }

  const forwardEdges = edges.filter((edge) => !feedback.has(edge.key));
  const refine = (rank: number, incoming: boolean) => {
    const ids = layers.get(rank)!;
    const desired = new Map<string, number>();
    for (const id of ids) {
      const neighbors = forwardEdges.flatMap((edge) => {
        if (incoming && edge.target === id && (ranks.get(edge.source) ?? rank) < rank) return [edge.source];
        if (!incoming && edge.source === id && (ranks.get(edge.target) ?? rank) > rank) return [edge.target];
        return [];
      });
      desired.set(id, neighbors.length
        ? neighbors.reduce((sum, neighbor) => sum + (crossCenter.get(neighbor) ?? 0), 0) / neighbors.length
        : crossCenter.get(id) ?? 0);
    }
    for (const [id, value] of packedCenters(ids, desired, crossSize, nodeGap)) crossCenter.set(id, value);
  };
  for (let iteration = 0; iteration < 6; iteration++) {
    for (const rank of layerNumbers.slice(1)) refine(rank, true);
    for (const rank of layerNumbers.slice(0, -1).reverse()) refine(rank, false);
  }

  const placements = new Map<string, Placement>();
  for (const id of nodeIds) {
    const size = dimensions.get(id)!;
    const primary = primaryCenter.get(id) ?? 0;
    const cross = crossCenter.get(id) ?? 0;
    placements.set(id, vertical
      ? { x: cross - size.width / 2, y: primary - size.height / 2, ...size }
      : { x: primary - size.width / 2, y: cross - size.height / 2, ...size });
  }
  return { placements, ranks };
}

function shiftedPlacement(placement: Placement, dx: number, dy: number): Placement {
  return { ...placement, x: placement.x + dx, y: placement.y + dy };
}

function resolveFixedObstacleCollisions(
  placements: Map<string, Placement>,
  movableIds: string[],
  fixedObstacles: Placement[],
  direction: ResolvedFlowchartTidyDirection,
  nodeGap: number
): void {
  const vertical = direction === "vertical";
  const ordered = [...movableIds].sort((a, b) => {
    const first = placements.get(a)!;
    const second = placements.get(b)!;
    return (vertical ? first.y - second.y || first.x - second.x : first.x - second.x || first.y - second.y);
  });
  const occupied = [...fixedObstacles];
  for (const id of ordered) {
    const intended = placements.get(id)!;
    const isFree = (candidate: Placement) => occupied.every((obstacle) => (
      !overlaps(candidate, obstacle, FIXED_OBSTACLE_PADDING)
    ));
    let candidate = intended;
    if (!isFree(candidate)) {
      const step = (vertical ? intended.width : intended.height) + nodeGap;
      const candidates: Placement[] = [];
      for (let ring = 1; ring <= 40; ring++) {
        for (const sign of [-1, 1]) {
          candidates.push(vertical
            ? { ...intended, x: intended.x + sign * ring * step }
            : { ...intended, y: intended.y + sign * ring * step });
        }
      }
      candidate = candidates.find(isFree) ?? intended;
    }
    placements.set(id, candidate);
    occupied.push(candidate);
  }
}

/**
 * Arrange a rough, general directed flowchart into readable layers.
 *
 * This is intentionally separate from hierarchy layouts: it accepts cycles,
 * joins, cross-links, connector junctions, and disconnected components. Notes
 * retain their authored offsets, locked objects remain fixed, and callers can
 * reroute connectors after applying the returned node positions.
 */
export function tidyFlowchart(
  nodes: Node[],
  edges: Edge[],
  options: FlowchartTidyOptions = {}
): FlowchartTidyResult {
  const endpointIds = new Set<string>();
  edges.forEach((edge) => {
    if (edge.hidden || edge.source === edge.target) return;
    endpointIds.add(edge.source);
    endpointIds.add(edge.target);
  });
  const candidates = nodes.filter((node) => endpointIds.has(node.id) && !isExcludedNode(node));
  const candidateIds = new Set(candidates.map((node) => node.id));
  const graphEdges: GraphEdge[] = edges.flatMap((edge, index) => (
    !edge.hidden
      && edge.source !== edge.target
      && candidateIds.has(edge.source)
      && candidateIds.has(edge.target)
      ? [{ key: `${edge.id || "edge"}:${index}`, source: edge.source, target: edge.target, index }]
      : []
  ));
  const connectedIds = new Set(graphEdges.flatMap((edge) => [edge.source, edge.target]));
  const layoutNodes = candidates.filter((node) => connectedIds.has(node.id));
  const layoutNodeIds = layoutNodes.map((node) => node.id);
  const layoutIdSet = new Set(layoutNodeIds);
  const inputOrder = new Map(nodes.map((node, index) => [node.id, index]));
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const direction = resolvedDirection(options.direction ?? "auto", nodesById, graphEdges, edges);
  if (!layoutNodes.length) {
    return {
      nodes,
      direction,
      layoutNodeIds: [],
      rankByNodeId: {},
      componentCount: 0,
      movedNodeCount: 0,
      movedNoteCount: 0,
      lockedNodeCount: 0,
    };
  }

  const nodeGap = Math.max(24, options.nodeGap ?? DEFAULT_NODE_GAP);
  const layerGap = Math.max(48, options.layerGap ?? DEFAULT_LAYER_GAP);
  const componentGap = Math.max(nodeGap * 2, options.componentGap ?? DEFAULT_COMPONENT_GAP);
  const components = weakComponents(layoutNodeIds, graphEdges, inputOrder);
  const componentOrder = [...components].sort((first, second) => {
    const firstBounds = boundsOf(first.map((id) => {
      const rect = getNodeRect(nodesById.get(id)!);
      return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
    }))!;
    const secondBounds = boundsOf(second.map((id) => {
      const rect = getNodeRect(nodesById.get(id)!);
      return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
    }))!;
    return direction === "vertical"
      ? firstBounds.left - secondBounds.left || firstBounds.top - secondBounds.top
      : firstBounds.top - secondBounds.top || firstBounds.left - secondBounds.left;
  });

  const placements = new Map<string, Placement>();
  const rankByNodeId: Record<string, number> = {};
  let componentCursor = 0;
  for (const component of componentOrder) {
    const componentSet = new Set(component);
    const componentEdges = graphEdges.filter((edge) => componentSet.has(edge.source) && componentSet.has(edge.target));
    const layout = layoutComponent(
      component,
      componentEdges,
      nodesById,
      direction,
      inputOrder,
      nodeGap,
      layerGap
    );
    const localBounds = boundsOf(layout.placements.values())!;
    const dx = direction === "vertical" ? componentCursor - localBounds.left : -localBounds.left;
    const dy = direction === "vertical" ? -localBounds.top : componentCursor - localBounds.top;
    for (const [id, placement] of layout.placements) {
      placements.set(id, shiftedPlacement(placement, dx, dy));
      rankByNodeId[id] = layout.ranks.get(id) ?? 0;
    }
    componentCursor += (direction === "vertical" ? localBounds.width : localBounds.height) + componentGap;
  }

  const originalBounds = boundsOf(layoutNodes.map((node) => {
    const rect = getNodeRect(node);
    return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
  }))!;
  const proposedBounds = boundsOf(placements.values())!;
  const boardDx = originalBounds.left - proposedBounds.left;
  const boardDy = originalBounds.top - proposedBounds.top;
  for (const [id, placement] of placements) placements.set(id, shiftedPlacement(placement, boardDx, boardDy));

  // Anchor any component containing locked nodes near those authored positions.
  for (const component of components) {
    const lockedIds = component.filter((id) => isLocked(nodesById.get(id)!));
    if (!lockedIds.length) continue;
    const dx = median(lockedIds.map((id) => getNodeRect(nodesById.get(id)!).left - placements.get(id)!.x));
    const dy = median(lockedIds.map((id) => getNodeRect(nodesById.get(id)!).top - placements.get(id)!.y));
    component.forEach((id) => placements.set(id, shiftedPlacement(placements.get(id)!, dx, dy)));
    lockedIds.forEach((id) => {
      const rect = getNodeRect(nodesById.get(id)!);
      placements.set(id, { x: rect.left, y: rect.top, width: rect.width, height: rect.height });
    });
  }

  const lockedIds = layoutNodeIds.filter((id) => isLocked(nodesById.get(id)!));
  const fixedObstacles: Placement[] = nodes.flatMap((node) => {
    if (isExternalNote(node) || node.type === "frame" || node.hidden) return [];
    if (layoutIdSet.has(node.id) && !isLocked(node)) return [];
    const rect = getNodeRect(node);
    return [{ x: rect.left, y: rect.top, width: rect.width, height: rect.height }];
  });
  resolveFixedObstacleCollisions(
    placements,
    layoutNodeIds.filter((id) => !isLocked(nodesById.get(id)!)),
    fixedObstacles,
    direction,
    nodeGap
  );

  const positionDelta = new Map<string, Point>();
  let movedNodeCount = 0;
  const positioned = nodes.map((node) => {
    const placement = placements.get(node.id);
    if (!placement || isLocked(node)) return node;
    const position = nodePositionFromTopLeft(node, placement, placement);
    const nextPosition = { x: Math.round(position.x), y: Math.round(position.y) };
    const dx = nextPosition.x - node.position.x;
    const dy = nextPosition.y - node.position.y;
    positionDelta.set(node.id, { x: dx, y: dy });
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return node;
    movedNodeCount++;
    return { ...node, position: nextPosition };
  });

  let movedNoteCount = 0;
  const withNotes = positioned.map((node) => {
    if (!isExternalNote(node) || isLocked(node)) return node;
    const ownerId = nodeData(node).noteForNodeId;
    if (typeof ownerId !== "string") return node;
    const delta = positionDelta.get(ownerId);
    if (!delta || (Math.abs(delta.x) < 0.5 && Math.abs(delta.y) < 0.5)) return node;
    movedNoteCount++;
    return {
      ...node,
      position: {
        x: Math.round(node.position.x + delta.x),
        y: Math.round(node.position.y + delta.y),
      },
    };
  });

  return {
    nodes: withNotes,
    direction,
    layoutNodeIds,
    rankByNodeId,
    componentCount: components.length,
    movedNodeCount,
    movedNoteCount,
    lockedNodeCount: lockedIds.length,
  };
}
