import type { Node } from "@xyflow/react";
import { createNodeRect, getNodeRect, type NodeRect } from "./geometry";
import {
  MATRIX_GRID_STROKE_WIDTH,
  matrixCellDivisionPadding,
} from "./matrix-presentation";
import type { FrameNodeData } from "../types";

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

function matrixGridLines(
  scopedNodes: readonly Node[],
  bounds: NodeRect,
  padding: number
): MatrixGridLine[] {
  const vertical: AxisSegment[] = [];
  const horizontal: AxisSegment[] = [];
  for (const node of scopedNodes) {
    const rect = matrixPresentationRect(node);
    const left = rect.left - padding - bounds.left;
    const top = rect.top - padding - bounds.top;
    const right = rect.right + padding - bounds.left;
    const bottom = rect.bottom + padding - bounds.top;
    vertical.push(
      { position: left, start: top, end: bottom },
      { position: right, start: top, end: bottom }
    );
    horizontal.push(
      { position: top, start: left, end: right },
      { position: bottom, start: left, end: right }
    );
  }

  const internalVertical = mergeAxisSegments(vertical)
    .filter((line) =>
      Math.abs(line.position) > GRID_ALIGNMENT_TOLERANCE
      && Math.abs(line.position - bounds.width) > GRID_ALIGNMENT_TOLERANCE
    )
    .map<MatrixGridLine>((line) => ({
      x1: line.position,
      y1: line.start,
      x2: line.position,
      y2: line.end,
    }));
  const internalHorizontal = mergeAxisSegments(horizontal)
    .filter((line) =>
      Math.abs(line.position) > GRID_ALIGNMENT_TOLERANCE
      && Math.abs(line.position - bounds.height) > GRID_ALIGNMENT_TOLERANCE
    )
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
