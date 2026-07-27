import type { Node } from "@xyflow/react";
import { createNodeRect, getNodeRect, type NodeRect } from "./geometry";
import {
  MATRIX_GRID_STROKE_WIDTH,
  matrixCellDivisionPadding,
} from "./matrix-presentation";
import type { FrameNodeData } from "../types";

type MatrixGridLine = NonNullable<FrameNodeData["matrixGridLines"]>[number];
type AxisSegment = { position: number; start: number; end: number };
type Interval = { start: number; end: number };
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

function subtractIntervals(base: Interval, exclusions: readonly Interval[]): Interval[] {
  let remaining = [base];
  for (const exclusion of exclusions) {
    remaining = remaining.flatMap((interval) => {
      const start = Math.max(interval.start, exclusion.start);
      const end = Math.min(interval.end, exclusion.end);
      if (end - start <= GRID_ALIGNMENT_TOLERANCE) return [interval];
      return [
        ...(start - interval.start > GRID_ALIGNMENT_TOLERANCE
          ? [{ start: interval.start, end: start }]
          : []),
        ...(interval.end - end > GRID_ALIGNMENT_TOLERANCE
          ? [{ start: end, end: interval.end }]
          : []),
      ];
    });
  }
  return remaining;
}

function matrixGridLines(
  scopedNodes: readonly Node[],
  bounds: NodeRect,
  padding: number
): MatrixGridLine[] {
  const rects = scopedNodes.map(matrixPresentationRect);
  const vertical: AxisSegment[] = [];
  const horizontal: AxisSegment[] = [];
  for (const first of rects) {
    for (const second of rects) {
      if (first.id === second.id) continue;

      if (first.bottom <= second.top + GRID_ALIGNMENT_TOLERANCE) {
        const shared = {
          start: Math.max(first.left - padding, second.left - padding),
          end: Math.min(first.right + padding, second.right + padding),
        };
        if (shared.end - shared.start > GRID_ALIGNMENT_TOLERANCE) {
          const blockers = rects
            .filter((candidate) =>
              candidate.id !== first.id
              && candidate.id !== second.id
              && candidate.top < second.top - GRID_ALIGNMENT_TOLERANCE
              && candidate.bottom > first.bottom + GRID_ALIGNMENT_TOLERANCE
            )
            .map((candidate) => ({
              start: candidate.left - padding,
              end: candidate.right + padding,
            }));
          for (const interval of subtractIntervals(shared, blockers)) {
            horizontal.push({
              position: (first.bottom + second.top) / 2 - bounds.top,
              start: interval.start - bounds.left,
              end: interval.end - bounds.left,
            });
          }
        }
      }

      if (first.right <= second.left + GRID_ALIGNMENT_TOLERANCE) {
        const shared = {
          start: Math.max(first.top - padding, second.top - padding),
          end: Math.min(first.bottom + padding, second.bottom + padding),
        };
        if (shared.end - shared.start > GRID_ALIGNMENT_TOLERANCE) {
          const blockers = rects
            .filter((candidate) =>
              candidate.id !== first.id
              && candidate.id !== second.id
              && candidate.left < second.left - GRID_ALIGNMENT_TOLERANCE
              && candidate.right > first.right + GRID_ALIGNMENT_TOLERANCE
            )
            .map((candidate) => ({
              start: candidate.top - padding,
              end: candidate.bottom + padding,
            }));
          for (const interval of subtractIntervals(shared, blockers)) {
            vertical.push({
              position: (first.right + second.left) / 2 - bounds.left,
              start: interval.start - bounds.top,
              end: interval.end - bounds.top,
            });
          }
        }
      }
    }
  }

  const internalVertical = mergeAxisSegments(vertical)
    .map<MatrixGridLine>((line) => ({
      x1: line.position,
      y1: line.start,
      x2: line.position,
      y2: line.end,
    }));
  const internalHorizontal = mergeAxisSegments(horizontal)
    .map<MatrixGridLine>((line) => ({
      x1: line.start,
      y1: line.position,
      x2: line.end,
      y2: line.position,
    }));
  return [...internalHorizontal, ...internalVertical];
}

/** Builds one flat Matrix table grid with merged-cell-aware separator segments. */
export function buildMatrixFrameNodes(
  scopedNodes: readonly Node[],
  rootId: string
): Node[] {
  if (!scopedNodes.length) return [];
  const byId = new Map(scopedNodes.map((node) => [node.id, node]));
  const root = byId.get(rootId);
  const rootData = (root?.data ?? {}) as Record<string, unknown>;
  const rootColors = visualColors(root);
  const gridPadding = matrixCellDivisionPadding(rootData.matrixDensity);
  const outerBounds = enclosingRect(scopedNodes, gridPadding);
  if (!outerBounds) return [];
  const lines = root && rootData.matrixGridVisible !== false
    ? matrixGridLines(scopedNodes, outerBounds, gridPadding)
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
