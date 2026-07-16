import type { Node } from "@xyflow/react";
import { getNodeRect, nodePositionFromTopLeft, type NodeRect, type Point } from "../layout/geometry";

export const COMPACT_SELECTION_GAP = 28;
export type SelectionAlignment = "left" | "centerX" | "right" | "top" | "centerY" | "bottom";
export type DistributionFailure = "too-few-nodes" | "insufficient-span";

export interface DistributionResult {
  positions: Map<string, Point>;
  gap: number | null;
  failure: DistributionFailure | null;
}

export interface AlignmentSnap {
  dx: number;
  dy: number;
  horizontalGuides: number[];
  verticalGuides: number[];
}

interface AlignmentSnapOptions {
  threshold?: number;
  allowX?: boolean;
  allowY?: boolean;
  centersOnly?: boolean;
}

/** Keep the magnetic alignment target a usable screen size at every zoom. */
export function alignmentSnapThreshold(
  zoom: number,
  screenPixels = 12,
  maxFlowDistance = 48
): number {
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  return Math.min(maxFlowDistance, Math.max(2, screenPixels / safeZoom));
}

/** Quantize one canvas position without involving React Flow's separate drag snap. */
export function snapPointToGrid(point: Point, spacing: number): Point {
  if (!Number.isFinite(spacing) || spacing <= 0) return { ...point };
  return {
    x: Math.round(point.x / spacing) * spacing,
    y: Math.round(point.y / spacing) * spacing,
  };
}

/** Find the nearest edge, center, or touching-edge alignment for a dragged box. */
export function snapRectToAlignment(
  dragged: NodeRect,
  others: NodeRect[],
  options: AlignmentSnapOptions = {}
): AlignmentSnap {
  const threshold = Math.max(0, options.threshold ?? 6);
  let bestXDelta = 0;
  let bestYDelta = 0;
  let bestXDistance = Number.POSITIVE_INFINITY;
  let bestYDistance = Number.POSITIVE_INFINITY;
  let bestXGuide: number | undefined;
  let bestYGuide: number | undefined;
  const considerX = (current: number, target: number) => {
    const delta = target - current;
    const distance = Math.abs(delta);
    if (distance > threshold || distance >= bestXDistance) return;
    bestXDelta = delta;
    bestXDistance = distance;
    bestXGuide = target;
  };
  const considerY = (current: number, target: number) => {
    const delta = target - current;
    const distance = Math.abs(delta);
    if (distance > threshold || distance >= bestYDistance) return;
    bestYDelta = delta;
    bestYDistance = distance;
    bestYGuide = target;
  };

  for (const other of others) {
    if (options.allowX !== false) {
      if (options.centersOnly) {
        considerX(dragged.centerX, other.centerX);
      } else {
        considerX(dragged.left, other.left);
        considerX(dragged.centerX, other.centerX);
        considerX(dragged.right, other.right);
        considerX(dragged.right, other.left);
        considerX(dragged.left, other.right);
      }
    }
    if (options.allowY !== false) {
      if (options.centersOnly) {
        considerY(dragged.centerY, other.centerY);
      } else {
        considerY(dragged.top, other.top);
        considerY(dragged.centerY, other.centerY);
        considerY(dragged.bottom, other.bottom);
        considerY(dragged.bottom, other.top);
        considerY(dragged.top, other.bottom);
      }
    }
  }

  return {
    dx: bestXDelta,
    dy: bestYDelta,
    horizontalGuides: bestYGuide === undefined ? [] : [bestYGuide],
    verticalGuides: bestXGuide === undefined ? [] : [bestXGuide],
  };
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
