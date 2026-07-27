import type { Node, NodeChange } from "@xyflow/react";
import { getNodeRect, nodePositionFromTopLeft, type NodeRect, type Point } from "../layout/geometry";

export const COMPACT_SELECTION_GAP = 28;
export const COMPACT_COLUMN_GAP = 72;
export type SelectionAlignment = "left" | "centerX" | "right" | "top" | "centerY" | "bottom";
export type DistributionFailure = "too-few-nodes" | "insufficient-span";

export interface ColumnArrangementOptions {
  columnCount: number;
  columnGap?: number;
  rowGap?: number;
}

export interface ColumnArrangementResult {
  positions: Map<string, Point>;
  columns: string[][];
}

export interface RowArrangementOptions {
  rowCount: number;
  columnGap?: number;
  rowGap?: number;
}

export interface RowArrangementResult {
  positions: Map<string, Point>;
  rows: string[][];
}

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

/**
 * React Flow emits one last raw pointer position before onNodeDragStop. Keep
 * the guide-snapped coordinates already stored by onNodeDrag, while still
 * accepting the final dragging=false state.
 */
export function preserveSnappedDragEndPositions(
  changes: NodeChange<Node>[],
  activelyDraggedIds: ReadonlySet<string>
): NodeChange<Node>[] {
  if (!activelyDraggedIds.size) return changes;
  return changes.map((change) => (
    change.type === "position"
      && change.dragging === false
      && activelyDraggedIds.has(change.id)
      ? { id: change.id, type: "position", dragging: false }
      : change
  ));
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
 * Preserve vertical gaps when selected cards grow. Every later card whose
 * rendered bounds substantially overlap a growing card on the x-axis is moved
 * by that card's added height. Growth from multiple selected cards accumulates.
 */
export function pushNodesBelowSelectionGrowth(
  nodes: Node[],
  nextHeights: ReadonlyMap<string, number>,
  minimumHorizontalOverlapRatio = 0.5
): Map<string, Point> {
  const positions = new Map<string, Point>();
  if (!nodes.length || !nextHeights.size) return positions;
  const safeOverlapRatio = Math.max(0, Math.min(1, minimumHorizontalOverlapRatio));
  const entries = nodes.map((node) => ({ node, rect: getNodeRect(node) }));
  const growing = entries.flatMap(({ node, rect }) => {
    const nextHeight = nextHeights.get(node.id);
    const growth = typeof nextHeight === "number" && Number.isFinite(nextHeight)
      ? nextHeight - rect.height
      : 0;
    return growth > 0.5 ? [{ node, rect, growth }] : [];
  });
  if (!growing.length) return positions;

  for (const { node, rect } of entries) {
    let shiftY = 0;
    for (const source of growing) {
      if (source.node.id === node.id || rect.centerY <= source.rect.centerY) continue;
      const overlap = Math.min(rect.right, source.rect.right)
        - Math.max(rect.left, source.rect.left);
      const requiredOverlap = Math.min(rect.width, source.rect.width) * safeOverlapRatio;
      if (overlap + 0.5 < requiredOverlap) continue;
      shiftY += source.growth;
    }
    if (shiftY > 0.5) {
      positions.set(node.id, {
        x: node.position.x,
        y: node.position.y + shiftY,
      });
    }
  }

  return positions;
}

/**
 * Preserve column gaps when selected cards grow wider. Selected cards that
 * substantially overlap on the x-axis are treated as one column, so their
 * growth moves later columns once by only the added column width.
 */
export function pushNodesRightOfSelectionGrowth(
  nodes: Node[],
  nextWidths: ReadonlyMap<string, number>,
  minimumHorizontalOverlapRatio = 0.5
): Map<string, Point> {
  const positions = new Map<string, Point>();
  if (!nodes.length || !nextWidths.size) return positions;
  const safeOverlapRatio = Math.max(0, Math.min(1, minimumHorizontalOverlapRatio));
  const entries = nodes.map((node) => ({ node, rect: getNodeRect(node) }));
  const substantiallyOverlaps = (first: NodeRect, second: NodeRect) => {
    const overlap = Math.min(first.right, second.right) - Math.max(first.left, second.left);
    return overlap + 0.5 >= Math.min(first.width, second.width) * safeOverlapRatio;
  };
  const growing = entries.flatMap(({ node, rect }) => {
    const nextWidth = nextWidths.get(node.id);
    if (typeof nextWidth !== "number" || !Number.isFinite(nextWidth) || nextWidth <= rect.width + 0.5) {
      return [];
    }
    const nextRect = getNodeRect({
      ...node,
      width: undefined,
      measured: undefined,
      style: { ...(node.style ?? {}), width: nextWidth, height: rect.height },
    });
    return [{ node, rect, nextRect }];
  });
  if (!growing.length) return positions;

  const sourceColumns: typeof growing[] = [];
  for (const source of growing) {
    const column = sourceColumns.find((candidate) => (
      candidate.some((member) => substantiallyOverlaps(member.rect, source.rect))
    ));
    if (column) column.push(source);
    else sourceColumns.push([source]);
  }

  const expansions = sourceColumns.flatMap((sources) => {
    const columnEntries = entries.filter(({ rect }) => (
      sources.some((source) => substantiallyOverlaps(source.rect, rect))
    ));
    const originalRight = Math.max(...columnEntries.map(({ rect }) => rect.right));
    const expandedRight = Math.max(
      originalRight,
      ...sources.map(({ nextRect }) => nextRect.right)
    );
    const growth = expandedRight - originalRight;
    if (growth <= 0.5) return [];
    return [{
      sources,
      growth,
      centerX: sources.reduce((sum, { rect }) => sum + rect.centerX, 0) / sources.length,
    }];
  });

  for (const { node, rect } of entries) {
    let shiftX = 0;
    for (const column of expansions) {
      if (
        column.sources.some((source) => source.node.id === node.id)
        || column.sources.some((source) => substantiallyOverlaps(source.rect, rect))
        || rect.centerX <= column.centerX
      ) continue;
      shiftX += column.growth;
    }
    if (shiftX > 0.5) {
      positions.set(node.id, {
        x: node.position.x + shiftX,
        y: node.position.y,
      });
    }
  }

  return positions;
}

/**
 * Pack an arbitrary selection into columns without changing the sequence
 * supplied by the board. The tallest compact column defines the shared outer
 * span; shorter multi-item columns are vertically distributed inside that span
 * with equal edge-to-edge gaps.
 */
export function arrangeSelectionInColumns(
  nodes: Node[],
  options: ColumnArrangementOptions
): ColumnArrangementResult {
  const positions = new Map<string, Point>();
  if (!nodes.length) return { positions, columns: [] };

  const entries = nodes.map((node) => ({ node, rect: getNodeRect(node) }));
  const columnCount = Math.max(
    1,
    Math.min(nodes.length, Math.round(options.columnCount) || 1)
  );
  const columnCapacity = Math.ceil(entries.length / columnCount);
  const columns = Array.from({ length: columnCount }, (_, columnIndex) => (
    entries.slice(columnIndex * columnCapacity, (columnIndex + 1) * columnCapacity)
  )).filter((column) => column.length > 0);
  const left = Math.min(...entries.map(({ rect }) => rect.left));
  const top = Math.min(...columns.map((column) => column[0].rect.top));
  const columnGap = Math.max(0, options.columnGap ?? COMPACT_COLUMN_GAP);
  const rowGap = Math.max(0, options.rowGap ?? COMPACT_SELECTION_GAP);
  const sharedColumnHeight = Math.max(...columns.map((column) => (
    column.reduce((sum, { rect }) => sum + rect.height, 0)
      + rowGap * Math.max(0, column.length - 1)
  )));
  let cursorX = left;

  for (const column of columns) {
    const columnWidth = Math.max(...column.map(({ rect }) => rect.width));
    const occupiedHeight = column.reduce((sum, { rect }) => sum + rect.height, 0);
    const distributedRowGap = column.length > 1
      ? (sharedColumnHeight - occupiedHeight) / (column.length - 1)
      : 0;
    let cursorY = top;
    for (const { node, rect } of column) {
      const itemLeft = cursorX + (columnWidth - rect.width) / 2;
      positions.set(node.id, nodePositionFromTopLeft(
        node,
        { x: itemLeft, y: cursorY },
        rect
      ));
      cursorY += rect.height + distributedRowGap;
    }
    cursorX += columnWidth + columnGap;
  }

  return {
    positions,
    columns: columns.map((column) => column.map(({ node }) => node.id)),
  };
}

/**
 * Pack an arbitrary selection into rows without changing object sizes or the
 * sequence supplied by the board. The widest compact row defines the shared
 * outer span; shorter rows are horizontally distributed inside that span.
 */
export function arrangeSelectionInRows(
  nodes: Node[],
  options: RowArrangementOptions
): RowArrangementResult {
  const positions = new Map<string, Point>();
  if (!nodes.length) return { positions, rows: [] };

  const entries = nodes.map((node) => ({ node, rect: getNodeRect(node) }));
  const rowCount = Math.max(
    1,
    Math.min(nodes.length, Math.round(options.rowCount) || 1)
  );
  const rowCapacity = Math.ceil(entries.length / rowCount);
  const rows = Array.from({ length: rowCount }, (_, rowIndex) => (
    entries.slice(rowIndex * rowCapacity, (rowIndex + 1) * rowCapacity)
  )).filter((row) => row.length > 0);
  const left = Math.min(...rows.map((row) => row[0].rect.left));
  const top = Math.min(...entries.map(({ rect }) => rect.top));
  const columnGap = Math.max(0, options.columnGap ?? COMPACT_COLUMN_GAP);
  const rowGap = Math.max(0, options.rowGap ?? COMPACT_SELECTION_GAP);
  const sharedRowWidth = Math.max(...rows.map((row) => (
    row.reduce((sum, { rect }) => sum + rect.width, 0)
      + columnGap * Math.max(0, row.length - 1)
  )));
  let cursorY = top;

  for (const row of rows) {
    const rowHeight = Math.max(...row.map(({ rect }) => rect.height));
    const occupiedWidth = row.reduce((sum, { rect }) => sum + rect.width, 0);
    const distributedColumnGap = row.length > 1
      ? (sharedRowWidth - occupiedWidth) / (row.length - 1)
      : 0;
    let cursorX = left;
    for (const { node, rect } of row) {
      positions.set(node.id, nodePositionFromTopLeft(
        node,
        { x: cursorX, y: cursorY },
        rect
      ));
      cursorX += rect.width + distributedColumnGap;
    }
    cursorY += rowHeight + rowGap;
  }

  return {
    positions,
    rows: rows.map((row) => row.map(({ node }) => node.id)),
  };
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
