import type { Node } from "@xyflow/react";
import { createNodeRect, getNodeRect, type NodeRect } from "./geometry";
import {
  MATRIX_GRID_STROKE_WIDTH,
  matrixCellDivisionPadding,
} from "./matrix-presentation";
import type { FrameNodeData, MatrixGeneratedEmptySlot } from "../types";

type MatrixGridLine = NonNullable<FrameNodeData["matrixGridLines"]>[number];
type AxisSegment = { position: number; start: number; end: number };
const GRID_ALIGNMENT_TOLERANCE = 0.5;

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

function generatedEmptySlotNodes(
  root: Node | undefined,
  slots: readonly MatrixGeneratedEmptySlot[]
): Node[] {
  if (!root || !slots.length) return [];
  const rootRect = matrixPresentationRect(root);
  return slots.flatMap((slot, index) => {
    if (
      ![slot.x, slot.y, slot.width, slot.height].every(Number.isFinite)
      || slot.width <= 0
      || slot.height <= 0
    ) return [];
    return [{
      id: `matrix-empty-slot-${root.id}-${index}`,
      type: "frame",
      position: {
        x: rootRect.left + slot.x,
        y: rootRect.top + slot.y,
      },
      data: {},
      style: { width: slot.width, height: slot.height },
      selectable: false,
      draggable: false,
    } satisfies Node];
  });
}

function mergeAxisSegments(segments: readonly AxisSegment[]): AxisSegment[] {
  const groups = new Map<number, Array<{ start: number; end: number }>>();
  for (const segment of segments) {
    const position = Math.round(segment.position * 2) / 2;
    groups.set(position, [
      ...(groups.get(position) ?? []),
      {
        start: Math.min(segment.start, segment.end),
        end: Math.max(segment.start, segment.end),
      },
    ]);
  }

  const merged: AxisSegment[] = [];
  for (const [position, intervals] of groups) {
    const ordered = [...intervals].sort((a, b) => a.start - b.start || a.end - b.end);
    let current = ordered[0];
    for (const interval of ordered.slice(1)) {
      if (interval.start <= current.end + GRID_ALIGNMENT_TOLERANCE) {
        current = { start: current.start, end: Math.max(current.end, interval.end) };
      } else {
        merged.push({ position, ...current });
        current = interval;
      }
    }
    merged.push({ position, ...current });
  }
  return merged;
}

function rangesOverlap(
  firstStart: number,
  firstEnd: number,
  secondStart: number,
  secondEnd: number
): boolean {
  return Math.min(firstEnd, secondEnd) - Math.max(firstStart, secondStart)
    > GRID_ALIGNMENT_TOLERANCE;
}

/**
 * Resolve the rectangular grid cell surrounding one inset Matrix shape.
 * Facing sides meet halfway across any custom gap, while exposed sides retain
 * the normal density-aware inset. This produces one shared divider instead of
 * two parallel outlines and still preserves every authored cell boundary.
 */
function matrixDivisionRect(
  rect: NodeRect,
  rects: readonly NodeRect[],
  bounds: NodeRect,
  padding: number
): Pick<NodeRect, "left" | "top" | "right" | "bottom"> {
  const horizontalPeers = rects.filter((candidate) =>
    candidate.id !== rect.id
    && rangesOverlap(rect.top, rect.bottom, candidate.top, candidate.bottom)
  );
  const verticalPeers = rects.filter((candidate) =>
    candidate.id !== rect.id
    && rangesOverlap(rect.left, rect.right, candidate.left, candidate.right)
  );
  const leftNeighborEdge = Math.max(
    ...horizontalPeers
      .filter((candidate) => candidate.right <= rect.left + GRID_ALIGNMENT_TOLERANCE)
      .map((candidate) => candidate.right),
    Number.NEGATIVE_INFINITY
  );
  const rightNeighborEdge = Math.min(
    ...horizontalPeers
      .filter((candidate) => candidate.left >= rect.right - GRID_ALIGNMENT_TOLERANCE)
      .map((candidate) => candidate.left),
    Number.POSITIVE_INFINITY
  );
  const topNeighborEdge = Math.max(
    ...verticalPeers
      .filter((candidate) => candidate.bottom <= rect.top + GRID_ALIGNMENT_TOLERANCE)
      .map((candidate) => candidate.bottom),
    Number.NEGATIVE_INFINITY
  );
  const bottomNeighborEdge = Math.min(
    ...verticalPeers
      .filter((candidate) => candidate.top >= rect.bottom - GRID_ALIGNMENT_TOLERANCE)
      .map((candidate) => candidate.top),
    Number.POSITIVE_INFINITY
  );

  return {
    left: Number.isFinite(leftNeighborEdge)
      ? (leftNeighborEdge + rect.left) / 2
      : Math.max(bounds.left, rect.left - padding),
    right: Number.isFinite(rightNeighborEdge)
      ? (rect.right + rightNeighborEdge) / 2
      : Math.min(bounds.right, rect.right + padding),
    top: Number.isFinite(topNeighborEdge)
      ? (topNeighborEdge + rect.top) / 2
      : Math.max(bounds.top, rect.top - padding),
    bottom: Number.isFinite(bottomNeighborEdge)
      ? (rect.bottom + bottomNeighborEdge) / 2
      : Math.min(bounds.bottom, rect.bottom + padding),
  };
}

