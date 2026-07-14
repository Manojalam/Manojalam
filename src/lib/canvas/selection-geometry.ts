import type { Node } from "@xyflow/react";
import { getNodeRect, nodePositionFromTopLeft, type Point } from "../layout/geometry";

export const COMPACT_SELECTION_GAP = 28;

/** Pack nodes with a fixed edge-to-edge gap while preserving the group center. */
export function compactEqualSpacing(
  nodes: Node[],
  axis: "x" | "y",
  gap = COMPACT_SELECTION_GAP
): Map<string, Point> {
  const positions = new Map<string, Point>();
  if (nodes.length < 2) return positions;
  const safeGap = Math.max(0, gap);
  const entries = nodes
    .map((node) => ({ node, rect: getNodeRect(node) }))
    .sort((first, second) => {
      const primary = axis === "x"
        ? first.rect.centerX - second.rect.centerX
        : first.rect.centerY - second.rect.centerY;
      const secondary = axis === "x"
        ? first.rect.centerY - second.rect.centerY
        : first.rect.centerX - second.rect.centerX;
      return primary || secondary || first.node.id.localeCompare(second.node.id);
    });
  const minimum = Math.min(...entries.map(({ rect }) => axis === "x" ? rect.left : rect.top));
  const maximum = Math.max(...entries.map(({ rect }) => axis === "x" ? rect.right : rect.bottom));
  const occupied = entries.reduce(
    (sum, { rect }) => sum + (axis === "x" ? rect.width : rect.height),
    0
  );
  const packedLength = occupied + safeGap * (entries.length - 1);
  let cursor = (minimum + maximum - packedLength) / 2;

  for (const { node, rect } of entries) {
    const topLeft = {
      x: axis === "x" ? cursor : rect.left,
      y: axis === "y" ? cursor : rect.top,
    };
    positions.set(node.id, nodePositionFromTopLeft(node, topLeft, rect));
    cursor += (axis === "x" ? rect.width : rect.height) + safeGap;
  }
  return positions;
}
