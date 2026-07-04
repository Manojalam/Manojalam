import type { Node, Edge } from "@xyflow/react";
import type { LayoutMode } from "@/lib/types";
import {
  buildHierarchy, getSubtree, getRoots, type Hierarchy,
} from "./hierarchy";

export type { LayoutMode };

export interface LayoutOptions {
  /** When set, only this node's subtree is arranged; the root stays fixed. */
  rootId?: string;
}

type Pos = { x: number; y: number };
type Positions = Record<string, Pos>;
type Side = "top" | "right" | "bottom" | "left";

// ── Spacing constants (flow units) ─────────────────────────────────────────
const NODE_GAP_X = 80;
const NODE_GAP_Y = 56;
const LEVEL_GAP_X = 220;   // horizontal: distance between depth columns
const LEVEL_GAP_Y = 140;   // vertical/top-down: distance between depth rows
const LIST_INDENT = 60;
const LIST_ROW = 20;
const RADIAL_LEVEL_GAP = 240;
const MATRIX_GAP_X = 60;
const MATRIX_GAP_Y = 60;
const LINEAR_GAP = 90;

const DEFAULT_W = 180;
const DEFAULT_H = 80;

function sizeOf(node: Node): { w: number; h: number } {
  const w = (node.measured?.width  ?? (node.style?.width  as number) ?? DEFAULT_W) as number;
  const h = (node.measured?.height ?? (node.style?.height as number) ?? DEFAULT_H) as number;
  return { w, h };
}

function centerOf(node: Node): Pos {
  const { w, h } = sizeOf(node);
  return { x: node.position.x + w / 2, y: node.position.y + h / 2 };
}

// ── Tidy tree (vertical or horizontal growth) with real node sizes ──────────
// Cross-axis packing uses a running cursor over leaf sizes so subtrees never
// overlap; parents are centered over their children.

interface TreeOpts {
  axis: "v" | "h";     // growth direction
  levelGap: number;    // distance between depth levels along the growth axis
  strictRows: boolean; // true → all nodes at a depth share the same main-axis coord
}

function tidyTree(
  rootId: string,
  hierarchy: Hierarchy,
  byId: Map<string, Node>,
  opts: TreeOpts
): Positions {
  const centers: Positions = {}; // center coordinates, root-relative
  let cursor = 0;

  // Precompute per-depth main-axis offset for strict rows.
  const walk = (id: string, depth: number): number => {
    const node = byId.get(id)!;
    const { w, h } = sizeOf(node);
    const crossSize = opts.axis === "v" ? w : h;
    const kids = hierarchy.get(id)?.childIds ?? [];

    let cross: number;
    if (kids.length === 0) {
      cross = cursor + crossSize / 2;
      cursor += crossSize + (opts.axis === "v" ? NODE_GAP_X : NODE_GAP_Y);
    } else {
      const kidCross = kids.map((c) => walk(c, depth + 1));
      cross = (kidCross[0] + kidCross[kidCross.length - 1]) / 2;
    }

    const main = depth * opts.levelGap;
    if (opts.axis === "v") centers[id] = { x: cross, y: main };
    else centers[id] = { x: main, y: cross };
    return cross;
  };

  walk(rootId, 0);
  return centers;
}

// ── Radial: root center, children in angular sectors sized by leaf count ─────

function leafCounts(rootId: string, hierarchy: Hierarchy): Map<string, number> {
  const counts = new Map<string, number>();
  const calc = (id: string): number => {
    const kids = hierarchy.get(id)?.childIds ?? [];
    if (!kids.length) { counts.set(id, 1); return 1; }
    let sum = 0;
    for (const c of kids) sum += calc(c);
    counts.set(id, sum);
    return sum;
  };
  calc(rootId);
  return counts;
}

function radialTree(rootId: string, hierarchy: Hierarchy): Positions {
  const centers: Positions = { [rootId]: { x: 0, y: 0 } };
  const leaves = leafCounts(rootId, hierarchy);

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
      const r = RADIAL_LEVEL_GAP * depth;
      centers[c] = { x: Math.cos(mid) * r, y: Math.sin(mid) * r };
      place(c, start, end, depth + 1);
      a = end;
    }
  };

  place(rootId, -Math.PI / 2, Math.PI * 1.5, 1);
  return centers;
}

// ── Convert center coords → top-left positions, anchored so root stays put ──

