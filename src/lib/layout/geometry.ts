import type { Node } from "@xyflow/react";

export const DEFAULT_NODE_WIDTH = 180;
export const DEFAULT_NODE_HEIGHT = 80;

export interface NodeDimensions {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface RectBounds extends NodeDimensions {
  id: string;
  x: number;
  y: number;
}

export interface NodeRect extends RectBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
  centerX: number;
  centerY: number;
}

export interface OrthogonalSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function positiveDimension(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

export function getNodeDimensions(node: Node): NodeDimensions {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const layoutOverride = data.layoutSizeOverride as Partial<NodeDimensions> | undefined;
  const width = positiveDimension(node.measured?.width)
    ?? positiveDimension(node.width)
    ?? positiveDimension(node.style?.width)
    ?? positiveDimension(layoutOverride?.width)
    ?? positiveDimension(data.width)
    ?? DEFAULT_NODE_WIDTH;
  const height = positiveDimension(node.measured?.height)
    ?? positiveDimension(node.height)
    ?? positiveDimension(node.style?.height)
    ?? positiveDimension(layoutOverride?.height)
    ?? positiveDimension(data.height)
    ?? DEFAULT_NODE_HEIGHT;
  return { width, height };
}

/** Backwards-compatible size shape used throughout existing layout code. */
export function sizeOf(node: Node): { w: number; h: number } {
  const { width, height } = getNodeDimensions(node);
  return { w: width, h: height };
}

export function getNodeRect(node: Node): NodeRect {
  const { width, height } = getNodeDimensions(node);
  const origin = node.origin ?? [0, 0];
  const x = node.position.x - width * origin[0];
  const y = node.position.y - height * origin[1];
  return createNodeRect(node.id, x, y, width, height);
}

export function createNodeRect(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number
): NodeRect {
  return {
    id,
    x,
    y,
    width,
    height,
    left: x,
    right: x + width,
    top: y,
    bottom: y + height,
    centerX: x + width / 2,
    centerY: y + height / 2,
  };
}

export type ResizeAnchor = "top-left" | "center";

/** Return the top-left position for a resized rectangle without mixing coordinate systems. */
export function resizeAroundAnchor(
  oldRect: Pick<NodeRect, "left" | "top" | "centerX" | "centerY">,
  newSize: NodeDimensions,
  anchor: ResizeAnchor
): Point {
  if (anchor === "center") {
    return {
      x: oldRect.centerX - newSize.width / 2,
      y: oldRect.centerY - newSize.height / 2,
    };
  }
  return { x: oldRect.left, y: oldRect.top };
}

/** Convert a normalized top-left rectangle position back to React Flow's node origin. */
export function nodePositionFromTopLeft(
  node: Pick<Node, "origin">,
  topLeft: Point,
  size: NodeDimensions
): Point {
  const origin = node.origin ?? [0, 0];
  return {
    x: topLeft.x + size.width * origin[0],
    y: topLeft.y + size.height * origin[1],
  };
}

export function rectsOverlap(a: RectBounds, b: RectBounds, padding = 0): boolean {
  return (
    a.x - padding < b.x + b.width &&
    a.x + a.width + padding > b.x &&
    a.y - padding < b.y + b.height &&
    a.y + a.height + padding > b.y
  );
}

export function inflateRect(rect: NodeRect, padding: number): NodeRect {
  const x = rect.left - padding;
  const y = rect.top - padding;
  const width = rect.width + padding * 2;
  const height = rect.height + padding * 2;
  return {
    ...rect,
    x,
    y,
    width,
    height,
    left: x,
    right: x + width,
    top: y,
    bottom: y + height,
    centerX: x + width / 2,
    centerY: y + height / 2,
  };
}

export function segmentIntersectsRect(segment: OrthogonalSegment, rect: NodeRect): boolean {
  const minX = Math.min(segment.x1, segment.x2);
  const maxX = Math.max(segment.x1, segment.x2);
  const minY = Math.min(segment.y1, segment.y2);
  const maxY = Math.max(segment.y1, segment.y2);

  if (segment.x1 === segment.x2) {
    return segment.x1 > rect.left && segment.x1 < rect.right && maxY > rect.top && minY < rect.bottom;
  }
  if (segment.y1 === segment.y2) {
    return segment.y1 > rect.top && segment.y1 < rect.bottom && maxX > rect.left && minX < rect.right;
  }
  return false;
}
