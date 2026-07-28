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

export type FlowchartBranchKind = "affirmative" | "negative" | "other";

export interface FlowchartTidyEdgeResult {
  edges: Edge[];
  semanticBranchCount: number;
  laneRoutedCount: number;
  resetLabelOffsetCount: number;
}

type GraphEdge = {
  key: string;
  source: string;
  target: string;
  index: number;
  branchKind: FlowchartBranchKind;
};

type Point = { x: number; y: number };
type Placement = Point & { width: number; height: number };
type NodeFootprint = { left: number; top: number; right: number; bottom: number };

const EXCLUDED_NODE_TYPES = new Set(["frame", "relationshipDiagram", "sunburst"]);
const DEFAULT_NODE_GAP = 72;
const DEFAULT_LAYER_GAP = 112;
const DEFAULT_COMPONENT_GAP = 180;
const FIXED_OBSTACLE_PADDING = 36;
const SEMANTIC_BRANCH_GAP = 56;
const CROSS_LINK_LANE_GAP = 88;
const CROSS_LINK_LANE_SPACING = 36;
const NOTE_SAFE_GAP = 28;
const NOTE_STACK_GAP = 16;

const AFFIRMATIVE_LABELS = new Set([
  "1", "accept", "accepted", "allow", "allowed", "approved", "continue", "ok", "okay",
  "pass", "proceed", "success", "true", "valid", "y", "yes",
  "आम", "आम्", "हाँ", "हा", "होय", "ஆம்",
]);
const NEGATIVE_LABELS = new Set([
  "0", "blocked", "cancel", "denied", "deny", "fail", "false", "invalid", "n", "no",
  "reject", "rejected", "stop",
  "न", "नहि", "नहीं", "नही", "नैव", "இல்லை",
]);

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

function plainConnectorLabel(edge: Edge): string {
  const label = (edge.data as { label?: unknown } | undefined)?.label;
  if (typeof label !== "string") return "";
  return label
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[.,:;!?()[\]{}|/\\\-–—।॥]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function flowchartBranchKind(edge: Edge): FlowchartBranchKind {
  const label = plainConnectorLabel(edge);
  if (!label) return "other";
  if (AFFIRMATIVE_LABELS.has(label)) return "affirmative";
  if (NEGATIVE_LABELS.has(label)) return "negative";
  const data = (edge.data ?? {}) as Record<string, unknown>;
  if (data.labelColorSynced !== true) return "other";
  const color = typeof data.labelColor === "string"
    ? data.labelColor
    : typeof data.color === "string" ? data.color : "";
  const match = color.trim().match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!match) return "other";
  const [red, green, blue] = match.slice(1).map((value) => Number.parseInt(value, 16));
  if (green > red * 1.2 && green > blue * 1.2) return "affirmative";
  if (red > green * 1.2 && red > blue * 1.2) return "negative";
  return "other";
}

function isDecisionNode(node: Node | undefined): boolean {
  if (!node || node.type !== "shape") return false;
  const shapeType = nodeData(node).shapeType;
  return shapeType === "diamond" || shapeType === "rhombus" || shapeType === "decision";
}

function footprintWidth(footprint: NodeFootprint): number {
  return footprint.right - footprint.left;
}

function footprintHeight(footprint: NodeFootprint): number {
  return footprint.bottom - footprint.top;
}

function envelopeForPlacement(placement: Placement, footprint: NodeFootprint): Placement {
  return {
    x: placement.x + footprint.left,
    y: placement.y + footprint.top,
    width: footprintWidth(footprint),
    height: footprintHeight(footprint),
  };
}