function centersToPositions(
  centers: Positions,
  rootId: string,
  byId: Map<string, Node>
): Positions {
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

// ── Public: compute positions ────────────────────────────────────────────────

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
  const roots = options.rootId && byId.has(options.rootId)
    ? [options.rootId]
    : getRoots(hierarchy);
  if (!roots.length) return {};

  const result: Positions = {};

  for (const root of roots) {
    const subtree = getSubtree(root, hierarchy);
    if (subtree.length === 1 && mode !== "matrix" && mode !== "linear" && mode !== "list") {
      continue; // nothing to arrange for a lone node in tree/radial modes
    }
    const rootNode = byId.get(root)!;
    const rootCenter = centerOf(rootNode);
    const { w: rw, h: rh } = sizeOf(rootNode);

    if (mode === "horizontal" || mode === "vertical" || mode === "topDown") {
      const centers = tidyTree(root, hierarchy, byId, {
        axis: mode === "horizontal" ? "h" : "v",
        levelGap: mode === "horizontal" ? LEVEL_GAP_X : LEVEL_GAP_Y,
        strictRows: mode === "topDown",
      });
      Object.assign(result, centersToPositions(centers, root, byId));
    } else if (mode === "radial" || mode === "fromParentFreeForm") {
      const centers = radialTree(root, hierarchy);
      Object.assign(result, centersToPositions(centers, root, byId));
    } else if (mode === "list") {
      let row = 0;
      const seen = new Set<string>();
      const walk = (id: string, depth: number) => {
        if (seen.has(id)) return;
        seen.add(id);
        const { h } = sizeOf(byId.get(id)!);
        result[id] = {
          x: rootNode.position.x + depth * LIST_INDENT,
          y: rootNode.position.y + row * (h + LIST_ROW),
        };
        row++;
        for (const c of hierarchy.get(id)?.childIds ?? []) walk(c, depth + 1);
      };
      walk(root, 0);
    } else if (mode === "linear") {
      const order = getSubtree(root, hierarchy);
      let x = rootNode.position.x;
      for (const id of order) {
        const { w, h } = sizeOf(byId.get(id)!);
        result[id] = { x, y: rootCenter.y - h / 2 };
        x += w + LINEAR_GAP;
      }
    } else if (mode === "matrix") {
      const order = getSubtree(root, hierarchy);
      const maxW = Math.max(...order.map((id) => sizeOf(byId.get(id)!).w), rw);
      const maxH = Math.max(...order.map((id) => sizeOf(byId.get(id)!).h), rh);
      const cols = Math.max(1, Math.ceil(Math.sqrt(order.length)));
      order.forEach((id, i) => {
        const r = Math.floor(i / cols);
        const c = i % cols;
        result[id] = {
          x: rootNode.position.x + c * (maxW + MATRIX_GAP_X),
          y: rootNode.position.y + r * (maxH + MATRIX_GAP_Y),
        };
      });
    }
  }

  return result;
}

// ── Layout-aware edge routing ─────────────────────────────────────────────────

export interface EdgeRoute {
  sourceHandle: Side;
  targetHandle: Side;
  curveStyle: "smooth" | "step" | "straight";
}

function opposite(side: Side): Side {
  return side === "top" ? "bottom" : side === "bottom" ? "top" : side === "left" ? "right" : "left";
}

/** Nearest-side routing based on the vector between two node centers. */
function nearestSides(a: Node, b: Node): { source: Side; target: Side } {
  const ca = centerOf(a);
  const cb = centerOf(b);
  const dx = cb.x - ca.x;
  const dy = cb.y - ca.y;
  let source: Side;
  if (Math.abs(dx) >= Math.abs(dy)) source = dx >= 0 ? "right" : "left";
  else source = dy >= 0 ? "bottom" : "top";
  return { source, target: opposite(source) };
}

/**
 * Compute source/target handle sides + curve style for a parent→child edge
 * under the given layout mode. Uses geometry for dynamic modes.
 */
export function routeForMode(
  mode: LayoutMode,
  parent: Node,
  child: Node
): EdgeRoute {
  switch (mode) {
    case "horizontal":
      return { sourceHandle: "right", targetHandle: "left", curveStyle: "step" };
    case "vertical":
    case "topDown":
      return { sourceHandle: "bottom", targetHandle: "top", curveStyle: "step" };
    case "list":
      return { sourceHandle: "bottom", targetHandle: "left", curveStyle: "step" };
    case "linear": {
      const { source, target } = nearestSides(parent, child);
      return { sourceHandle: source, targetHandle: target, curveStyle: "step" };
    }
    case "radial":
    case "fromParentFreeForm": {
      const { source, target } = nearestSides(parent, child);
      return { sourceHandle: source, targetHandle: target, curveStyle: "smooth" };
    }
    case "matrix":
    case "freeForm":
    default: {
      const { source, target } = nearestSides(parent, child);
      return { sourceHandle: source, targetHandle: target, curveStyle: "smooth" };
    }
  }
}

/**
 * Assign nearest-side handles to any edges that don't have them yet (used when
 * loading old boards so multi-handle nodes render cleanly).
 */
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

// ── Panel metadata ────────────────────────────────────────────────────────────

export interface LayoutOption {
  mode: LayoutMode;
  label: string;
  description: string;
}

export const LAYOUT_OPTIONS: LayoutOption[] = [
  { mode: "fromParentFreeForm", label: "From Parent (Free Form)", description: "Radial spread from the selected node" },
  { mode: "freeForm",   label: "Free Form",  description: "Leave nodes where they are" },
  { mode: "horizontal", label: "Horizontal", description: "Tree grows left to right" },
  { mode: "vertical",   label: "Vertical",   description: "Balanced tree fanning down" },
  { mode: "list",       label: "List",       description: "Indented outline" },
  { mode: "topDown",    label: "Top Down",   description: "Hierarchy from the top" },
  { mode: "linear",     label: "Linear",     description: "Single connected line" },
  { mode: "radial",     label: "Radial",     description: "Concentric rings by depth" },
  { mode: "matrix",     label: "Matrix",     description: "Even grid of the branch" },
];
