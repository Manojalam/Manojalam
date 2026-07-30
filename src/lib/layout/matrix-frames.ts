import type { Node } from "@xyflow/react";
import { createNodeRect, getNodeRect, type NodeRect } from "./geometry";
import {
  MATRIX_GRID_STROKE_WIDTH,
  matrixCellDivisionPadding,
} from "./matrix-presentation";
import {
  getTextStyle,
  resolveFillColor,
} from "../style-utils";
import type {
  FrameNodeData,
  MatrixFoldRepeatedCell,
  MatrixFoldSectionPresentation,
  MatrixGeneratedEmptySlot,
} from "../types";

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

type RepeatedPresentationNode = {
  node: Node;
  source: Node;
  cell: MatrixFoldRepeatedCell;
};

function generatedRepeatedCellNodes(
  root: Node,
  section: MatrixFoldSectionPresentation,
  byId: Map<string, Node>,
  sectionIndex: number
): RepeatedPresentationNode[] {
  const rootRect = matrixPresentationRect(root);
  return section.repeatedCells.flatMap((cell, cellIndex) => {
    const source = byId.get(cell.sourceNodeId);
    if (
      !source
      || ![cell.x, cell.y, cell.width, cell.height].every(Number.isFinite)
      || cell.width <= 0
      || cell.height <= 0
    ) return [];
    return [{
      source,
      cell,
      node: {
        id: `matrix-fold-repeat-${root.id}-${sectionIndex}-${cellIndex}`,
        type: source.type,
        position: {
          x: rootRect.left + cell.x,
          y: rootRect.top + cell.y,
        },
        data: {
          ...(source.data ?? {}),
          layoutSizeOverride: {
            mode: "matrix",
            width: cell.width,
            height: cell.height,
          },
          matrixCell: true,
          matrixCellRole: cell.role,
        },
        style: { ...(source.style ?? {}), width: cell.width, height: cell.height },
        selectable: false,
        draggable: false,
      } satisfies Node,
    }];
  });
}

function repeatedCellText(source: Node): { html?: string; text: string } {
  const data = (source.data ?? {}) as Record<string, unknown>;
  const html = typeof data.richText === "string" && data.richText.trim()
    ? data.richText
    : undefined;
  const text = [
    "text",
    "title",
    "topic",
    "label",
    "devanagari",
    "iast",
    "translation",
    "rule",
  ]
    .map((field) => data[field])
    .find((value): value is string => typeof value === "string" && value.trim().length > 0)
    ?? "";
  return { html, text };
}

function repeatedCellRenderData(
  repeated: RepeatedPresentationNode,
  bounds: NodeRect
): NonNullable<FrameNodeData["matrixRepeatedCells"]>[number] {
  const rect = matrixPresentationRect(repeated.node);
  const data = (repeated.source.data ?? {}) as Record<string, unknown>;
  const background = resolveFillColor(data);
  const textStyle = getTextStyle(data, background);
  const content = repeatedCellText(repeated.source);
  const textAlign = data.textAlign === "left"
    || data.textAlign === "right"
    || data.textAlign === "justify"
    ? data.textAlign
    : "center";
  return {
    key: repeated.node.id,
    role: repeated.cell.role,
    x: rect.left - bounds.left,
    y: rect.top - bounds.top,
    width: rect.width,
    height: rect.height,
    html: content.html,
    text: content.text,
    background,
    color: typeof textStyle.color === "string" ? textStyle.color : undefined,
    fontSize: typeof textStyle.fontSize === "string" ? textStyle.fontSize : undefined,
    fontFamily: typeof textStyle.fontFamily === "string" ? textStyle.fontFamily : undefined,
    fontStyle: typeof textStyle.fontStyle === "string" ? textStyle.fontStyle : undefined,
    fontWeight: typeof textStyle.fontWeight === "string" || typeof textStyle.fontWeight === "number"
      ? textStyle.fontWeight
      : undefined,
    textAlign,
  };
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

function buildMatrixFrameNode(
  root: Node,
  rootId: string,
  presentationNodes: readonly Node[],
  repeatedNodes: readonly RepeatedPresentationNode[],
  frameId: string
): Node | null {
  const rootColors = visualColors(root);
  const rootData = (root.data ?? {}) as Record<string, unknown>;
  const gridPadding = matrixCellDivisionPadding(rootData.matrixDensity);
  const outerBounds = enclosingRect(presentationNodes, gridPadding);
  if (!outerBounds) return null;
  const gridVisible = rootData.matrixGridVisible !== false;
  const outerBorderVisible = rootData.matrixOuterBorderVisible !== false;
  const lines = gridVisible
    ? matrixGridLines(presentationNodes, outerBounds, gridPadding)
    : [];
  return {
    id: frameId,
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
      matrixOuterBorderVisible: outerBorderVisible,
      matrixGridVisible: gridVisible,
      matrixGridLines: lines,
      matrixRepeatedCells: repeatedNodes.map((repeated) =>
        repeatedCellRenderData(repeated, outerBounds)),
      tags: [],
    },
    style: { width: outerBounds.width, height: outerBounds.height },
    zIndex: -10,
    selectable: false,
    draggable: false,
  };
}

