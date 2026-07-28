import type { Node } from "@xyflow/react";
import type { LayoutMode } from "../types";
import { getNodeRect, type NodeRect } from "./geometry";
import { getSubtree, type Hierarchy } from "./hierarchy";
import { computeListRootTopPlacement, type ListPlacements } from "./list-layout";
import { ORTHOGONAL_TREE_SPACING } from "./tree-layout";

type PackingAxis = "x" | "y";

interface OuterPacking {
  axis: PackingAxis;
  gap: number;
}

/** Short breathing room between an outer parent and its finished Matrix branch. */
export const NESTED_MATRIX_PARENT_GAP = 24;

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

function combinedSubtreeBounds(
  rootIds: string[],
  hierarchy: Hierarchy,
  byId: Map<string, Node>
): NodeRect | null {
  const bounds = rootIds.flatMap((rootId) => subtreeBounds(rootId, hierarchy, byId) ?? []);
  if (!bounds.length) return null;
  const left = Math.min(...bounds.map((rect) => rect.left));
  const top = Math.min(...bounds.map((rect) => rect.top));
  const right = Math.max(...bounds.map((rect) => rect.right));
  const bottom = Math.max(...bounds.map((rect) => rect.bottom));
  return {
    id: "nested-matrix-child-band",
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

function alignOuterParentToChildBand(
  nodes: Node[],
  hierarchy: Hierarchy,
  parentId: string,
  childIds: string[],
  packing: OuterPacking
): Node[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const parent = byId.get(parentId);
  const childBand = combinedSubtreeBounds(childIds, hierarchy, byId);
  if (!parent || !childBand) return nodes;

  const parentMode = ((parent.data ?? {}) as Record<string, unknown>).layoutMode as LayoutMode | undefined;
  if (parentMode === "list") {
    const placements: ListPlacements = Object.fromEntries(
      nodes.map((node) => [node.id, { ...node.position }])
    );
    const placement = computeListRootTopPlacement(parentId, hierarchy, byId, placements);
    if (
      !placement
      || (
        Math.abs(parent.position.x - placement.x) <= 0.5
        && Math.abs(parent.position.y - placement.y) <= 0.5
      )
    ) return nodes;
    return nodes.map((node) => node.id === parentId
      ? { ...node, position: placement }
      : node);
  }

  const parentRect = getNodeRect(parent);
  const targetLeft = packing.axis === "x"
    ? childBand.centerX - parentRect.width / 2
    : childBand.left - NESTED_MATRIX_PARENT_GAP - parentRect.width;
  const targetTop = packing.axis === "x"
    ? childBand.top - NESTED_MATRIX_PARENT_GAP - parentRect.height
    : childBand.centerY - parentRect.height / 2;
  const delta = {
    x: targetLeft - parentRect.left,
    y: targetTop - parentRect.top,
  };
  if (Math.abs(delta.x) <= 0.5 && Math.abs(delta.y) <= 0.5) return nodes;

  return nodes.map((node) => node.id === parentId
    ? {
        ...node,
        position: {
          x: node.position.x + delta.x,
          y: node.position.y + delta.y,
        },
      }
    : node);
}

/**
 * A nested Matrix can become wider or taller without changing its outer
 * hierarchy. Repack following sibling subtrees to the exact generated gap,
 * then align the outer parent with the finished child band. This keeps the
 * parent close enough for the hierarchy connector to use only a short,
 * straight segment.
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
  if (!parentId || !packing || !matrixBounds || matrixIndex < 0) return nodes;

  const deltas = new Map<string, { x: number; y: number }>();
  let cursor = packing.axis === "x" ? matrixBounds.right : matrixBounds.bottom;
  for (const siblingId of siblingIds.slice(matrixIndex + 1)) {
    const bounds = subtreeBounds(siblingId, hierarchy, byId);
    if (!bounds) continue;
    const start = packing.axis === "x" ? bounds.left : bounds.top;
    const delta = cursor + packing.gap - start;
    const branchIds = new Set(getSubtree(siblingId, hierarchy));
    if (Math.abs(delta) > 0.5) {
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
  const packedNodes = !deltas.size ? nodes : nodes.map((node) => {
    const delta = deltas.get(node.id);
    return delta
      ? { ...node, position: { x: node.position.x + delta.x, y: node.position.y + delta.y } }
      : node;
  });
  return alignOuterParentToChildBand(
    packedNodes,
    hierarchy,
    parentId,
    siblingIds,
    packing
  );
}
