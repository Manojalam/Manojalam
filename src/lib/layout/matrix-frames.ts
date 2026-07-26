import type { Node } from "@xyflow/react";
import { createNodeRect, getNodeRect, type NodeRect } from "./geometry";
import {
  MATRIX_DIVISION_FRAME_BORDER_WIDTH,
  matrixDivisionFramePadding,
  matrixFramePadding,
} from "./matrix-presentation";

function matrixPresentationRect(node: Node): NodeRect {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const override = data.layoutSizeOverride as Partial<{
    mode: string;
    width: number;
    height: number;
  }> | undefined;
  if (override?.mode !== "matrix" || !override.width || !override.height) {
    return getNodeRect(node);
  }
  return getNodeRect({
    ...node,
    width: undefined,
    height: undefined,
    measured: undefined,
    style: {
      ...(node.style ?? {}),
      width: override.width,
      height: override.height,
    },
  });
}

function enclosingRect(nodes: readonly Node[], padding: number): NodeRect | null {
  if (!nodes.length) return null;
  const rects = nodes.map(matrixPresentationRect);
  const left = Math.min(...rects.map((rect) => rect.left)) - padding;
  const top = Math.min(...rects.map((rect) => rect.top)) - padding;
  const right = Math.max(...rects.map((rect) => rect.right)) + padding;
  const bottom = Math.max(...rects.map((rect) => rect.bottom)) + padding;
  return createNodeRect(
    "matrix-frame-bounds",
    left,
    top,
    right - left,
    bottom - top
  );
}

function visualColors(node: Node | undefined): { fillColor?: string; borderColor?: string } {
  const data = (node?.data ?? {}) as Record<string, unknown>;
  return (data.layoutVisualStyle ?? {}) as { fillColor?: string; borderColor?: string };
}

function matrixFrameNode(
  id: string,
  rootId: string,
  bounds: NodeRect,
  color: string,
  background: string,
  zIndex: number,
  divisionFor?: string
): Node {
  return {
    id,
    type: "frame",
    position: { x: bounds.left, y: bounds.top },
    data: {
      title: "",
      color,
      background,
      borderStyle: "solid",
      borderWidth: divisionFor ? MATRIX_DIVISION_FRAME_BORDER_WIDTH : undefined,
      locked: true,
      matrixFrameFor: rootId,
      matrixDivisionFor: divisionFor,
      tags: [],
    },
    style: { width: bounds.width, height: bounds.height },
    zIndex,
    selectable: false,
    draggable: false,
  };
}

/**
 * Builds the Matrix enclosure plus nested outlines for every non-leaf branch.
 * A division frame owns the branch label and all of its visible descendants.
 */
export function buildMatrixFrameNodes(
  scopedNodes: readonly Node[],
  rootId: string
): Node[] {
  if (!scopedNodes.length) return [];
  const byId = new Map(scopedNodes.map((node) => [node.id, node]));
  const root = byId.get(rootId);
  const rootData = (root?.data ?? {}) as Record<string, unknown>;
  const rootColors = visualColors(root);
  const outerBounds = enclosingRect(scopedNodes, matrixFramePadding(rootData.matrixDensity));
  if (!outerBounds) return [];

  const frames: Node[] = [
    matrixFrameNode(
      `matrix-frame-${rootId}`,
      rootId,
      outerBounds,
      rootColors.borderColor ?? "#334155",
      rootColors.fillColor
        ? `color-mix(in srgb, ${rootColors.fillColor} 3%, transparent)`
        : "rgba(15, 23, 42, 0.015)",
      -10
    ),
  ];
  if (!root) return frames;

  const childrenByParent = new Map<string, string[]>();
  for (const node of scopedNodes) {
    const parentId = (node.data as { parentId?: unknown } | undefined)?.parentId;
    if (typeof parentId !== "string" || !byId.has(parentId)) continue;
    childrenByParent.set(parentId, [...(childrenByParent.get(parentId) ?? []), node.id]);
  }

  const depthById = new Map<string, number>([[rootId, 0]]);
  const descendantsFor = (ownerId: string): string[] => {
    const descendants: string[] = [];
    const pending = [ownerId];
    const visited = new Set<string>();
    while (pending.length) {
      const nodeId = pending.shift()!;
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);
      descendants.push(nodeId);
      for (const childId of childrenByParent.get(nodeId) ?? []) {
        depthById.set(childId, (depthById.get(nodeId) ?? 0) + 1);
        pending.push(childId);
      }
    }
    return descendants;
  };

  descendantsFor(rootId);
  const divisionOwners = scopedNodes
    .filter((node) => node.id !== rootId && (childrenByParent.get(node.id)?.length ?? 0) > 0)
    .sort((a, b) => (depthById.get(a.id) ?? 0) - (depthById.get(b.id) ?? 0));

  for (const owner of divisionOwners) {
    const depth = depthById.get(owner.id) ?? 1;
    const branchNodes = descendantsFor(owner.id).flatMap((nodeId) => {
      const node = byId.get(nodeId);
      return node ? [node] : [];
    });
    const bounds = enclosingRect(
      branchNodes,
      matrixDivisionFramePadding(rootData.matrixDensity, depth)
    );
    if (!bounds) continue;
    const colors = visualColors(owner);
    frames.push(matrixFrameNode(
      `matrix-division-frame-${rootId}-${owner.id}`,
      rootId,
      bounds,
      colors.borderColor ?? rootColors.borderColor ?? "#334155",
      "transparent",
      Math.min(-2, -10 + depth),
      owner.id
    ));
  }

  return frames;
}
