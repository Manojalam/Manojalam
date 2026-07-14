import type { Node, Edge } from "@xyflow/react";
import type { LayoutMode } from "../types";
import { buildHierarchy, getSubtree, getRoots, type Hierarchy } from "./hierarchy";
import { computeListLayout } from "./list-layout";
import { computeMatrixLayout } from "./matrix-layout";
import { computeOrthogonalTreeLayout } from "./tree-layout";
import {
  createNodeRect,
  getNodeRect,
  nodePositionFromTopLeft,
  sizeOf,
  type NodeRect,
} from "./geometry";
export {
  buildMatrixLeafRows,
  computeMatrixLayout,
  getMatrixBaseSize,
  isMatrixHierarchyEdge,
  MATRIX_DENSITY_SETTINGS,
  type MatrixCellGeometry,
  type MatrixLayoutResult,
  type MatrixRow,
} from "./matrix-layout";
export {
  buildTreeConnectorModel,
  computeOrthogonalTreeLayout,
  isGroupedTreeHierarchyEdge,
  ORTHOGONAL_TREE_SPACING,
  treeOrientationForMode,
  type OrthogonalTreeOrientation,
  type TreeConnectorBranch,
  type TreeConnectorGroup,
  type TreeConnectorModel,
} from "./tree-layout";

export type { LayoutMode };
export {
  getNodeDimensions,
  getNodeRect,
  nodePositionFromTopLeft,
  createNodeRect,
  rectsOverlap,
  resizeAroundAnchor,
  sizeOf,
  type NodeRect,
} from "./geometry";

export interface LayoutOptions {
  /** When set, only this node's subtree is arranged; the root stays fixed. */
  rootId?: string;
}

type Pos = { x: number; y: number };
export type LayoutPlacement = Pos & { width?: number; height?: number };
type Positions = Record<string, LayoutPlacement>;
type Side = "top" | "right" | "bottom" | "left";

// Content-aware clearances. These leave routing corridors between levels while
// avoiding the oversized empty bands that made structured layouts feel sparse.
const MIN_NODE_PADDING_X = 64;
const MIN_NODE_PADDING_Y = 40;
const RADIAL_LEVEL_GAP = 230;
const LINEAR_GAP = 84;

const DEFAULT_W = 180;

/** Keep React Flow's resizer fields and the persisted CSS size in sync. */
export function synchronizeNodeDimensions<NodeType extends Node>(
  node: NodeType,
  width: number,
  height: number
): NodeType {
  return {
    ...node,
    width,
    height,
    measured: { ...(node.measured ?? {}), width, height },
    style: { ...(node.style ?? {}), width, height },
  };
}

/**
 * Set a programmatic size and discard stale React Flow measurements so the DOM
 * is measured again from the new persisted style.
 */
export function resetNodeDimensions<NodeType extends Node>(
  node: NodeType,
  width: number,
  height: number
): NodeType {
  return {
    ...node,
    width: undefined,
    height: undefined,
    measured: undefined,
    style: { ...(node.style ?? {}), width, height },
  };
}
function rectsTooClose(a: NodeRect, b: NodeRect, padX: number, padY: number): boolean {
  return (
    a.x - padX < b.x + b.width &&
    a.x + a.width + padX > b.x &&
    a.y - padY < b.y + b.height &&
    a.y + a.height + padY > b.y
  );
}

function centerOf(node: Node): Pos {
  const rect = getNodeRect(node);
  return { x: rect.centerX, y: rect.centerY };
}

// -- Collision resolution (structure-preserving, axis-constrained) ------------
// Pushes overlapping nodes apart along a single axis so the layout's primary
// structure (rows/columns) is preserved.

function resolveCollisions(
  positions: Positions,
  byId: Map<string, Node>,
  axis: "x" | "y",
  padX = MIN_NODE_PADDING_X,
  padY = MIN_NODE_PADDING_Y,
  iterations = 24
): void {
  const ids = Object.keys(positions);
  const rect = (id: string): NodeRect => {
    const { w, h } = sizeOf(byId.get(id)!);
    return createNodeRect(
      id,
      positions[id].x,
      positions[id].y,
      positions[id].width ?? w,
      positions[id].height ?? h
    );
  };
  for (let it = 0; it < iterations; it++) {
    let moved = false;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = rect(ids[i]);
        const b = rect(ids[j]);
        if (!rectsTooClose(a, b, padX, padY)) continue;
        if (axis === "y") {
          const overlap = Math.min(a.y + a.height + padY, b.y + b.height + padY) - Math.max(a.y, b.y);
          const lower = a.y <= b.y ? ids[j] : ids[i];
          positions[lower].y += overlap;
        } else {
          const overlap = Math.min(a.x + a.width + padX, b.x + b.width + padX) - Math.max(a.x, b.x);
          const right = a.x <= b.x ? ids[j] : ids[i];
          positions[right].x += overlap;
        }
        moved = true;
      }
    }
    if (!moved) break;
  }
}