function buildNodeFootprints(
  nodes: Node[],
  layoutNodeIds: string[],
  nodesById: Map<string, Node>
): { footprints: Map<string, NodeFootprint>; bundledNoteIds: Set<string> } {
  const layoutIds = new Set(layoutNodeIds);
  const footprints = new Map<string, NodeFootprint>();
  for (const id of layoutNodeIds) {
    const dimensions = getNodeDimensions(nodesById.get(id)!);
    footprints.set(id, { left: 0, top: 0, right: dimensions.width, bottom: dimensions.height });
  }

  const bundledNoteIds = new Set<string>();
  for (const note of nodes) {
    if (!isExternalNote(note) || isLocked(note) || note.hidden) continue;
    const ownerId = nodeData(note).noteForNodeId;
    if (typeof ownerId !== "string" || !layoutIds.has(ownerId)) continue;
    const owner = nodesById.get(ownerId);
    const footprint = footprints.get(ownerId);
    if (!owner || !footprint) continue;
    const ownerRect = getNodeRect(owner);
    const noteRect = getNodeRect(note);
    footprint.left = Math.min(footprint.left, noteRect.left - ownerRect.left);
    footprint.top = Math.min(footprint.top, noteRect.top - ownerRect.top);
    footprint.right = Math.max(footprint.right, noteRect.right - ownerRect.left);
    footprint.bottom = Math.max(footprint.bottom, noteRect.bottom - ownerRect.top);
    bundledNoteIds.add(note.id);
  }
  return { footprints, bundledNoteIds };
}

function noteOccupiesPrimaryCorridor(
  note: NodeRect,
  owner: NodeRect,
  direction: ResolvedFlowchartTidyDirection
): boolean {
  return direction === "horizontal"
    ? note.top < owner.bottom && note.bottom > owner.top
    : note.left < owner.right && note.right > owner.left;
}

function alternatingSlot(index: number): number {
  if (index === 0) return 0;
  const distance = Math.ceil(index / 2);
  return index % 2 ? distance : -distance;
}