/** Builds independent Matrix grids, including presentation-only Fold repetitions. */
export function buildMatrixFrameNodes(
  scopedNodes: readonly Node[],
  rootId: string
): Node[] {
  if (!scopedNodes.length) return [];
  const byId = new Map(scopedNodes.map((node) => [node.id, node]));
  const root = byId.get(rootId);
  if (!root) return [];
  const rootData = (root.data ?? {}) as Record<string, unknown>;
  const storedEmptySlots = Array.isArray(rootData.matrixEmptySlots)
    ? rootData.matrixEmptySlots as MatrixGeneratedEmptySlot[]
    : [];
  const emptySlotNodes = generatedEmptySlotNodes(root, storedEmptySlots);
  const storedFoldSections = Array.isArray(rootData.matrixFoldSections)
    ? rootData.matrixFoldSections as MatrixFoldSectionPresentation[]
    : [];
  if (!storedFoldSections.length) {
    const frame = buildMatrixFrameNode(
      root,
      rootId,
      [...scopedNodes, ...emptySlotNodes],
      [],
      `matrix-frame-${rootId}`
    );
    return frame ? [frame] : [];
  }

  const rootRect = matrixPresentationRect(root);
  return storedFoldSections.flatMap((section, sectionIndex) => {
    if (
      ![section.x, section.y, section.width, section.height].every(Number.isFinite)
      || section.width <= 0
      || section.height <= 0
    ) return [];
    const sectionBounds = createNodeRect(
      `matrix-fold-section-${rootId}-${sectionIndex}`,
      rootRect.left + section.x,
      rootRect.top + section.y,
      section.width,
      section.height
    );
    const insideSection = (node: Node) => {
      const rect = matrixPresentationRect(node);
      return rect.centerX >= sectionBounds.left - GRID_ALIGNMENT_TOLERANCE
        && rect.centerX <= sectionBounds.right + GRID_ALIGNMENT_TOLERANCE
        && rect.centerY >= sectionBounds.top - GRID_ALIGNMENT_TOLERANCE
        && rect.centerY <= sectionBounds.bottom + GRID_ALIGNMENT_TOLERANCE;
    };
    const repeatedNodes = generatedRepeatedCellNodes(root, section, byId, sectionIndex);
    const presentationNodes = [
      ...scopedNodes.filter(insideSection),
      ...emptySlotNodes.filter(insideSection),
      ...repeatedNodes.map((repeated) => repeated.node),
    ];
    const frame = buildMatrixFrameNode(
      root,
      rootId,
      presentationNodes,
      repeatedNodes,
      `matrix-frame-${rootId}-${sectionIndex}`
    );
    return frame ? [frame] : [];
  });
}