export function resolveInsertedNodeCollisions(
  nodes: Node[],
  insertedId: string,
  padX = MIN_NODE_PADDING_X,
  padY = MIN_NODE_PADDING_Y
): Positions {
  const inserted = nodes.find((n) => n.id === insertedId);
  if (!inserted) return {};

  const initial = getNodeRect(inserted);
  const obstacles = nodes
    .filter((node) => node.id !== insertedId && !node.hidden)
    .map(getNodeRect);
  const isFree = (left: number, top: number) => {
    const candidate = createNodeRect(insertedId, left, top, initial.width, initial.height);
    return obstacles.every((obstacle) => !rectsTooClose(candidate, obstacle, padX, padY));
  };
  const placement = (left: number, top: number): Positions => {
    if (left === initial.left && top === initial.top) return {};
    return {
      [insertedId]: nodePositionFromTopLeft(
        inserted,
        { x: left, y: top },
        { width: initial.width, height: initial.height }
      ),
    };
  };

  if (isFree(initial.left, initial.top)) return {};

  const stepX = initial.width + padX;
  const stepY = initial.height + padY;
  const directions = [
    [0, 1], [1, 0], [-1, 0], [0, -1],
    [1, 1], [-1, 1], [1, -1], [-1, -1],
  ] as const;
  for (let ring = 1; ring <= 20; ring += 1) {
    for (const [dx, dy] of directions) {
      const left = initial.left + dx * stepX * ring;
      const top = initial.top + dy * stepY * ring;
      if (isFree(left, top)) return placement(left, top);
    }
  }

  // Deterministic final fallback below all existing content.
  const top = Math.max(initial.top, ...obstacles.map((obstacle) => obstacle.bottom + padY));
  return placement(initial.left, top);
}

// -- Radial with per-depth radius sized to fit all nodes on the ring ----------

function radialTree(rootId: string, hierarchy: Hierarchy, byId: Map<string, Node>): Positions {
  const centers: Positions = { [rootId]: { x: 0, y: 0 } };

  // Leaf counts drive angular allocation.
  const leaves = new Map<string, number>();
  const calcLeaves = (id: string): number => {
    const kids = hierarchy.get(id)?.childIds ?? [];
    if (!kids.length) { leaves.set(id, 1); return 1; }
    let s = 0;
    for (const c of kids) s += calcLeaves(c);
    leaves.set(id, s);
    return s;
  };
  calcLeaves(rootId);

  // Nodes + max node size per depth -> radius large enough to avoid overlap.
  const depthNodes = new Map<number, string[]>();
  const collect = (id: string, depth: number) => {
    if (!depthNodes.has(depth)) depthNodes.set(depth, []);
    depthNodes.get(depth)!.push(id);
    for (const c of hierarchy.get(id)?.childIds ?? []) collect(c, depth + 1);
  };
  collect(rootId, 0);

  const radiusAt = new Map<number, number>();
  radiusAt.set(0, 0);
  const maxDepth = Math.max(...depthNodes.keys());
  for (let d = 1; d <= maxDepth; d++) {
    const ids = depthNodes.get(d) ?? [];
    const maxCross = Math.max(...ids.map((id) => sizeOf(byId.get(id)!).w), DEFAULT_W);
    // Circumference must fit all nodes with padding.
    const needed = (ids.length * (maxCross + MIN_NODE_PADDING_X)) / (2 * Math.PI);
    radiusAt.set(d, Math.max(d * RADIAL_LEVEL_GAP, needed, (radiusAt.get(d - 1) ?? 0) + RADIAL_LEVEL_GAP));
  }

  const place = (id: string, a0: number, a1: number, depth: number) => {
    const kids = hierarchy.get(id)?.childIds ?? [];
    if (!kids.length) return;
    const total = leaves.get(id) ?? kids.length;
    let a = a0;
    for (const c of kids) {
      const frac = (leaves.get(c) ?? 1) / total;
      const start = a;
      const end = a + (a1 - a0) * frac;
      const mid = (start + end) / 2;
      const r = radiusAt.get(depth) ?? depth * RADIAL_LEVEL_GAP;
      centers[c] = { x: Math.cos(mid) * r, y: Math.sin(mid) * r };
      place(c, start, end, depth + 1);
      a = end;
    }
  };
  place(rootId, -Math.PI / 2, Math.PI * 1.5, 1);
  return centers;
}

// -- Center coords -> top-left, anchored so the root stays fixed ---------------

function centersToPositions(centers: Positions, rootId: string, byId: Map<string, Node>): Positions {
  const rootNode = byId.get(rootId)!;
  const rootCenter = centerOf(rootNode);
  const rc = centers[rootId] ?? { x: 0, y: 0 };
  const out: Positions = {};
  for (const [id, c] of Object.entries(centers)) {
    const { w, h } = sizeOf(byId.get(id)!);
    out[id] = {
      x: rootCenter.x + (c.x - rc.x) - w / 2,
      y: rootCenter.y + (c.y - rc.y) - h / 2,
    };
  }
  return out;
}

// -- Public: compute positions ------------------------------------------------