function matrixGridLines(
  scopedNodes: readonly Node[],
  bounds: NodeRect,
  padding: number
): MatrixGridLine[] {
  const rects = scopedNodes.map(matrixPresentationRect);
  const vertical: AxisSegment[] = [];
  const horizontal: AxisSegment[] = [];
  for (const rect of rects) {
    const division = matrixDivisionRect(rect, rects, bounds, padding);
    vertical.push(
      { position: division.left, start: division.top, end: division.bottom },
      { position: division.right, start: division.top, end: division.bottom }
    );
    horizontal.push(
      { position: division.top, start: division.left, end: division.right },
      { position: division.bottom, start: division.left, end: division.right }
    );
  }

  const internalVertical = mergeAxisSegments(vertical)
    .filter((line) =>
      Math.abs(line.position - bounds.left) > GRID_ALIGNMENT_TOLERANCE
      && Math.abs(line.position - bounds.right) > GRID_ALIGNMENT_TOLERANCE
    )
    .map<MatrixGridLine>((line) => ({
      x1: line.position - bounds.left,
      y1: line.start - bounds.top,
      x2: line.position - bounds.left,
      y2: line.end - bounds.top,
    }));
  const internalHorizontal = mergeAxisSegments(horizontal)
    .filter((line) =>
      Math.abs(line.position - bounds.top) > GRID_ALIGNMENT_TOLERANCE
      && Math.abs(line.position - bounds.bottom) > GRID_ALIGNMENT_TOLERANCE
    )
    .map<MatrixGridLine>((line) => ({
      x1: line.start - bounds.left,
      y1: line.position - bounds.top,
      x2: line.end - bounds.left,
      y2: line.position - bounds.top,
    }));
  return [...internalHorizontal, ...internalVertical];
}

/** Builds one flat Matrix table grid with complete, de-duplicated cell edges. */
export function buildMatrixFrameNodes(
  scopedNodes: readonly Node[],
  rootId: string
): Node[] {
  if (!scopedNodes.length) return [];
  const byId = new Map(scopedNodes.map((node) => [node.id, node]));
  const root = byId.get(rootId);
  const rootData = (root?.data ?? {}) as Record<string, unknown>;
  const storedEmptySlots = Array.isArray(rootData.matrixEmptySlots)
    ? rootData.matrixEmptySlots as MatrixGeneratedEmptySlot[]
    : [];
  const emptySlotNodes = generatedEmptySlotNodes(root, storedEmptySlots);
  const presentationNodes = [...scopedNodes, ...emptySlotNodes];
  const rootColors = visualColors(root);
  const gridPadding = matrixCellDivisionPadding(rootData.matrixDensity);
  const outerBounds = enclosingRect(presentationNodes, gridPadding);
  if (!outerBounds) return [];
  const lines = root && rootData.matrixGridVisible !== false
    ? matrixGridLines(presentationNodes, outerBounds, gridPadding)
    : [];
  return [{
    id: `matrix-frame-${rootId}`,
    type: "frame",
    position: { x: outerBounds.left, y: outerBounds.top },
    data: {
      title: "",
      color: rootColors.borderColor ?? "#334155",
      background: rootColors.fillColor
        ? `color-mix(in srgb, ${rootColors.fillColor} 2%, transparent)`
        : "rgba(15, 23, 42, 0.01)",
      borderStyle: "solid",
      borderWidth: MATRIX_GRID_STROKE_WIDTH,
      locked: true,
      matrixFrameFor: rootId,
      matrixGridLines: lines,
      tags: [],
    },
    style: { width: outerBounds.width, height: outerBounds.height },
    zIndex: -10,
    selectable: false,
    draggable: false,
  }];
}
