import type { Node } from "@xyflow/react";
import type { LayoutMode } from "../types";
import { getNodeRect, type NodeRect } from "./geometry";
import { getSubtree, type Hierarchy } from "./hierarchy";
import { ORTHOGONAL_TREE_SPACING } from "./tree-layout";

type PackingAxis = "x" | "y";

interface OuterPacking {
  axis: PackingAxis;
  gap: number;
}

function outerPackingFor(
  matrixRootId: string,
  hierarchy: Hierarchy,
  byId: Map<string, Node>
): OuterPacking | null {
  const directParentId = hierarchy.get(matrixRootId)?.parentId ?? null;
  let ancestorId = directParentId;
  const seen = new Set<string>();
  while (ancestorId && !seen.has(ancestorId)) {
    seen.add(ancestorId);
    const mode = ((byId.get(ancestorId)?.data ?? {}) as Record<string, unknown>).layoutMode as LayoutMode | undefined;
    if (mode === "vertical" || mode === "topDown") {
      return {
        axis: "x",
        gap: directParentId === ancestorId
          ? ORTHOGONAL_TREE_SPACING.vertical.rootBranchGap
          : ORTHOGONAL_TREE_SPACING.vertical.siblingGap,
      };
    }
    if (mode === "horizontal" || mode === "list") {
      return {
        axis: "y",
        gap: directParentId === ancestorId
          ? ORTHOGONAL_TREE_SPACING.horizontal.rootBranchGap
          : ORTHOGONAL_TREE_SPACING.horizontal.siblingGap,
      };
    }
    if (mode === "linear") {
      return { axis: "x", gap: ORTHOGONAL_TREE_SPACING.horizontal.rootBranchGap };
    }
    if (mode) return null;
    ancestorId = hierarchy.get(ancestorId)?.parentId ?? null;
  }
  return null;
}

function subtreeBounds(
  rootId: string,
  hierarchy: Hierarchy,
  byId: Map<string, Node>
): NodeRect | null {
  const rects = getSubtree(rootId, hierarchy)
    .map((nodeId) => byId.get(nodeId))
    .filter((node): node is Node => !!node && !node.hidden)
    .map(getNodeRect);
  if (!rects.length) return null;
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  return {
    id: rootId,
    x: left,
    y: top,
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
  };
}

/**
 * A nested Matrix can become wider or taller without changing its outer
 * hierarchy. Move only the following sibling subtrees far enough to preserve
 * the outer structured layout's order and spacing.
 */
export function packSiblingsAfterNestedMatrix(
  nodes: Node[],
  hierarchy: Hierarchy,
  matrixRootId: string
): Node[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const parentId = hierarchy.get(matrixRootId)?.parentId ?? null;
  const packing = parentId ? outerPackingFor(matrixRootId, hierarchy, byId) : null;
  const siblingIds = parentId ? hierarchy.get(parentId)?.childIds ?? [] : [];
  const matrixIndex = siblingIds.indexOf(matrixRootId);
  const matrixBounds = matrixIndex >= 0 ? subtreeBounds(matrixRootId, hierarchy, byId) : null;
  if (!packing || !matrixBounds || matrixIndex >= siblingIds.length - 1) return nodes;

  const deltas = new Map<string, { x: number; y: number }>();
  let cursor = packing.axis === "x" ? matrixBounds.right : matrixBounds.bottom;
  for (const siblingId of siblingIds.slice(matrixIndex + 1)) {
    const bounds = subtreeBounds(siblingId, hierarchy, byId);
    if (!bounds) continue;
    const start = packing.axis === "x" ? bounds.left : bounds.top;
    const delta = Math.max(0, cursor + packing.gap - start);
    const branchIds = new Set(getSubtree(siblingId, hierarchy));
    if (delta > 0) {
      for (const nodeId of branchIds) {
        deltas.set(nodeId, packing.axis === "x" ? { x: delta, y: 0 } : { x: 0, y: delta });
      }
      for (const node of nodes) {
        const frameRootId = ((node.data ?? {}) as Record<string, unknown>).matrixFrameFor;
        if (typeof frameRootId === "string" && branchIds.has(frameRootId)) {
          deltas.set(node.id, packing.axis === "x" ? { x: delta, y: 0 } : { x: 0, y: delta });
        }
      }
    }
    cursor = (packing.axis === "x" ? bounds.right : bounds.bottom) + delta;
  }
  if (!deltas.size) return nodes;

  return nodes.map((node) => {
    const delta = deltas.get(node.id);
    return delta
      ? { ...node, position: { x: node.position.x + delta.x, y: node.position.y + delta.y } }
      : node;
  });
}
