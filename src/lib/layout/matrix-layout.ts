import type { Edge, Node } from "@xyflow/react";
import type { Hierarchy } from "./hierarchy";
import { resolveLayoutFontSize } from "./layout-presentation";
import {
  createNodeRect,
  getNodeDimensions,
  getNodeRect,
  rectsOverlap,
  type NodeRect,
} from "./geometry";

export type MatrixTableDensity = "compact" | "comfortable" | "presentation";

export interface MatrixRow {
  index: number;
  /** Ordered node ids below the selected root. */
  path: string[];
}

export interface MatrixCellGeometry {
  nodeId: string;
  column: number;
  rowStart: number;
  rowEnd: number;
  rowSpan: number;
  x: number;
  y: number;
  width: number;
  height: number;
  requiredHeight: number;
}

export interface MatrixPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MatrixLayoutDiagnostics {
  duplicateNodeIds: string[];
  missingNodeIds: string[];
  nonContiguousNodeIds: string[];
  invalidNodeIds: string[];
  overlapPairs: Array<[string, string]>;
}

export interface MatrixLayoutResult {
  rootId: string;
  density: MatrixTableDensity;
  rows: MatrixRow[];
  cells: MatrixCellGeometry[];
  placements: Record<string, MatrixPlacement>;
  columnWidths: number[];
  columnX: number[];
  rowHeights: number[];
  rowY: number[];
  header: MatrixCellGeometry;
  bounds: NodeRect;
  diagnostics: MatrixLayoutDiagnostics;
}

type DensitySettings = {
  cellGap: number;
  paddingX: number;
  paddingY: number;
  minRowHeight: number;
  minHeaderHeight: number;
};

export const MATRIX_MIN_COLUMN_WIDTH = 180;
export const MATRIX_MAX_COLUMN_WIDTH = 380;
export const MATRIX_FIRST_COLUMN_MIN_WIDTH = 200;
export const MATRIX_HEADER_MIN_WIDTH = 280;