function prepareAttachedNotesForTidy(
  nodes: Node[],
  layoutNodeIds: string[],
  direction: ResolvedFlowchartTidyDirection
): { nodes: Node[]; repositionedNoteIds: Set<string> } {
  const layoutIds = new Set(layoutNodeIds);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const notesByOwner = new Map<string, Node[]>();
  for (const note of nodes) {
    if (!isExternalNote(note) || isLocked(note) || note.hidden) continue;
    const ownerId = nodeData(note).noteForNodeId;
    if (typeof ownerId !== "string" || !layoutIds.has(ownerId)) continue;
    notesByOwner.set(ownerId, [...(notesByOwner.get(ownerId) ?? []), note]);
  }

  const positionByNoteId = new Map<string, Point>();
  const repositionedNoteIds = new Set<string>();
  for (const [ownerId, notes] of notesByOwner) {
    const owner = byId.get(ownerId);
    if (!owner || isLocked(owner)) continue;
    const ownerRect = getNodeRect(owner);
    const settled = notes
      .filter((note) => !noteOccupiesPrimaryCorridor(getNodeRect(note), ownerRect, direction))
      .map((note) => {
        const rect = getNodeRect(note);
        return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
      });
    const corridorNotes = notes.filter((note) => (
      noteOccupiesPrimaryCorridor(getNodeRect(note), ownerRect, direction)
    ));
    corridorNotes.forEach((note, noteIndex) => {
      const noteRect = getNodeRect(note);
      const originalCrossDelta = direction === "horizontal"
        ? noteRect.centerY - ownerRect.centerY
        : noteRect.centerX - ownerRect.centerX;
      const prefersPositiveSide = Math.abs(originalCrossDelta) > 20
        ? originalCrossDelta > 0
        : noteIndex % 2 === 1;
      let placement: Placement | null = null;
      for (let slotIndex = 0; slotIndex < 24 && !placement; slotIndex++) {
        const slot = alternatingSlot(slotIndex);
        for (const positiveSide of [prefersPositiveSide, !prefersPositiveSide]) {
          const candidate: Placement = direction === "horizontal"
            ? {
                x: ownerRect.centerX - noteRect.width / 2 + slot * (noteRect.width + NOTE_STACK_GAP),
                y: positiveSide
                  ? ownerRect.bottom + NOTE_SAFE_GAP
                  : ownerRect.top - NOTE_SAFE_GAP - noteRect.height,
                width: noteRect.width,
                height: noteRect.height,
              }
            : {
                x: positiveSide
                  ? ownerRect.right + NOTE_SAFE_GAP
                  : ownerRect.left - NOTE_SAFE_GAP - noteRect.width,
                y: ownerRect.centerY - noteRect.height / 2 + slot * (noteRect.height + NOTE_STACK_GAP),
                width: noteRect.width,
                height: noteRect.height,
              };
          if (settled.every((other) => !overlaps(candidate, other, NOTE_STACK_GAP))) {
            placement = candidate;
            break;
          }
        }
      }
      placement ??= { x: noteRect.left, y: noteRect.top, width: noteRect.width, height: noteRect.height };
      settled.push(placement);
      const position = { x: Math.round(placement.x), y: Math.round(placement.y) };
      positionByNoteId.set(note.id, position);
      if (position.x !== note.position.x || position.y !== note.position.y) repositionedNoteIds.add(note.id);
    });
  }

  return {
    nodes: nodes.map((node) => {
      const position = positionByNoteId.get(node.id);
      return position ? { ...node, position } : node;
    }),
    repositionedNoteIds,
  };
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
  // Only immediate parent/child links should influence sibling ordering.
  // Long cross-links otherwise drag unrelated branches through one another.
  const forwardEdges = edges.filter((edge) => (
    !feedback.has(edge.key)
    && (ranks.get(edge.target) ?? 0) - (ranks.get(edge.source) ?? 0) === 1
  ));
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
  layerGap: number,
  footprints: Map<string, NodeFootprint>
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
  const primarySize = (id: string) => {
    const footprint = footprints.get(id)!;
    return vertical ? footprintHeight(footprint) : footprintWidth(footprint);
  };
  const crossSize = (id: string) => {
    const footprint = footprints.get(id)!;
    return vertical ? footprintWidth(footprint) : footprintHeight(footprint);
  };
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

  const forwardEdges = edges.filter((edge) => (
    !feedback.has(edge.key)
    && (ranks.get(edge.target) ?? 0) - (ranks.get(edge.source) ?? 0) === 1
  ));
  const semanticSources = new Set<string>();
  for (const sourceId of nodeIds) {
    if (!isDecisionNode(nodesById.get(sourceId))) continue;
    const kinds = new Set(forwardEdges
      .filter((edge) => edge.source === sourceId)
      .map((edge) => edge.branchKind));
    if (kinds.has("affirmative") && kinds.has("negative")) semanticSources.add(sourceId);
  }
  const semanticOffset = (edge: GraphEdge): number => {
    if (!semanticSources.has(edge.source) || edge.branchKind !== "negative") return 0;
    const source = nodesById.get(edge.source)!;
    const target = nodesById.get(edge.target)!;
    const sourceCenter = center(source);
    const targetCenter = center(target);
    const originalDelta = vertical
      ? targetCenter.x - sourceCenter.x
      : targetCenter.y - sourceCenter.y;
    const side = Math.abs(originalDelta) > 24 ? Math.sign(originalDelta) : 1;
    return side * (crossSize(edge.source) / 2 + crossSize(edge.target) / 2 + SEMANTIC_BRANCH_GAP);
  };
  const refine = (rank: number, incoming: boolean) => {
    const ids = layers.get(rank)!;
    const desired = new Map<string, number>();
    for (const id of ids) {
      const neighborEdges = forwardEdges.filter((edge) => {
        if (incoming && edge.target === id && (ranks.get(edge.source) ?? rank) < rank) return true;
        if (!incoming && edge.source === id && (ranks.get(edge.target) ?? rank) > rank) return true;
        return false;
      });
      const layoutEdges = !incoming && semanticSources.has(id)
        ? neighborEdges.filter((edge) => edge.branchKind === "affirmative")
        : neighborEdges;
      const neighborCenters = layoutEdges.map((edge) => {
        const neighbor = incoming ? edge.source : edge.target;
        return (crossCenter.get(neighbor) ?? 0) + (incoming ? semanticOffset(edge) : 0);
      });
      desired.set(id, neighborCenters.length
        ? neighborCenters.reduce((sum, value) => sum + value, 0) / neighborCenters.length
        : crossCenter.get(id) ?? 0);
    }
    ids.sort((a, b) => (
      (desired.get(a) ?? 0) - (desired.get(b) ?? 0)
      || (inputOrder.get(a) ?? 0) - (inputOrder.get(b) ?? 0)
    ));
    for (const [id, value] of packedCenters(ids, desired, crossSize, nodeGap)) crossCenter.set(id, value);
  };
  for (let iteration = 0; iteration < 6; iteration++) {
    for (const rank of layerNumbers.slice(1)) refine(rank, true);
    for (const rank of layerNumbers.slice(0, -1).reverse()) refine(rank, false);
  }

  const placements = new Map<string, Placement>();
  for (const id of nodeIds) {
    const size = dimensions.get(id)!;
    const footprint = footprints.get(id)!;
    const primary = primaryCenter.get(id) ?? 0;
    const cross = crossCenter.get(id) ?? 0;
    const bundleX = vertical
      ? cross - footprintWidth(footprint) / 2
      : primary - footprintWidth(footprint) / 2;
    const bundleY = vertical
      ? primary - footprintHeight(footprint) / 2
      : cross - footprintHeight(footprint) / 2;
    placements.set(id, {
      x: bundleX - footprint.left,
      y: bundleY - footprint.top,
      ...size,
    });
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
  nodeGap: number,
  footprints: Map<string, NodeFootprint>
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
    const footprint = footprints.get(id)!;
    const isFree = (candidate: Placement) => occupied.every((obstacle) => (
      !overlaps(envelopeForPlacement(candidate, footprint), obstacle, FIXED_OBSTACLE_PADDING)
    ));
    let candidate = intended;
    if (!isFree(candidate)) {
      const step = (vertical ? footprintWidth(footprint) : footprintHeight(footprint)) + nodeGap;
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
    occupied.push(envelopeForPlacement(candidate, footprint));
  }
}

/**
 * Arrange a rough, general directed flowchart into readable layers.
 *
 * This is intentionally separate from hierarchy layouts: it accepts cycles,
 * joins, cross-links, connector junctions, and disconnected components. Notes
 * keep safe authored offsets (or move out of the main connector corridor),
 * locked objects remain fixed, and callers can reroute connectors after
 * applying the returned node positions.
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
      ? [{
          key: `${edge.id || "edge"}:${index}`,
          source: edge.source,
          target: edge.target,
          index,
          branchKind: flowchartBranchKind(edge),
        }]
      : []
  ));
  const connectedIds = new Set(graphEdges.flatMap((edge) => [edge.source, edge.target]));
  const layoutNodes = candidates.filter((node) => connectedIds.has(node.id));
  const layoutNodeIds = layoutNodes.map((node) => node.id);
  const layoutIdSet = new Set(layoutNodeIds);
  const inputOrder = new Map(nodes.map((node, index) => [node.id, index]));
  const originalNodesById = new Map(nodes.map((node) => [node.id, node]));
  const direction = resolvedDirection(options.direction ?? "auto", originalNodesById, graphEdges, edges);
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

  const preparedNotes = prepareAttachedNotesForTidy(nodes, layoutNodeIds, direction);
  const tidyInputNodes = preparedNotes.nodes;
  const nodesById = new Map(tidyInputNodes.map((node) => [node.id, node]));
  const { footprints, bundledNoteIds } = buildNodeFootprints(tidyInputNodes, layoutNodeIds, nodesById);

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
      layerGap,
      footprints
    );
    const localBounds = boundsOf(component.map((id) => (
      envelopeForPlacement(layout.placements.get(id)!, footprints.get(id)!)
    )))!;
    const dx = direction === "vertical" ? componentCursor - localBounds.left : -localBounds.left;
    const dy = direction === "vertical" ? -localBounds.top : componentCursor - localBounds.top;
    for (const [id, placement] of layout.placements) {
      placements.set(id, shiftedPlacement(placement, dx, dy));
      rankByNodeId[id] = layout.ranks.get(id) ?? 0;
    }
    componentCursor += (direction === "vertical" ? localBounds.width : localBounds.height) + componentGap;
  }

  const originalBounds = boundsOf(layoutNodes.map((node) => {
    const rect = getNodeRect(nodesById.get(node.id)!);
    return envelopeForPlacement(
      { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
      footprints.get(node.id)!
    );
  }))!;
  const proposedBounds = boundsOf(layoutNodeIds.map((id) => (
    envelopeForPlacement(placements.get(id)!, footprints.get(id)!)
  )))!;
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
  const fixedObstacles: Placement[] = tidyInputNodes.flatMap((node) => {
    if (node.type === "frame" || node.hidden || bundledNoteIds.has(node.id)) return [];
    if (layoutIdSet.has(node.id) && !isLocked(node)) return [];
    const rect = getNodeRect(node);
    const placement = { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
    return [layoutIdSet.has(node.id)
      ? envelopeForPlacement(placement, footprints.get(node.id)!)
      : placement];
  });
  resolveFixedObstacleCollisions(
    placements,
    layoutNodeIds.filter((id) => !isLocked(nodesById.get(id)!)),
    fixedObstacles,
    direction,
    nodeGap,
    footprints
  );

  const positionDelta = new Map<string, Point>();
  let movedNodeCount = 0;
  const positioned = tidyInputNodes.map((node) => {
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

  let movedNoteCount = preparedNotes.repositionedNoteIds.size;
  const withNotes = positioned.map((node) => {
    if (!isExternalNote(node) || isLocked(node)) return node;
    const ownerId = nodeData(node).noteForNodeId;
    if (typeof ownerId !== "string") return node;
    const delta = positionDelta.get(ownerId);
    if (!delta || (Math.abs(delta.x) < 0.5 && Math.abs(delta.y) < 0.5)) return node;
    if (!preparedNotes.repositionedNoteIds.has(node.id)) movedNoteCount++;
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

/**
 * Rebuild connector metadata after node placement. Immediate flow edges use
 * the layout router, labeled decision branches receive distinct ports, and
 * feedback/long cross-links are assigned deterministic lanes outside the
 * annotated chart bounds.
 */
export function routeTidiedFlowchartEdges(
  nodes: Node[],
  edges: Edge[],
  layout: Pick<FlowchartTidyResult, "direction" | "layoutNodeIds" | "rankByNodeId">
): FlowchartTidyEdgeResult {
  const layoutIds = new Set(layout.layoutNodeIds);
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const routedIndices = edges.flatMap((edge, index) => (
    !edge.hidden && layoutIds.has(edge.source) && layoutIds.has(edge.target) ? [index] : []
  ));
  const routedIndexSet = new Set(routedIndices);
  const semanticSources = new Set<string>();
  for (const sourceId of layout.layoutNodeIds) {
    if (!isDecisionNode(nodesById.get(sourceId))) continue;
    const kinds = new Set(routedIndices
      .map((index) => edges[index])
      .filter((edge) => edge.source === sourceId)
      .map(flowchartBranchKind));
    if (kinds.has("affirmative") && kinds.has("negative")) semanticSources.add(sourceId);
  }

  const annotatedNodes = nodes.filter((node) => {
    if (node.hidden) return false;
    if (layoutIds.has(node.id)) return true;
    const ownerId = nodeData(node).noteForNodeId;
    return isExternalNote(node) && typeof ownerId === "string" && layoutIds.has(ownerId);
  });
  const chartBounds = boundsOf(annotatedNodes.map((node) => {
    const rect = getNodeRect(node);
    return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
  }));

  type LaneSide = "left" | "right" | "top" | "bottom";
  const laneSideByIndex = new Map<number, LaneSide>();
  const crossLinkIndices = routedIndices.filter((index) => {
    const edge = edges[index];
    const source = nodesById.get(edge.source);
    const target = nodesById.get(edge.target);
    if (!source || !target || source.type === "junction" || target.type === "junction") return false;
    return (layout.rankByNodeId[edge.target] ?? 0) - (layout.rankByNodeId[edge.source] ?? 0) !== 1;
  }).sort((first, second) => {
    const a = edges[first];
    const b = edges[second];
    return (layout.rankByNodeId[a.source] ?? 0) - (layout.rankByNodeId[b.source] ?? 0)
      || (layout.rankByNodeId[a.target] ?? 0) - (layout.rankByNodeId[b.target] ?? 0)
      || a.id.localeCompare(b.id);
  });
  if (chartBounds) {
    for (const index of crossLinkIndices) {
      const edge = edges[index];
      const sourceRect = getNodeRect(nodesById.get(edge.source)!);
      const targetRect = getNodeRect(nodesById.get(edge.target)!);
      if (layout.direction === "vertical") {
        const averageX = (sourceRect.centerX + targetRect.centerX) / 2;
        laneSideByIndex.set(index,
          averageX - chartBounds.left <= chartBounds.right - averageX ? "left" : "right");
      } else {
        const averageY = (sourceRect.centerY + targetRect.centerY) / 2;
        laneSideByIndex.set(index,
          averageY - chartBounds.top <= chartBounds.bottom - averageY ? "top" : "bottom");
      }
    }
  }

  const laneCounts = new Map<LaneSide, number>();
  let semanticBranchCount = 0;
  let laneRoutedCount = 0;
  let resetLabelOffsetCount = 0;
  const nextEdges = edges.map((edge, index) => {
    if (!routedIndexSet.has(index)) return edge;
    const source = nodesById.get(edge.source);
    const target = nodesById.get(edge.target);
    if (!source || !target) return edge;
    const data = { ...(edge.data ?? {}) } as Record<string, unknown>;
    if (data.labelOffset !== undefined) {
      delete data.labelOffset;
      resetLabelOffsetCount++;
    }
    delete data.waypoints;
    delete data.waypointOrigin;
    delete data.preserveHandles;
    data.curveStyle = "step";

    const junctionEndpoint = source.type === "junction" || target.type === "junction";
    if (junctionEndpoint) {
      data.layoutMode = "freeForm";
      data.manualRoute = true;
      data.preserveHandles = true;
      return { ...edge, data };
    }

    const rankDelta = (layout.rankByNodeId[edge.target] ?? 0)
      - (layout.rankByNodeId[edge.source] ?? 0);
    const branchKind = flowchartBranchKind(edge);
    const semanticBranch = rankDelta === 1
      && semanticSources.has(edge.source)
      && (branchKind === "affirmative" || branchKind === "negative");
    if (semanticBranch) semanticBranchCount++;

    if (rankDelta === 1 && !(semanticBranch && branchKind === "negative")) {
      data.layoutMode = layout.direction === "vertical" ? "topDown" : "horizontal";
      data.manualRoute = false;
      return {
        ...edge,
        sourceHandle: layout.direction === "vertical" ? "bottom" : "right",
        targetHandle: layout.direction === "vertical" ? "top" : "left",
        data,
      };
    }

    if (rankDelta === 1) {
      const sourceRect = getNodeRect(source);
      const targetRect = getNodeRect(target);
      const positiveSide = layout.direction === "vertical"
        ? targetRect.centerX >= sourceRect.centerX
        : targetRect.centerY >= sourceRect.centerY;
      const sourceHandle = layout.direction === "vertical"
        ? positiveSide ? "right" : "left"
        : positiveSide ? "bottom" : "top";
      const targetHandle = sourceHandle === "right"
        ? "left"
        : sourceHandle === "left"
          ? "right"
          : sourceHandle === "bottom" ? "top" : "bottom";
      data.layoutMode = "freeForm";
      data.manualRoute = true;
      data.preserveHandles = true;
      return { ...edge, sourceHandle, targetHandle, data };
    }

    const laneSide = laneSideByIndex.get(index);
    if (!laneSide || !chartBounds) {
      data.layoutMode = "freeForm";
      data.manualRoute = true;
      return { ...edge, data };
    }
    const laneIndex = laneCounts.get(laneSide) ?? 0;
    laneCounts.set(laneSide, laneIndex + 1);
    const laneDistance = CROSS_LINK_LANE_GAP + laneIndex * CROSS_LINK_LANE_SPACING;
    const sourceRect = getNodeRect(source);
    const targetRect = getNodeRect(target);
    const laneCoordinate = laneSide === "left"
      ? chartBounds.left - laneDistance
      : laneSide === "right"
        ? chartBounds.right + laneDistance
        : laneSide === "top"
          ? chartBounds.top - laneDistance
          : chartBounds.bottom + laneDistance;
    const waypoints = layout.direction === "vertical"
      ? [
          { x: laneCoordinate, y: sourceRect.centerY },
          { x: laneCoordinate, y: targetRect.centerY },
        ]
      : [
          { x: sourceRect.centerX, y: laneCoordinate },
          { x: targetRect.centerX, y: laneCoordinate },
        ];
    data.layoutMode = "freeForm";
    data.manualRoute = true;
    data.preserveHandles = true;
    data.waypoints = waypoints;
    data.waypointOrigin = "segment-drag";
    laneRoutedCount++;
    return {
      ...edge,
      sourceHandle: laneSide,
      targetHandle: laneSide,
      data,
    };
  });

  return { edges: nextEdges, semanticBranchCount, laneRoutedCount, resetLabelOffsetCount };
}
