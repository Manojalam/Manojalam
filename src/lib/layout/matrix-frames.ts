import type { Node } from "@xyflow/react";
import { createNodeRect, getNodeRect, type NodeRect } from "./geometry";
import {
  MATRIX_DIVISION_FRAME_BORDER_WIDTH,
  matrixCellDivisionPadding,
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

/** Builds the Matrix enclosure plus a separate division around every allocated cell. */
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
  if (rootData.matrixGridVisible === false) return frames;

  const divisionPadding = matrixCellDivisionPadding(rootData.matrixDensity);
  for (const cell of scopedNodes) {
    const bounds = enclosingRect([cell], divisionPadding);
    if (!bounds) continue;
    const colors = visualColors(cell);
    frames.push(matrixFrameNode(
      `matrix-cell-division-${rootId}-${cell.id}`,
      rootId,
      bounds,
      colors.borderColor ?? rootColors.borderColor ?? "#334155",
      "transparent",
      -2,
      cell.id
    ));
  }

  return frames;
}