export function computeLayout(
  nodes: Node[],
  edges: Edge[],
  mode: LayoutMode,
  options: LayoutOptions = {}
): Positions {
  if (mode === "freeForm") return {};
  if (!nodes.length) return {};

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const hierarchy = buildHierarchy(nodes, edges);
  const roots = options.rootId && byId.has(options.rootId) ? [options.rootId] : getRoots(hierarchy);
  if (!roots.length) return {};

  const result: Positions = {};

  for (const root of roots) {
    const subtree = getSubtree(root, hierarchy);
    const lone = subtree.length === 1;
    const rootNode = byId.get(root)!;
    const rootCenter = centerOf(rootNode);

    if (mode === "horizontal" || mode === "vertical" || mode === "topDown") {
      if (lone) continue;
      const pos = computeOrthogonalTreeLayout(
        root,
        hierarchy,
        byId,
        mode === "horizontal" ? "horizontal" : "vertical"
      );
      Object.assign(result, pos);
    } else if (mode === "radial" || mode === "fromParentFreeForm") {
      if (lone) continue;
      const centers = radialTree(root, hierarchy, byId);
      const pos = centersToPositions(centers, root, byId);
      resolveCollisions(pos, byId, "y");
      Object.assign(result, pos);
    } else if (mode === "list") {
      Object.assign(result, computeListLayout(root, hierarchy, byId));
    } else if (mode === "linear") {
      const order = getSubtree(root, hierarchy);
      let x = rootNode.position.x;
      for (const id of order) {
        const { w, h } = sizeOf(byId.get(id)!);
        result[id] = { x, y: rootCenter.y - h / 2 };
        x += w + LINEAR_GAP;
      }
      resolveCollisions(result, byId, "x");
    } else if (mode === "matrix") {
      Object.assign(result, computeMatrixLayout(root, hierarchy, byId).placements);
    }
  }

  return result;
}

// -- Layout-aware edge routing metadata ---------------------------------------

export interface EdgeRoute {
  sourceHandle: Side;
  targetHandle: Side;
  curveStyle: "smooth" | "step" | "straight";
}

function opposite(side: Side): Side {
  return side === "top" ? "bottom" : side === "bottom" ? "top" : side === "left" ? "right" : "left";
}

function nearestSides(a: Node, b: Node): { source: Side; target: Side } {
  const ca = centerOf(a);
  const cb = centerOf(b);
  const dx = cb.x - ca.x;
  const dy = cb.y - ca.y;
  const source: Side = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? "right" : "left") : (dy >= 0 ? "bottom" : "top");
  return { source, target: opposite(source) };
}

export function routeForMode(mode: LayoutMode, parent: Node, child: Node): EdgeRoute {
  switch (mode) {
    case "horizontal":
      return { sourceHandle: "right", targetHandle: "left", curveStyle: "step" };
    case "vertical":
    case "topDown":
      return { sourceHandle: "bottom", targetHandle: "top", curveStyle: "step" };
    case "list":
      return { sourceHandle: "right", targetHandle: "left", curveStyle: "step" };
    case "matrix": {
      const { source, target } = nearestSides(parent, child);
      return { sourceHandle: source, targetHandle: target, curveStyle: "step" };
    }
    case "linear": {
      const { source, target } = nearestSides(parent, child);
      return { sourceHandle: source, targetHandle: target, curveStyle: "step" };
    }
    case "radial":
    case "fromParentFreeForm":
    case "freeForm":
    default: {
      const { source, target } = nearestSides(parent, child);
      return { sourceHandle: source, targetHandle: target, curveStyle: "smooth" };
    }
  }
}

export function assignDefaultHandles(nodes: Node[], edges: Edge[]): Edge[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let changed = false;
  const next = edges.map((e) => {
    if (e.sourceHandle && e.targetHandle) return e;
    const s = byId.get(e.source);
    const t = byId.get(e.target);
    if (!s || !t) return e;
    const { source, target } = nearestSides(s, t);
    changed = true;
    return { ...e, sourceHandle: e.sourceHandle ?? source, targetHandle: e.targetHandle ?? target };
  });
  return changed ? next : edges;
}

// -- Panel metadata ------------------------------------------------------------

export interface LayoutOption { mode: LayoutMode; label: string; description: string }

export const LAYOUT_OPTIONS: LayoutOption[] = [
  { mode: "fromParentFreeForm", label: "From Parent (Free Form)", description: "Radial spread from the selected node" },
  { mode: "freeForm",   label: "Free Form",  description: "Leave nodes where they are" },
  { mode: "horizontal", label: "Horizontal", description: "Tree grows left to right" },
  { mode: "vertical",   label: "Vertical",   description: "Balanced tree fanning down" },
  { mode: "list",       label: "List",       description: "Indented outline" },
  { mode: "linear",     label: "Linear",     description: "Single connected line" },
  { mode: "radial",     label: "Radial",     description: "Hierarchy-aware sunburst" },
  { mode: "matrix",     label: "Matrix",     description: "Structured chart / table" },
];
