import type { Node } from "@xyflow/react";
import { getNodeRect, nodePositionFromTopLeft, type Point } from "../layout/geometry";

export const COMPACT_SELECTION_GAP = 28;
export type SelectionAlignment = "left" | "centerX" | "right" | "top" | "centerY" | "bottom";
export type DistributionFailure = "too-few-nodes" | "insufficient-span";

export interface DistributionResult {
  positions: Map<string, Point>;
  gap: number | null;
  failure: DistributionFailure | null;
}

/** Align arbitrary selected nodes by their rendered bounds, including centered origins. */
export function alignSelection(
  nodes: Node[],
  mode: SelectionAlignment
): Map<string, Point> {
  const positions = new Map<string, Point>();
  if (nodes.length < 2) return positions;
  const entries = nodes.map((node) => ({ node, rect: getNodeRect(node) }));
  const left = Math.min(...entries.map(({ rect }) => rect.left));
  const right = Math.max(...entries.map(({ rect }) => rect.right));
  const top = Math.min(...entries.map(({ rect }) => rect.top));
  const bottom = Math.max(...entries.map(({ rect }) => rect.bottom));
  const centerX = (left + right) / 2;
  const centerY = (top + bottom) / 2;

  for (const { node, rect } of entries) {
    const topLeft = { x: rect.left, y: rect.top };
    if (mode === "left") topLeft.x = left;
    if (mode === "centerX") topLeft.x = centerX - rect.width / 2;
    if (mode === "right") topLeft.x = right - rect.width;
    if (mode === "top") topLeft.y = top;
    if (mode === "centerY") topLeft.y = centerY - rect.height / 2;
    if (mode === "bottom") topLeft.y = bottom - rect.height;
    positions.set(node.id, nodePositionFromTopLeft(node, topLeft, rect));
  }
  return positions;
}

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

/**
 * Evenly distribute edge gaps while preserving both outer anchors and every
 * node's position on the orthogonal axis.
 */
export function distributeSelection(
  nodes: Node[],
  axis: "x" | "y"
): DistributionResult {
  const positions = new Map<string, Point>();
  if (nodes.length < 3) return { positions, gap: null, failure: "too-few-nodes" };

  const entries = nodes
    .map((node) => ({ node, rect: getNodeRect(node) }))
    .sort((first, second) => {
      const primary = axis === "x"
        ? first.rect.left - second.rect.left
        : first.rect.top - second.rect.top;
      const secondary = axis === "x"
        ? first.rect.top - second.rect.top
        : first.rect.left - second.rect.left;
      return primary || secondary || first.node.id.localeCompare(second.node.id);
    });
  const firstRect = entries[0].rect;
  const lastRect = entries[entries.length - 1].rect;
  const totalSpan = axis === "x"
    ? lastRect.right - firstRect.left
    : lastRect.bottom - firstRect.top;
  const occupied = entries.reduce(
    (sum, { rect }) => sum + (axis === "x" ? rect.width : rect.height),
    0
  );
  const gap = (totalSpan - occupied) / (entries.length - 1);
  if (!Number.isFinite(gap) || gap < 0) {
    return { positions, gap: null, failure: "insufficient-span" };
  }

  let cursor = axis === "x" ? firstRect.left : firstRect.top;
  entries.forEach(({ node, rect }, index) => {
    if (index === 0 || index === entries.length - 1) {
      positions.set(node.id, { ...node.position });
    } else {
      const topLeft = {
        x: axis === "x" ? cursor : rect.left,
        y: axis === "y" ? cursor : rect.top,
      };
      positions.set(node.id, nodePositionFromTopLeft(node, topLeft, rect));
    }
    cursor += (axis === "x" ? rect.width : rect.height) + gap;
  });

  return { positions, gap, failure: null };
}
