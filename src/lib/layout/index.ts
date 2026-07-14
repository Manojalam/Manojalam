import type { Node, Edge } from "@xyflow/react";
import type { LayoutMode } from "@/lib/types";
import { buildHierarchy, getSubtree, getRoots, type Hierarchy } from "./hierarchy";
import { computeListLayout } from "./list-layout";
import { computeMatrixLayout } from "./matrix-layout";
import {
  createNodeRect,
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

export type { LayoutMode };
export {
  getNodeDimensions,
  getNodeRect,
  createNodeRect,
  rectsOverlap,
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

// -- Spacing constants (generous by design - clarity over compactness) --------
const MIN_NODE_PADDING_X = 80;
const MIN_NODE_PADDING_Y = 48;
const LEVEL_GAP_X = 260;
const LEVEL_GAP_Y = 170;
const RADIAL_LEVEL_GAP = 280;
const LINEAR_GAP = 120;

const DEFAULT_W = 180;
const DEFAULT_H = 80;

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
  const { w, h } = sizeOf(node);
  return { x: node.position.x + w / 2, y: node.position.y + h / 2 };
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
  iterations = 8
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

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const positions: Positions = {};
  for (const n of nodes) positions[n.id] = { ...n.position };

  const rect = (id: string): NodeRect => {
    const n = byId.get(id)!;
    const { w, h } = sizeOf(n);
    return createNodeRect(id, positions[id].x, positions[id].y, w, h);
  };

  for (let iteration = 0; iteration < 10; iteration++) {
    let moved = false;
    const anchor = rect(insertedId);
    for (const node of nodes) {
      if (node.id === insertedId) continue;
      const other = rect(node.id);
      if (!rectsTooClose(anchor, other, padX, padY)) continue;
      const pushBelow = other.y + other.height / 2 >= anchor.y + anchor.height / 2;
      if (pushBelow) {
        positions[node.id].y = Math.max(positions[node.id].y, anchor.y + anchor.height + padY);
      } else {
        positions[node.id].y = Math.min(positions[node.id].y, anchor.y - other.height - padY);
      }
      moved = true;
    }
    resolveCollisions(positions, byId, "y", padX, padY, 3);
    if (!moved) break;
  }

  const changed: Positions = {};
  for (const n of nodes) {
    const p = positions[n.id];
    if (p.x !== n.position.x || p.y !== n.position.y) changed[n.id] = p;
  }
  return changed;
}

// -- Tidy tree with adaptive, content-aware level spacing ---------------------
// - Cross axis: leaf cursor packs siblings using real node sizes (no overlap).
// - Main axis: each depth band is offset by the tallest/widest node at that
//   depth + a generous level gap (prevents cross-depth overlap for tall nodes).

function tidyTree(
  rootId: string,
  hierarchy: Hierarchy,
  byId: Map<string, Node>,
  axis: "v" | "h"
): Positions {
  const depthMaxMain = new Map<number, number>();
  const collect = (id: string, depth: number) => {
    const { w, h } = sizeOf(byId.get(id)!);
    const main = axis === "v" ? h : w;
    depthMaxMain.set(depth, Math.max(depthMaxMain.get(depth) ?? 0, main));
    for (const c of hierarchy.get(id)?.childIds ?? []) collect(c, depth + 1);
  };
  collect(rootId, 0);

  const levelGap = axis === "v" ? LEVEL_GAP_Y : LEVEL_GAP_X;
  const maxDepth = Math.max(...depthMaxMain.keys());
  const levelCenter = new Map<number, number>();
  let acc = 0;
  for (let d = 0; d <= maxDepth; d++) {
    const band = depthMaxMain.get(d) ?? (axis === "v" ? DEFAULT_H : DEFAULT_W);
    levelCenter.set(d, acc + band / 2);
    acc += band + levelGap;
  }

  const crossGap = axis === "v" ? MIN_NODE_PADDING_X : MIN_NODE_PADDING_Y;
  const centers: Positions = {};
  let cursor = 0;

  const walk = (id: string, depth: number): number => {
    const { w, h } = sizeOf(byId.get(id)!);
    const crossSize = axis === "v" ? w : h;
    const kids = hierarchy.get(id)?.childIds ?? [];
    let cross: number;
    if (kids.length === 0) {
      cross = cursor + crossSize / 2;
      cursor += crossSize + crossGap;
    } else {
      const cc = kids.map((c) => walk(c, depth + 1));
      cross = (cc[0] + cc[cc.length - 1]) / 2;
    }
    const main = levelCenter.get(depth)!;
    centers[id] = axis === "v" ? { x: cross, y: main } : { x: main, y: cross };
    return cross;
  };
  walk(rootId, 0);
  return centers;
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
      const centers = tidyTree(root, hierarchy, byId, mode === "horizontal" ? "h" : "v");
      const pos = centersToPositions(centers, root, byId);
      // Safety: resolve residual overlaps along the cross axis (keep root fixed).
      resolveCollisions(pos, byId, mode === "horizontal" ? "y" : "x");
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
  { mode: "topDown",    label: "Top Down",   description: "Hierarchy from the top" },
  { mode: "linear",     label: "Linear",     description: "Single connected line" },
  { mode: "radial",     label: "Radial",     description: "Hierarchy-aware sunburst" },
  { mode: "matrix",     label: "Matrix",     description: "Structured chart / table" },
];