export const MATRIX_DENSITY_SETTINGS: Record<MatrixTableDensity, DensitySettings> = {
  compact: {
    cellGap: 2,
    paddingX: 14,
    paddingY: 8,
    minRowHeight: 48,
    minHeaderHeight: 64,
  },
  comfortable: {
    cellGap: 4,
    paddingX: 20,
    paddingY: 14,
    minRowHeight: 64,
    minHeaderHeight: 72,
  },
  presentation: {
    cellGap: 8,
    paddingX: 24,
    paddingY: 16,
    minRowHeight: 76,
    minHeaderHeight: 84,
  },
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function positiveNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function storedSize(value: unknown): { width: number; height: number } | null {
  if (!value || typeof value !== "object") return null;
  const size = value as Record<string, unknown>;
  const width = positiveNumber(size.width);
  const height = positiveNumber(size.height);
  return width && height ? { width, height } : null;
}

function matrixContentSize(node: Node): { width: number; height: number; lineCount: number; lineHeight: number } | null {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const value = data.matrixIntrinsicSize;
  if (!value || typeof value !== "object") return null;
  const size = value as Record<string, unknown>;
  return {
    width: positiveNumber(size.width) ?? 0,
    height: positiveNumber(size.height) ?? 0,
    lineCount: positiveNumber(size.lineCount) ?? 0,
    lineHeight: positiveNumber(size.lineHeight) ?? 0,
  };
}

/** Returns a node's normal size, ignoring an active Matrix cell override. */
export function getMatrixBaseSize(node: Node): { width: number; height: number } {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const userSize = storedSize(data.userSize);
  if (userSize) return userSize;

  const override = data.layoutSizeOverride as Record<string, unknown> | undefined;
  if (override?.mode === "matrix") {
    const intrinsic = matrixContentSize(node);
    if (intrinsic && intrinsic.width > 0 && intrinsic.height > 0) {
      return { width: intrinsic.width, height: intrinsic.height };
    }
    return { width: 180, height: 80 };
  }
  return getNodeDimensions(node);
}

function stripRichText(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function nodeText(node: Node): string {
  const data = (node.data ?? {}) as Record<string, unknown>;
  if (typeof data.richText === "string" && data.richText.trim()) {
    return stripRichText(data.richText).trim();
  }
  const fields = ["text", "title", "topic", "label", "devanagari", "iast", "translation", "rule"];
  return fields
    .map((field) => data[field])
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n")
    .trim();
}

function fontMetrics(node: Node): { fontSize: number; charWidth: number; lineHeight: number } {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const baseSize = resolveLayoutFontSize(data) ?? 14;
  // Mixed inline sizes are represented by matrixIntrinsicSize after DOM
  // measurement; promoting the largest span to every character over-sizes rows.
  const fontSize = clamp(baseSize, 10, 96);
  return {
    fontSize,
    // Indic combining marks make code-unit counts conservative, which is
    // preferable to clipping a Sanskrit label at the column boundary.
    charWidth: Math.max(6, fontSize * 0.62),
    lineHeight: fontSize * 1.38,
  };
}

function wrappedLineCount(text: string, charsPerLine: number): number {
  const safeChars = Math.max(1, charsPerLine);
  const lines = text.split("\n");
  let count = 0;
  for (const line of lines) {
    const words = line.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      count += 1;
      continue;
    }
    let current = 0;
    for (const word of words) {
      const length = Array.from(word).length;
      if (length > safeChars) {
        if (current) {
          count += 1;
          current = 0;
        }
        count += 1;
        continue;
      }
      const next = current ? current + 1 + length : length;
      if (next > safeChars) {
        count += 1;
        current = length;
      } else {
        current = next;
      }
    }
    if (current) count += 1;
  }
  return Math.max(1, count);
}

function preferredCellWidth(node: Node, column: number, settings: DensitySettings): number {
  const text = nodeText(node);
  const { charWidth } = fontMetrics(node);
  const words = text.split(/\s+/).filter(Boolean);
  const longestWord = words.reduce((max, word) => Math.max(max, Array.from(word).length), 0);
  const charCount = Math.max(1, Array.from(text.replace(/\s+/g, " ")).length);
  const balancedChars = charCount <= 38 ? charCount : Math.ceil(Math.sqrt(charCount) * 3.2);
  const preferredChars = clamp(Math.max(longestWord + 3, balancedChars), 18, 52);
  const estimatedWidth = preferredChars * charWidth + settings.paddingX * 2;
  const content = matrixContentSize(node);
  const measuredContentWidth = content?.width ? content.width + settings.paddingX * 2 : 0;
  const minimum = column === 0 ? MATRIX_FIRST_COLUMN_MIN_WIDTH : MATRIX_MIN_COLUMN_WIDTH;
  return Math.ceil(clamp(
    Math.max(minimum, estimatedWidth, measuredContentWidth),
    minimum,
    MATRIX_MAX_COLUMN_WIDTH
  ));
}

function requiredCellHeight(
  node: Node,
  width: number,
  settings: DensitySettings,
  minimum = settings.minRowHeight
): number {
  const text = nodeText(node);
  const metrics = fontMetrics(node);
  const usableWidth = Math.max(48, width - settings.paddingX * 2);
  const charsPerLine = Math.max(6, Math.floor(usableWidth / metrics.charWidth));
  const estimatedLines = wrappedLineCount(text || " ", charsPerLine);
  const content = matrixContentSize(node);
  const measuredHeight = content?.height ? content.height + settings.paddingY * 2 : 0;
  const measuredLinesHeight = content?.lineCount && content?.lineHeight
    ? content.lineCount * content.lineHeight + settings.paddingY * 2
    : 0;
  const textHeight = estimatedLines * metrics.lineHeight + settings.paddingY * 2;
  return Math.ceil(Math.max(
    minimum,
    textHeight,
    measuredHeight,
    measuredLinesHeight
  ));
}

function storedDensity(value: unknown): MatrixTableDensity | null {
  return value === "compact" || value === "comfortable" || value === "presentation"
    ? value
    : null;
}

function isVisible(nodeId: string, byId: Map<string, Node>): boolean {
  const node = byId.get(nodeId);
  return !!node && !node.hidden;
}

function visibleChildren(nodeId: string, hierarchy: Hierarchy, byId: Map<string, Node>): string[] {
  const node = byId.get(nodeId);
  if (!node || (node.data as { collapsed?: boolean } | undefined)?.collapsed) return [];
  return (hierarchy.get(nodeId)?.childIds ?? []).filter((childId) => isVisible(childId, byId));
}

/** Builds one ordered body row for every visible root-to-leaf path. */
export function buildMatrixLeafRows(
  rootId: string,
  hierarchy: Hierarchy,
  byId: Map<string, Node>
): MatrixRow[] {
  if (!isVisible(rootId, byId)) return [];
  const rows: MatrixRow[] = [];
  const visited = new Set<string>();

  const visit = (nodeId: string, path: string[], ancestors: Set<string>) => {
    if (!isVisible(nodeId, byId) || ancestors.has(nodeId) || visited.has(nodeId)) return;
    visited.add(nodeId);
    const nextPath = [...path, nodeId];
    const nextAncestors = new Set(ancestors).add(nodeId);
    const children = visibleChildren(nodeId, hierarchy, byId)
      .filter((childId) => !nextAncestors.has(childId) && !visited.has(childId));
    if (!children.length) {
      rows.push({ index: rows.length, path: nextPath });
      return;
    }
    for (const childId of children) visit(childId, nextPath, nextAncestors);
  };

  for (const childId of visibleChildren(rootId, hierarchy, byId)) {
    visit(childId, [], new Set([rootId]));
  }
  return rows;
}

/** Matrix hides only structural parent-to-child edges inside its own subtree. */
export function isMatrixHierarchyEdge(
  edge: Pick<Edge, "source" | "target">,
  hierarchy: Hierarchy,
  scopeIds: ReadonlySet<string>
): boolean {
  return scopeIds.has(edge.source)
    && scopeIds.has(edge.target)
    && hierarchy.get(edge.target)?.parentId === edge.source;
}

function nodePositionForRect(node: Node, x: number, y: number, width: number, height: number) {
  const origin = node.origin ?? [0, 0];
  return {
    x: x + width * origin[0],
    y: y + height * origin[1],
  };
}

function cellRect(cell: MatrixCellGeometry): NodeRect {
  return createNodeRect(cell.nodeId, cell.x, cell.y, cell.width, cell.height);
}

function diagnoseMatrix(
  rootId: string,
  rows: MatrixRow[],
  cells: MatrixCellGeometry[],
  header: MatrixCellGeometry,
  hierarchy: Hierarchy,
  byId: Map<string, Node>
): MatrixLayoutDiagnostics {
  const counts = new Map<string, number>();
  for (const cell of cells) counts.set(cell.nodeId, (counts.get(cell.nodeId) ?? 0) + 1);
  const duplicateNodeIds = [...counts].filter(([, count]) => count > 1).map(([id]) => id);
  const expected = new Set<string>();
  const walk = (id: string, ancestors: Set<string>) => {
    if (ancestors.has(id) || !isVisible(id, byId)) return;
    expected.add(id);
    const next = new Set(ancestors).add(id);
    visibleChildren(id, hierarchy, byId).forEach((childId) => walk(childId, next));
  };
  walk(rootId, new Set());
  expected.delete(rootId);
  const missingNodeIds = [...expected].filter((id) => !counts.has(id));

  const rowOccurrences = new Map<string, number[]>();
  rows.forEach((row) => row.path.forEach((id) => {
    rowOccurrences.set(id, [...(rowOccurrences.get(id) ?? []), row.index]);
  }));
  const nonContiguousNodeIds = [...rowOccurrences]
    .filter(([, occurrences]) => occurrences.some((row, index) => index > 0 && row !== occurrences[index - 1] + 1))
    .map(([id]) => id);

  const invalidNodeIds = [header, ...cells]
    .filter((cell) => ![
      cell.x,
      cell.y,
      cell.width,
      cell.height,
      cell.requiredHeight,
    ].every(Number.isFinite) || cell.width <= 0 || cell.height <= 0)
    .map((cell) => cell.nodeId);

  const overlapPairs: Array<[string, string]> = [];
  const cellsByColumn = new Map<number, MatrixCellGeometry[]>();
  cells.forEach((cell) => cellsByColumn.set(cell.column, [...(cellsByColumn.get(cell.column) ?? []), cell]));
  for (const columnCells of cellsByColumn.values()) {
    columnCells.sort((first, second) => first.y - second.y);
    for (let index = 1; index < columnCells.length; index++) {
      const previous = columnCells[index - 1];
      const current = columnCells[index];
      if (rectsOverlap(cellRect(previous), cellRect(current))) {
        overlapPairs.push([previous.nodeId, current.nodeId]);
      }
    }
  }
  for (const cell of cells) {
    if (rectsOverlap(cellRect(header), cellRect(cell))) overlapPairs.push([rootId, cell.nodeId]);
  }
  return {
    duplicateNodeIds,
    missingNodeIds,
    nonContiguousNodeIds,
    invalidNodeIds,
    overlapPairs,
  };
}

export function computeMatrixLayout(
  rootId: string,
  hierarchy: Hierarchy,
  byId: Map<string, Node>,
  options: { density?: MatrixTableDensity } = {}
): MatrixLayoutResult {
  const root = byId.get(rootId);
  if (!root) throw new Error(`Matrix root ${rootId} does not exist.`);
  const rootData = (root.data ?? {}) as Record<string, unknown>;
  const rows = buildMatrixLeafRows(rootId, hierarchy, byId);
  const savedDensity = storedDensity(rootData.matrixDensity);
  const userSelectedDensity = rootData.matrixDensityUserSet === true
    || savedDensity === "compact"
    || savedDensity === "presentation";
  const density = options.density
    ?? (userSelectedDensity ? savedDensity : null)
    ?? (rows.length >= 24 ? "compact" : savedDensity)
    ?? "comfortable";
  const settings = MATRIX_DENSITY_SETTINGS[density];
  const rootRect = getNodeRect(root);
  const tableX = rootRect.left;
  const tableY = rootRect.top;

  const spanMap = new Map<string, {
    nodeId: string;
    column: number;
    rowStart: number;
    rowEnd: number;
    occurrences: number[];
  }>();
  const duplicateNodeIds = new Set<string>();
  rows.forEach((row) => row.path.forEach((nodeId, column) => {
    const current = spanMap.get(nodeId);
    if (current && current.column !== column) duplicateNodeIds.add(nodeId);
    if (!current) {
      spanMap.set(nodeId, {
        nodeId,
        column,
        rowStart: row.index,
        rowEnd: row.index,
        occurrences: [row.index],
      });
      return;
    }
    current.rowStart = Math.min(current.rowStart, row.index);
    current.rowEnd = Math.max(current.rowEnd, row.index);
    current.occurrences.push(row.index);
  }));

  const columnCount = Math.max(0, ...rows.map((row) => row.path.length));
  const columnWidths = Array.from({ length: columnCount }, (_, column) => {
    const nodes = [...spanMap.values()]
      .filter((span) => span.column === column)
      .map((span) => byId.get(span.nodeId))
      .filter((node): node is Node => !!node);
    const minimum = column === 0 ? MATRIX_FIRST_COLUMN_MIN_WIDTH : MATRIX_MIN_COLUMN_WIDTH;
    return Math.max(minimum, ...nodes.map((node) => preferredCellWidth(node, column, settings)));
  });
  if (columnWidths.length) {
    const naturalBodyWidth = columnWidths.reduce((sum, width) => sum + width, 0)
      + settings.cellGap * (columnWidths.length - 1);
    const minimumHeaderWidth = Math.ceil(clamp(
      preferredCellWidth(root, 0, settings),
      MATRIX_HEADER_MIN_WIDTH,
      MATRIX_MAX_COLUMN_WIDTH
    ));
    let deficit = Math.max(0, minimumHeaderWidth - naturalBodyWidth);
    // A shallow table still needs a readable title. Grow body columns so the
    // header and body retain one coherent outer width rather than leaving a
    // blank strip beside a narrow column.
    for (let column = columnWidths.length - 1; column >= 0 && deficit > 0; column--) {
      const growth = Math.min(deficit, MATRIX_MAX_COLUMN_WIDTH - columnWidths[column]);
      columnWidths[column] += growth;
      deficit -= growth;
    }
  }

  const columnX: number[] = [];
  let nextX = tableX;
  columnWidths.forEach((width) => {
    columnX.push(nextX);
    nextX += width + settings.cellGap;
  });
  const bodyWidth = columnWidths.length
    ? columnWidths.reduce((sum, width) => sum + width, 0) + settings.cellGap * (columnWidths.length - 1)
    : Math.ceil(clamp(preferredCellWidth(root, 0, settings), MATRIX_HEADER_MIN_WIDTH, 760));

  const rowHeights = Array.from({ length: rows.length }, () => settings.minRowHeight);
  const cellRequirements = new Map<string, number>();
  for (const span of spanMap.values()) {
    const node = byId.get(span.nodeId);
    if (!node) continue;
    const requiredHeight = requiredCellHeight(node, columnWidths[span.column], settings);
    cellRequirements.set(span.nodeId, requiredHeight);
    if (span.rowStart === span.rowEnd) {
      rowHeights[span.rowStart] = Math.max(rowHeights[span.rowStart], requiredHeight);
    }
  }

  const mergedSpans = [...spanMap.values()]
    .filter((span) => span.rowEnd > span.rowStart)
    .sort((a, b) => (a.rowEnd - a.rowStart) - (b.rowEnd - b.rowStart));
  for (let iteration = 0; iteration < 3; iteration++) {
    let changed = false;
    for (const span of mergedSpans) {
      const requiredHeight = cellRequirements.get(span.nodeId) ?? settings.minRowHeight;
      const available = rowHeights
        .slice(span.rowStart, span.rowEnd + 1)
        .reduce((sum, height) => sum + height, 0)
        + settings.cellGap * (span.rowEnd - span.rowStart);
      const deficit = requiredHeight - available;
      if (deficit <= 0.5) continue;
      const addPerRow = deficit / (span.rowEnd - span.rowStart + 1);
      for (let row = span.rowStart; row <= span.rowEnd; row++) rowHeights[row] += addPerRow;
      changed = true;
    }
    if (!changed) break;
  }

  const headerHeight = requiredCellHeight(root, bodyWidth, settings, settings.minHeaderHeight);
  const bodyY = tableY + headerHeight + (rows.length ? settings.cellGap : 0);
  const rowY: number[] = [];
  let nextY = bodyY;
  rowHeights.forEach((height) => {
    rowY.push(nextY);
    nextY += height + settings.cellGap;
  });

  const cells = [...spanMap.values()]
    .sort((a, b) => a.rowStart - b.rowStart || a.column - b.column)
    .map<MatrixCellGeometry>((span) => {
      const y = rowY[span.rowStart];
      const height = rowHeights
        .slice(span.rowStart, span.rowEnd + 1)
        .reduce((sum, rowHeight) => sum + rowHeight, 0)
        + settings.cellGap * (span.rowEnd - span.rowStart);
      return {
        nodeId: span.nodeId,
        column: span.column,
        rowStart: span.rowStart,
        rowEnd: span.rowEnd,
        rowSpan: span.rowEnd - span.rowStart + 1,
        x: columnX[span.column],
        y,
        width: columnWidths[span.column],
        height,
        requiredHeight: cellRequirements.get(span.nodeId) ?? settings.minRowHeight,
      };
    });

  const header: MatrixCellGeometry = {
    nodeId: rootId,
    column: -1,
    rowStart: -1,
    rowEnd: -1,
    rowSpan: 1,
    x: tableX,
    y: tableY,
    width: bodyWidth,
    height: headerHeight,
    requiredHeight: headerHeight,
  };
  const placements: Record<string, MatrixPlacement> = {};
  for (const cell of [header, ...cells]) {
    const node = byId.get(cell.nodeId);
    if (!node) continue;
    const position = nodePositionForRect(node, cell.x, cell.y, cell.width, cell.height);
    placements[cell.nodeId] = { ...position, width: cell.width, height: cell.height };
  }

  const bodyHeight = rowHeights.length
    ? rowHeights.reduce((sum, height) => sum + height, 0) + settings.cellGap * (rowHeights.length - 1)
    : 0;
  const totalHeight = headerHeight + (bodyHeight ? settings.cellGap + bodyHeight : 0);
  const bounds = createNodeRect(`matrix-bounds-${rootId}`, tableX, tableY, bodyWidth, totalHeight);
  const diagnostics = diagnoseMatrix(rootId, rows, cells, header, hierarchy, byId);
  diagnostics.duplicateNodeIds.push(...[...duplicateNodeIds].filter((id) => !diagnostics.duplicateNodeIds.includes(id)));

  if (process.env.NODE_ENV !== "production" && Object.values(diagnostics).some((items) => items.length)) {
    console.warn("[matrix-layout] geometry diagnostics", diagnostics);
  }

  return {
    rootId,
    density,
    rows,
    cells,
    placements,
    columnWidths,
    columnX,
    rowHeights,
    rowY,
    header,
    bounds,
    diagnostics,
  };
}
