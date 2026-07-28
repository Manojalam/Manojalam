import type { Edge, Node } from "@xyflow/react";
import type { Hierarchy } from "./hierarchy";
import { resolveLayoutFontSize } from "./layout-presentation";
import {
  resolvedFoldSectionCount,
  resolvedFoldSections,
} from "./child-group-wrap";
import {
  createNodeRect,
  getNodeDimensions,
  getNodeRect,
  rectsOverlap,
  type NodeRect,
} from "./geometry";

export type MatrixTableDensity = "compact" | "comfortable" | "presentation";
export type MatrixOrientation = "horizontal" | "vertical";
export type MatrixChildFlow = "row" | "column";

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

export interface MatrixEmptyCellGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
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
  /** Root direction. Descendants may override it for their own branch. */
  orientation: MatrixOrientation;
  rows: MatrixRow[];
  cells: MatrixCellGeometry[];
  /** Generated visual cells that preserve missing trailing row positions. */
  emptyCells: MatrixEmptyCellGeometry[];
  placements: Record<string, MatrixPlacement>;
  columnWidths: number[];
  columnX: number[];
  rowHeights: number[];
  rowY: number[];
  header: MatrixCellGeometry;
  bounds: NodeRect;
  diagnostics: MatrixLayoutDiagnostics;
}

export interface MatrixCellResizePlan {
  width?: number;
  height?: number;
  resetTableWidth: boolean;
  resetTableHeight: boolean;
}

type DensitySettings = {
  cellGap: number;
  paddingX: number;
  paddingY: number;
  minRowHeight: number;
  minHeaderHeight: number;
};

type MatrixLogicalSpan = {
  nodeId: string;
  column: number;
  rowStart: number;
  rowEnd: number;
  occurrences: number[];
};

export const MATRIX_MIN_COLUMN_WIDTH = 112;
export const MATRIX_MAX_COLUMN_WIDTH = 320;
export const MATRIX_USER_MIN_COLUMN_WIDTH = 80;
export const MATRIX_USER_MAX_COLUMN_WIDTH = 1200;
export const MATRIX_FIRST_COLUMN_MIN_WIDTH = 136;
export const MATRIX_HEADER_MIN_WIDTH = 220;
export const MATRIX_MIN_SIBLING_GAP = 0;
export const MATRIX_MAX_SIBLING_GAP = 240;
export const MATRIX_MIN_TABLE_WIDTH = 160;
export const MATRIX_MAX_TABLE_WIDTH = 6000;
export const MATRIX_MIN_TABLE_HEIGHT = 100;
export const MATRIX_MAX_TABLE_HEIGHT = 6000;

export const MATRIX_DENSITY_SETTINGS: Record<MatrixTableDensity, DensitySettings> = {
  compact: {
    cellGap: 6,
    paddingX: 10,
    paddingY: 6,
    minRowHeight: 40,
    minHeaderHeight: 50,
  },
  comfortable: {
    cellGap: 8,
    paddingX: 14,
    paddingY: 9,
    minRowHeight: 50,
    minHeaderHeight: 60,
  },
  presentation: {
    cellGap: 12,
    paddingX: 18,
    paddingY: 12,
    minRowHeight: 62,
    minHeaderHeight: 72,
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

function nonNegativeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return null;
}

/**
 * Exact cell dimensions normally release the same overall table axis so the
 * entered cell size can remain exact. When overall size is locked, the table
 * axis stays fixed and the entered cell size instead changes its share of the
 * available space.
 */
export function matrixTableOverrideResetAxes(
  patch: Record<string, unknown>,
  tableSizeLocked = false
): { width: boolean; height: boolean } {
  if (tableSizeLocked) return { width: false, height: false };
  return {
    width: positiveNumber(patch.matrixWidthOverride) !== null,
    height: positiveNumber(patch.matrixHeightOverride) !== null,
  };
}

/**
 * React Flow resize callbacks report both dimensions even when the user edits
 * only one axis. Matrix cells can span several rows, so copying an unchanged
 * rendered height back as an exact height would turn the whole span into a new
 * row-height requirement. Preserve unchanged axes instead.
 */
export function resolveMatrixCellResize(
  currentRenderedSize: { width: number; height: number },
  currentColumnWidth: number,
  requestedSize: { width: number; height: number }
): MatrixCellResizePlan {
  const widthChanged = Math.abs(requestedSize.width - currentRenderedSize.width) > 0.5;
  const heightChanged = Math.abs(requestedSize.height - currentRenderedSize.height) > 0.5;
  return {
    ...(widthChanged
      ? {
          width: Math.round(clamp(
            currentColumnWidth + requestedSize.width - currentRenderedSize.width,
            MATRIX_USER_MIN_COLUMN_WIDTH,
            MATRIX_USER_MAX_COLUMN_WIDTH
          )),
        }
      : {}),
    ...(heightChanged
      ? {
          height: Math.max(
            MATRIX_DENSITY_SETTINGS.compact.minRowHeight,
            Math.round(requestedSize.height)
          ),
        }
      : {}),
    resetTableWidth: widthChanged,
    resetTableHeight: heightChanged,
  };
}

function storedSize(value: unknown): { width: number; height: number } | null {
  if (!value || typeof value !== "object") return null;
  const size = value as Record<string, unknown>;
  const width = positiveNumber(size.width);
  const height = positiveNumber(size.height);
  return width && height ? { width, height } : null;
}

function matrixContentSize(node: Node): {
  width: number;
  height: number;
  lineCount: number;
  lineHeight: number;
  cellWidth: number;
} | null {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const value = data.matrixIntrinsicSize;
  if (!value || typeof value !== "object") return null;
  const size = value as Record<string, unknown>;
  return {
    width: positiveNumber(size.width) ?? 0,
    height: positiveNumber(size.height) ?? 0,
    lineCount: positiveNumber(size.lineCount) ?? 0,
    lineHeight: positiveNumber(size.lineHeight) ?? 0,
    cellWidth: positiveNumber(size.cellWidth) ?? 0,
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

/**
 * React Flow writes live resize dimensions onto the node before Matrix has a
 * chance to recompute the full table. Detect that temporary size even when the
 * persisted Matrix allocation itself did not change, so the store can clear it
 * and restore the cell to the row/column geometry owned by Matrix.
 */
export function matrixNodeSizeDiffersFromPlacement(
  node: Node,
  placement: Pick<MatrixPlacement, "width" | "height">,
  tolerance = 0.5
): boolean {
  const rendered = getNodeDimensions(node);
  return Math.abs(rendered.width - placement.width) > tolerance
    || Math.abs(rendered.height - placement.height) > tolerance;
}

/** Return whether two node snapshots resolve to different rendered sizes. */
export function matrixRenderedSizeChanged(
  before: Node,
  after: Node,
  tolerance = 0.5
): boolean {
  const previous = getNodeDimensions(before);
  const next = getNodeDimensions(after);
  return Math.abs(previous.width - next.width) > tolerance
    || Math.abs(previous.height - next.height) > tolerance;
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

function largestInlineFontSize(node: Node): number {
  const data = (node.data ?? {}) as Record<string, unknown>;
  if (typeof data.richText !== "string") return 0;
  const sizes = [...data.richText.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/gi)]
    .map((match) => Number.parseFloat(match[1]))
    .filter((size) => Number.isFinite(size) && size > 0);
  return sizes.length ? Math.max(...sizes) : 0;
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

function preferredCellWidth(
  node: Node,
  column: number,
  settings: DensitySettings,
  includeUserOverride = true
): number {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const userWidth = positiveNumber(data.matrixWidthOverride);
  if (includeUserOverride && userWidth) {
    return Math.ceil(clamp(userWidth, MATRIX_USER_MIN_COLUMN_WIDTH, MATRIX_USER_MAX_COLUMN_WIDTH));
  }
  const text = nodeText(node);
  const { charWidth } = fontMetrics(node);
  const words = text.split(/\s+/).filter(Boolean);
  const longestWord = words.reduce((max, word) => Math.max(max, Array.from(word).length), 0);
  const charCount = Math.max(1, Array.from(text.replace(/\s+/g, " ")).length);
  const balancedChars = charCount <= 38 ? charCount : Math.ceil(Math.sqrt(charCount) * 3.2);
  // A Matrix often contains one-character Sanskrit cells. Giving those cells
  // the same 18-character floor as prose is what made simple tables enormous.
  const preferredChars = clamp(Math.max(longestWord + 3, balancedChars), 8, 42);
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
  const data = (node.data ?? {}) as Record<string, unknown>;
  const userHeight = positiveNumber(data.matrixHeightOverride);
  if (userHeight) {
    return Math.ceil(clamp(userHeight, MATRIX_DENSITY_SETTINGS.compact.minRowHeight, MATRIX_MAX_TABLE_HEIGHT));
  }
  const text = nodeText(node);
  const metrics = fontMetrics(node);
  const usableWidth = Math.max(48, width - settings.paddingX * 2);
  const charsPerLine = Math.max(6, Math.floor(usableWidth / metrics.charWidth));
  const estimatedLines = wrappedLineCount(text || " ", charsPerLine);
  const content = matrixContentSize(node);
  // A folded branch can move a cell between differently sized sections. DOM
  // text metrics captured at the previous cell width must not size the next
  // pass; doing so can alternate the Fold partition indefinitely. The fresh
  // measurement will be accepted once React Flow reports it for this width.
  const measurementMatchesCell = !!content?.cellWidth
    && Math.abs(content.cellWidth - width) <= 1;
  const hasMeasuredLineMetrics = !!content?.lineCount && !!content?.lineHeight;
  // The editor's raw block height can include invisible boundary paragraphs
  // or clipboard spacing even though only the reported text lines render. Use
  // raw height only as a fallback for older measurements without line metrics.
  const measuredHeight = measurementMatchesCell && content?.height && !hasMeasuredLineMetrics
    ? content.height + settings.paddingY * 2
    : 0;
  const measuredLinesHeight = measurementMatchesCell && hasMeasuredLineMetrics
    ? content.lineCount * Math.max(
        content.lineHeight,
        largestInlineFontSize(node) * 1.38
      ) + settings.paddingY * 2
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

function storedOrientation(value: unknown): MatrixOrientation | null {
  return value === "horizontal" || value === "vertical" ? value : null;
}

function storedChildFlow(value: unknown): MatrixChildFlow | null {
  return value === "row" || value === "column" ? value : null;
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
  const renderedCells = [header, ...cells].sort((first, second) => first.y - second.y);
  for (let first = 0; first < renderedCells.length; first++) {
    for (let second = first + 1; second < renderedCells.length; second++) {
      if (renderedCells[second].y >= renderedCells[first].y + renderedCells[first].height) break;
      if (rectsOverlap(cellRect(renderedCells[first]), cellRect(renderedCells[second]))) {
        overlapPairs.push([renderedCells[first].nodeId, renderedCells[second].nodeId]);
      }
    }
  }
  return {
    duplicateNodeIds,
    missingNodeIds,
    nonContiguousNodeIds,
    invalidNodeIds,
    overlapPairs,
  };
}

type OrientedBranchCell = {
  nodeId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  requiredHeight: number;
  terminal: boolean;
  horizontalTerminal: boolean;
  verticalTerminal: boolean;
  widthLocked?: boolean;
  heightLocked?: boolean;
  placeholder?: boolean;
  /** Direct sibling flow for a real terminal cell. */
  terminalPeerFlow?: MatrixChildFlow;
  /** A generated slot for a missing same-level row peer, not Fold allocation. */
  missingPeerSlot?: boolean;
  /** A hierarchy leaf in a vertical sibling list may absorb unused deeper columns. */
  mergeTrailingHorizontal?: boolean;
  /** A hierarchy leaf in a horizontal sibling list may absorb unused deeper rows. */
  mergeTrailingVertical?: boolean;
};

type OrientedBranchLayout = {
  width: number;
  height: number;
  cells: OrientedBranchCell[];
};

function matrixOrientationForNode(
  nodeId: string,
  inherited: MatrixOrientation,
  byId: Map<string, Node>
): MatrixOrientation {
  const data = (byId.get(nodeId)?.data ?? {}) as Record<string, unknown>;
  return storedOrientation(data.matrixOrientation) ?? inherited;
}

const MATRIX_AUTO_ROW_MIN_SIBLINGS = 4;
const MATRIX_AUTO_ROW_MAX_SIBLINGS = 8;
const MATRIX_AUTO_ROW_MAX_LABEL_CHARACTERS = 16;
const DEVANAGARI_CHARACTER = /[\u0900-\u097f]/u;

/**
 * Compact terminal sets such as अ/इ/उ/ऋ/ऌ or क/ख/ग/घ/ङ are semantic table
 * rows. Treating every item as another root-to-leaf row creates the extremely
 * tall, narrow Matrix seen in alphabet and classification boards.
 */
function isCompactLeafSiblingGroup(
  nodeId: string,
  hierarchy: Hierarchy,
  byId: Map<string, Node>
): boolean {
  const children = visibleChildren(nodeId, hierarchy, byId);
  if (
    children.length < MATRIX_AUTO_ROW_MIN_SIBLINGS
    || children.length > MATRIX_AUTO_ROW_MAX_SIBLINGS
  ) return false;
  return children.every((childId) => {
    if (visibleChildren(childId, hierarchy, byId).length) return false;
    const child = byId.get(childId);
    if (!child) return false;
    const text = nodeText(child);
    const compactLabelLength = Array.from(text.replace(/\s+/g, "")).length;
    return compactLabelLength > 0
      && compactLabelLength <= MATRIX_AUTO_ROW_MAX_LABEL_CHARACTERS
      && DEVANAGARI_CHARACTER.test(text);
  });
}

function matrixChildFlowForNode(
  nodeId: string,
  orientation: MatrixOrientation,
  hierarchy: Hierarchy,
  byId: Map<string, Node>,
  packCompactGroups: boolean
): MatrixChildFlow {
  const data = (byId.get(nodeId)?.data ?? {}) as Record<string, unknown>;
  return storedChildFlow(data.matrixChildFlow)
    ?? (packCompactGroups && isCompactLeafSiblingGroup(nodeId, hierarchy, byId) ? "row" : null)
    ?? (orientation === "horizontal" ? "column" : "row");
}

function hasVerticalMatrixBranch(
  rootId: string,
  hierarchy: Hierarchy,
  byId: Map<string, Node>
): boolean {
  const visit = (nodeId: string, inherited: MatrixOrientation, ancestors: Set<string>): boolean => {
    if (ancestors.has(nodeId)) return false;
    const orientation = matrixOrientationForNode(nodeId, inherited, byId);
    const children = visibleChildren(nodeId, hierarchy, byId)
      .filter((childId) => !ancestors.has(childId));
    if (children.length && orientation === "vertical") return true;
    const nextAncestors = new Set(ancestors).add(nodeId);
    return children.some((childId) => visit(childId, orientation, nextAncestors));
  };
  return visit(rootId, "horizontal", new Set());
}

function matrixSiblingGapForNode(
  nodeId: string,
  fallback: number,
  byId: Map<string, Node>
): number {
  const data = (byId.get(nodeId)?.data ?? {}) as Record<string, unknown>;
  const storedGap = nonNegativeNumber(data.matrixSiblingGap);
  return storedGap === null
    ? fallback
    : clamp(storedGap, MATRIX_MIN_SIBLING_GAP, MATRIX_MAX_SIBLING_GAP);
}

function hasFoldedMatrixBranch(
  rootId: string,
  hierarchy: Hierarchy,
  byId: Map<string, Node>
): boolean {
  const visit = (nodeId: string, ancestors: Set<string>): boolean => {
    if (ancestors.has(nodeId)) return false;
    const children = visibleChildren(nodeId, hierarchy, byId)
      .filter((childId) => !ancestors.has(childId));
    const data = (byId.get(nodeId)?.data ?? {}) as Record<string, unknown>;
    if (resolvedFoldSectionCount(data, children.length) > 1) return true;
    const nextAncestors = new Set(ancestors).add(nodeId);
    return children.some((childId) => visit(childId, nextAncestors));
  };
  return visit(rootId, new Set());
}

function hasExplicitMatrixChildFlow(
  rootId: string,
  hierarchy: Hierarchy,
  byId: Map<string, Node>
): boolean {
  const visit = (nodeId: string, ancestors: Set<string>): boolean => {
    if (ancestors.has(nodeId)) return false;
    const data = (byId.get(nodeId)?.data ?? {}) as Record<string, unknown>;
    if (storedChildFlow(data.matrixChildFlow)) return true;
    const nextAncestors = new Set(ancestors).add(nodeId);
    return visibleChildren(nodeId, hierarchy, byId)
      .filter((childId) => !nextAncestors.has(childId))
      .some((childId) => visit(childId, nextAncestors));
  };
  return visit(rootId, new Set());
}

function translateOrientedCells(
  cells: OrientedBranchCell[],
  dx: number,
  dy: number
): OrientedBranchCell[] {
  return cells.map((cell) => ({ ...cell, x: cell.x + dx, y: cell.y + dy }));
}

/**
 * Fold and mixed child-flow branches can establish a wider/taller outer Matrix
 * allocation after their peer branches have already been composed. A terminal
 * hierarchy cell must absorb that trailing allocation; generated peer slots
 * remain only for genuinely incomplete same-level rows.
 */
function mergeOrientedTerminalCellsToOuterEdge(
  cells: OrientedBranchCell[]
): OrientedBranchCell[] {
  if (!cells.length) return cells;
  const right = Math.max(...cells.map((cell) => cell.x + cell.width));
  const bottom = Math.max(...cells.map((cell) => cell.y + cell.height));
  const merged = cells.map((cell) => {
    if (cell.placeholder) return cell;
    let width = cell.width;
    let height = cell.height;
    if (cell.mergeTrailingHorizontal && cell.x + cell.width < right - 0.5) {
      const blockedToRight = cells.some((other) => (
        other.nodeId !== cell.nodeId
        && (!other.placeholder || other.missingPeerSlot === true)
        && other.x >= cell.x + cell.width - 0.5
        && other.y < cell.y + cell.height - 0.5
        && other.y + other.height > cell.y + 0.5
      ));
      if (!blockedToRight) width = right - cell.x;
    }
    if (cell.mergeTrailingVertical && cell.y + cell.height < bottom - 0.5) {
      const blockedBelow = cells.some((other) => (
        other.nodeId !== cell.nodeId
        && (!other.placeholder || other.missingPeerSlot === true)
        && other.y >= cell.y + cell.height - 0.5
        && other.x < cell.x + cell.width - 0.5
        && other.x + other.width > cell.x + 0.5
      ));
      if (!blockedBelow) height = bottom - cell.y;
    }
    return width === cell.width && height === cell.height
      ? cell
      : { ...cell, width, height };
  });
  const expanded = merged.filter((cell) => !cell.placeholder);
  return merged.filter((cell) => {
    if (!cell.placeholder) return true;
    const centerX = cell.x + cell.width / 2;
    const centerY = cell.y + cell.height / 2;
    return !expanded.some((actual) => (
      actual.x <= centerX + 0.5
      && actual.x + actual.width >= centerX - 0.5
      && actual.y <= centerY + 0.5
      && actual.y + actual.height >= centerY - 0.5
    ));
  });
}

function hasExplicitMatrixGeometry(
  rootId: string,
  hierarchy: Hierarchy,
  byId: Map<string, Node>
): boolean {
  const visit = (nodeId: string, ancestors: Set<string>): boolean => {
    if (ancestors.has(nodeId)) return false;
    const data = (byId.get(nodeId)?.data ?? {}) as Record<string, unknown>;
    if (
      positiveNumber(data.matrixWidthOverride)
      || positiveNumber(data.matrixHeightOverride)
      || nonNegativeNumber(data.matrixSiblingGap) !== null
    ) return true;
    const nextAncestors = new Set(ancestors).add(nodeId);
    return visibleChildren(nodeId, hierarchy, byId)
      .filter((childId) => !nextAncestors.has(childId))
      .some((childId) => visit(childId, nextAncestors));
  };
  return visit(rootId, new Set());
}

function hasCompactLeafSiblingGroups(
  rootId: string,
  hierarchy: Hierarchy,
  byId: Map<string, Node>
): boolean {
  const visit = (nodeId: string, ancestors: Set<string>): boolean => {
    if (ancestors.has(nodeId)) return false;
    if (isCompactLeafSiblingGroup(nodeId, hierarchy, byId)) return true;
    const nextAncestors = new Set(ancestors).add(nodeId);
    return visibleChildren(nodeId, hierarchy, byId)
      .filter((childId) => !nextAncestors.has(childId))
      .some((childId) => visit(childId, nextAncestors));
  };
  return visit(rootId, new Set());
}

type StretchTrack = { start: number; end: number; locked: boolean };

function uniqueStretchTracks(
  cells: OrientedBranchCell[],
  axis: "horizontal" | "vertical"
): StretchTrack[] {
  const tracks = cells.map((cell) => {
    const start = axis === "horizontal" ? cell.x : cell.y;
    const end = start + (axis === "horizontal" ? cell.width : cell.height);
    return {
      start,
      end,
      locked: axis === "horizontal" ? cell.widthLocked === true : cell.heightLocked === true,
    };
  })
    .sort((first, second) => first.start - second.start || first.end - second.end);
  const unique: StretchTrack[] = [];
  for (const track of tracks) {
    const previous = unique.at(-1);
    if (
      previous
      && Math.abs(previous.start - track.start) <= 0.5
      && Math.abs(previous.end - track.end) <= 0.5
    ) {
      previous.locked ||= track.locked;
    } else {
      unique.push({ ...track });
    }
  }
  return unique;
}

function cellPerpendicularRange(
  cell: OrientedBranchCell,
  axis: "horizontal" | "vertical"
): StretchTrack {
  const start = axis === "horizontal" ? cell.y : cell.x;
  return {
    start,
    end: start + (axis === "horizontal" ? cell.height : cell.width),
    locked: false,
  };
}

function stretchTracksForCell(
  cells: OrientedBranchCell[],
  cell: OrientedBranchCell,
  axis: "horizontal" | "vertical",
  allowLockedTerminalTracks = false
): StretchTrack[] {
  const perpendicular = cellPerpendicularRange(cell, axis);
  const midpoint = (perpendicular.start + perpendicular.end) / 2;
  const overlappingTerminals = cells.filter((candidate) => {
    const axisTerminal = axis === "horizontal"
      ? candidate.horizontalTerminal
      : candidate.verticalTerminal;
    if (!axisTerminal) return false;
    const range = cellPerpendicularRange(candidate, axis);
    return range.start < perpendicular.end - 0.5
      && range.end > perpendicular.start + 0.5;
  });

  // Mixed Fold rows can divide the same allocation into incompatible column
  // counts. Stretch against one visible cross-axis slice instead of combining
  // every terminal interval into a false global grid. This keeps each row
  // contiguous while cells spanning that row still absorb the same total.
  const slice = overlappingTerminals.length
    ? cellPerpendicularRange(
      overlappingTerminals.reduce((nearest, candidate) => {
        const nearestRange = cellPerpendicularRange(nearest, axis);
        const candidateRange = cellPerpendicularRange(candidate, axis);
        const nearestExtent = nearestRange.end - nearestRange.start;
        const candidateExtent = candidateRange.end - candidateRange.start;
        if (candidateExtent < nearestExtent - 0.5) return candidate;
        if (candidateExtent > nearestExtent + 0.5) return nearest;
        const nearestDistance = Math.abs((nearestRange.start + nearestRange.end) / 2 - midpoint);
        const candidateDistance = Math.abs((candidateRange.start + candidateRange.end) / 2 - midpoint);
        return candidateDistance < nearestDistance ? candidate : nearest;
      }),
      axis
    )
    : perpendicular;
  const coordinate = (slice.start + slice.end) / 2;
  const activeTerminals = overlappingTerminals.filter((candidate) => {
    const range = cellPerpendicularRange(candidate, axis);
    return range.start <= coordinate + 0.5 && range.end >= coordinate - 0.5;
  });
  const activeCells = activeTerminals.length
    ? activeTerminals
    : cells.filter((candidate) => {
      const range = cellPerpendicularRange(candidate, axis);
      return range.start <= coordinate + 0.5 && range.end >= coordinate - 0.5;
    });
  const tracks = uniqueStretchTracks(activeCells, axis);
  // An exact terminal size defines its own hierarchy track. When a peer branch
  // continues to a deeper level, that terminal still has to merge across the
  // unused descendant tracks; otherwise the table exposes false divisions.
  return allowLockedTerminalTracks && activeTerminals.length
    ? tracks.map((track) => ({ ...track, locked: false }))
    : tracks;
}

function stretchCellAxis(
  start: number,
  size: number,
  tracks: StretchTrack[],
  extra: number
): { start: number; size: number } {
  if (extra <= 0 || !tracks.length) return { start, size };
  const end = start + size;
  const flexibleTracks = tracks.filter((track) => !track.locked);
  if (!flexibleTracks.length) return { start, size };
  let shift = 0;
  let growth = 0;
  flexibleTracks.forEach((track, trackIndex) => {
    const share = proportionalShare(extra, trackIndex, flexibleTracks.length);
    if (track.end <= start + 0.5) shift += share;
    if (start <= track.start + 0.5 && end >= track.end - 0.5) growth += share;
  });
  return { start: start + shift, size: size + growth };
}

/**
 * Extend terminal row/column bands so a branch tiles its full allocation when
 * a sibling needs more depth. Folded bands divide extra space equally, while
 * parent cells spanning those bands grow across the combined allocation.
 */
function stretchOrientedBranch(
  branch: OrientedBranchLayout,
  targetWidth: number,
  targetHeight: number,
  options: {
    allowLockedHorizontalTerminalTracks?: boolean;
    allowLockedVerticalTerminalTracks?: boolean;
  } = {}
): OrientedBranchLayout {
  const width = Math.max(branch.width, targetWidth);
  const height = Math.max(branch.height, targetHeight);
  const extraWidth = width - branch.width;
  const extraHeight = height - branch.height;
  if (extraWidth <= 0 && extraHeight <= 0) return branch;
  return {
    width,
    height,
    cells: branch.cells.map((cell) => {
      const horizontalTracks = stretchTracksForCell(
        branch.cells,
        cell,
        "horizontal",
        options.allowLockedHorizontalTerminalTracks
      );
      const verticalTracks = stretchTracksForCell(
        branch.cells,
        cell,
        "vertical",
        options.allowLockedVerticalTerminalTracks
      );
      const horizontal = stretchCellAxis(cell.x, cell.width, horizontalTracks, extraWidth);
      const vertical = stretchCellAxis(cell.y, cell.height, verticalTracks, extraHeight);
      return {
        ...cell,
        x: horizontal.start,
        width: horizontal.size,
        y: vertical.start,
        height: vertical.size,
      };
    }),
  };
}

type OrientedChildEntry = {
  nodeId: string;
  layout: OrientedBranchLayout;
};

type HorizontalBand = {
  y: number;
  height: number;
  /** Ancestor cells before this row's terminal sibling group. */
  prefixCount: number;
  cells: OrientedBranchCell[];
};

/**
 * Split one horizontal Matrix branch into its visible row bands. Prefix cells
 * that span several Fold rows are repeated only in the temporary band model;
 * the authored cell remains a single merged cell in the returned layout.
 */
function horizontalBands(child: OrientedChildEntry): HorizontalBand[] | null {
  const terminalCells = child.layout.cells
    .filter((cell) => cell.horizontalTerminal)
    .sort((first, second) => first.y - second.y || first.x - second.x);
  if (!terminalCells.length) return null;

  const grouped: Array<{
    y: number;
    bottom: number;
    cells: OrientedBranchCell[];
  }> = [];
  for (const cell of terminalCells) {
    const bottom = cell.y + cell.height;
    const band = grouped.find((candidate) =>
      Math.abs(candidate.y - cell.y) <= 0.5
      && Math.abs(candidate.bottom - bottom) <= 0.5
    );
    if (band) band.cells.push(cell);
    else grouped.push({ y: cell.y, bottom, cells: [cell] });
  }

  const bands = grouped
    .sort((first, second) => first.y - second.y)
    .map<HorizontalBand>((band) => {
      const midpoint = (band.y + band.bottom) / 2;
      const spanningPrefix = child.layout.cells.filter((cell) =>
        !cell.horizontalTerminal
        && cell.y <= midpoint + 0.5
        && cell.y + cell.height >= midpoint - 0.5
      );
      return {
        y: band.y,
        height: band.bottom - band.y,
        prefixCount: spanningPrefix.length,
        cells: [...spanningPrefix, ...band.cells]
          .sort((first, second) => first.x - second.x),
      };
    });

  for (const band of bands) {
    if (band.cells.length < 2) return null;
    for (let index = 1; index < band.cells.length; index += 1) {
      const previous = band.cells[index - 1];
      if (band.cells[index].x < previous.x + previous.width - 0.5) return null;
    }
  }
  return bands;
}

/**
 * Every horizontal band under sibling branches can share one Matrix column
 * template, including Fold continuations. In empty-slot mode the template
 * comes from a real row with the greatest logical cell count; shorter rows do
 * not redefine those tracks with widths that were stretched only to fill their
 * former allocation. Rows with incompatible complete-row overrides or custom
 * gaps stay independent instead of inventing a synthetic grid.
 */
function alignSiblingRowBands(
  children: OrientedChildEntry[],
  preserveEmptySlots: boolean
): OrientedChildEntry[] {
  if (children.length < 2) return children;
  const rowChildren = children.flatMap((child, childIndex) => {
    const bands = horizontalBands(child);
    return bands ? [{ childIndex, bands }] : [];
  });
  const allBands = rowChildren.flatMap(({ bands }) => bands);
  const rows = allBands.map((band) => band.cells);
  if (rows.length < 2) return children;
  const maximumPrefixCount = Math.max(...allBands.map((band) => band.prefixCount));
  const trackCount = preserveEmptySlots
    ? Math.max(...rows.map((row) => row.length))
    : rows[0].length;
  const missingPeerTracks = Array.from({ length: trackCount }, (_, trackIndex) =>
    rows.some((row) => (
      row[trackIndex]?.horizontalTerminal === true
      && row[trackIndex].terminalPeerFlow === "row"
    ))
  );
  if (!preserveEmptySlots && rows.some((row) => row.length !== trackCount)) return children;

  let widths: number[];
  if (preserveEmptySlots) {
    const completeRows = rows.filter((row) => row.length === trackCount);
    const lockedWidthsByTrack = Array.from({ length: trackCount }, (_, trackIndex) =>
      completeRows
        .map((row) => row[trackIndex])
        .filter((cell) => cell.widthLocked)
        .map((cell) => cell.width)
    );
    if (lockedWidthsByTrack.some((lockedWidths) => (
      lockedWidths.length > 1
      && Math.max(...lockedWidths) - Math.min(...lockedWidths) > 0.5
    ))) return children;

    const template = [...completeRows]
      .sort((first, second) => {
        const firstLocks = first.filter((cell) => cell.widthLocked).length;
        const secondLocks = second.filter((cell) => cell.widthLocked).length;
        if (firstLocks !== secondLocks) return secondLocks - firstLocks;
        const firstWidth = Math.max(...first.map((cell) => cell.x + cell.width));
        const secondWidth = Math.max(...second.map((cell) => cell.x + cell.width));
        return secondWidth - firstWidth;
      })
      .find((row) => lockedWidthsByTrack.every((lockedWidths, trackIndex) => (
        !lockedWidths.length
        || Math.abs(row[trackIndex].width - lockedWidths[0]) <= 0.5
      )));
    if (!template) return children;
    widths = template.map((cell) => cell.width);
  } else {
    widths = [];
    for (let trackIndex = 0; trackIndex < trackCount; trackIndex += 1) {
      const lockedWidths = rows
        .map((row) => row[trackIndex])
        .filter((cell) => cell.widthLocked)
        .map((cell) => cell.width);
      if (
        lockedWidths.length > 1
        && Math.max(...lockedWidths) - Math.min(...lockedWidths) > 0.5
      ) return children;
      widths.push(lockedWidths[0] ?? Math.max(...rows.map((row) => row[trackIndex].width)));
    }
  }

  const gaps: number[] = [];
  for (let trackIndex = 0; trackIndex < trackCount - 1; trackIndex += 1) {
    const rowGaps = rows.flatMap((row) => (
      row[trackIndex] && row[trackIndex + 1]
        ? [row[trackIndex + 1].x - (row[trackIndex].x + row[trackIndex].width)]
        : []
    ));
    if (!rowGaps.length) return children;
    if (Math.max(...rowGaps) - Math.min(...rowGaps) > 0.5) return children;
    gaps.push(rowGaps.reduce((sum, gap) => sum + gap, 0) / rowGaps.length);
  }

  const trackX: number[] = [];
  let nextX = 0;
  widths.forEach((width, trackIndex) => {
    trackX.push(nextX);
    nextX += width + (gaps[trackIndex] ?? 0);
  });
  const alignedWidth = nextX;
  const widestNaturalBand = Math.max(
    ...rows.map((row) => Math.max(...row.map((cell) => cell.x + cell.width)))
  );
  // Column sharing may align existing divisions, but it must not assemble a
  // width that no authored row actually has. Mixed Fold bands often put one
  // wide cell in different ordinal positions; summing those unrelated maxima
  // creates the oversized empty "Frankenstein" grid seen on complex tables.
  if (alignedWidth > widestNaturalBand + 0.5) return children;

  const bandsByChildIndex = new Map(
    rowChildren.map(({ childIndex, bands }) => [childIndex, bands])
  );
  return children.map((child, childIndex) => {
    const bands = bandsByChildIndex.get(childIndex);
    if (!bands) return child;
    const replacements = new Map<string, OrientedBranchCell>();
    for (const band of bands) {
      const alignedCells = band.cells.map((cell, trackIndex) => ({
        ...cell,
        x: trackX[trackIndex],
        width: widths[trackIndex],
      }));
      if (preserveEmptySlots && band.prefixCount < maximumPrefixCount) {
        const terminals = alignedCells.filter((cell) => cell.horizontalTerminal);
        const rowRight = Math.max(...alignedCells.map((cell) => cell.x + cell.width));
        const extraWidth = Math.max(0, alignedWidth - rowRight);
        let terminalShift = 0;
        terminals.forEach((cell, terminalIndex) => {
          const growth = proportionalShare(extraWidth, terminalIndex, terminals.length);
          replacements.set(cell.nodeId, {
            ...cell,
            x: cell.x + terminalShift,
            width: cell.width + growth,
          });
          terminalShift += growth;
        });
      }
      alignedCells.forEach((cell) => {
        if (replacements.has(cell.nodeId)) return;
        replacements.set(cell.nodeId, {
          ...cell,
        });
      });
    }
    const placeholders = preserveEmptySlots
      ? bands.flatMap((band, bandIndex) =>
        band.prefixCount < maximumPrefixCount
          ? []
          : Array.from(
            { length: trackCount - band.cells.length },
            (_, index): OrientedBranchCell => {
              const trackIndex = band.cells.length + index;
              return {
                nodeId: `__matrix-empty-${child.nodeId}-${bandIndex}-${trackIndex}`,
                x: trackX[trackIndex],
                y: band.y,
                width: widths[trackIndex],
                height: band.height,
                requiredHeight: band.height,
                terminal: true,
                horizontalTerminal: true,
                verticalTerminal: true,
                placeholder: true,
                missingPeerSlot: missingPeerTracks[trackIndex],
              };
            }
          )
      )
      : [];
    return {
      ...child,
      layout: {
        ...child.layout,
        width: alignedWidth,
        cells: [
          ...child.layout.cells.map((cell) => replacements.get(cell.nodeId) ?? cell),
          ...placeholders,
        ],
      },
    };
  });
}

function isTerminalSibling(child: OrientedChildEntry): boolean {
  return child.layout.cells.length === 1
    && child.layout.cells[0].nodeId === child.nodeId
    && child.layout.cells[0].terminal;
}

/**
 * Leaf children under one parent are peers in the same Matrix sibling group.
 * Give them one shared content-aware height before Fold divides the group into
 * sections, so a shorter final section cannot make its cells look unrelated.
 */
function equalizeTerminalSiblingHeights(
  children: OrientedChildEntry[]
): { children: OrientedChildEntry[]; equalized: boolean } {
  if (children.length < 2 || !children.every(isTerminalSibling)) {
    return { children, equalized: false };
  }
  const sharedHeight = Math.max(...children.map((child) => child.layout.height));
  return {
    equalized: true,
    children: children.map((child) => ({
      ...child,
      layout: stretchOrientedBranch(child.layout, child.layout.width, sharedHeight),
    })),
  };
}

function orientedChildSections(
  parentData: Record<string, unknown>,
  children: OrientedChildEntry[]
): OrientedChildEntry[][] {
  const childIds = children.map((child) => child.nodeId);
  const idSections = resolvedFoldSections(parentData, childIds);
  const byChildId = new Map(children.map((child) => [child.nodeId, child]));
  return idSections.map((section) => section.flatMap((childId) => byChildId.get(childId) ?? []));
}

/**
 * A Fold turns one terminal sibling group into multiple Matrix rows. In
 * empty-slot mode those rows keep a shared column template, and shorter final
 * rows receive geometry-only placeholders instead of stretching their cells.
 */
function alignFoldedTerminalRows(
  sections: OrientedChildEntry[][],
  preserveEmptySlots: boolean
): OrientedChildEntry[][] {
  if (
    !preserveEmptySlots
    || sections.length < 2
    || sections.some((section) => !section.length)
    || sections.some((section) => !section.every(isTerminalSibling))
  ) return sections;

  const trackCount = Math.max(...sections.map((section) => section.length));
  if (sections.every((section) => section.length === trackCount)) return sections;

  const widths: number[] = [];
  for (let trackIndex = 0; trackIndex < trackCount; trackIndex += 1) {
    const trackEntries = sections.flatMap((section) => section[trackIndex] ?? []);
    const lockedWidths = trackEntries
      .filter((entry) => entry.layout.cells[0].widthLocked)
      .map((entry) => entry.layout.width);
    if (
      lockedWidths.length > 1
      && Math.max(...lockedWidths) - Math.min(...lockedWidths) > 0.5
    ) return sections;
    widths.push(lockedWidths[0] ?? Math.max(...trackEntries.map((entry) => entry.layout.width)));
  }

  const sharedHeight = Math.max(
    ...sections.flatMap((section) => section.map((entry) => entry.layout.height))
  );
  return sections.map((section, sectionIndex) => {
    const resized = section.map((entry, trackIndex): OrientedChildEntry => ({
      ...entry,
      layout: {
        width: widths[trackIndex],
        height: sharedHeight,
        cells: entry.layout.cells.map((cell) => ({
          ...cell,
          width: widths[trackIndex],
          height: sharedHeight,
        })),
      },
    }));
    const sourceId = section[section.length - 1].nodeId;
    const placeholders = Array.from(
      { length: trackCount - section.length },
      (_, index): OrientedChildEntry => {
        const trackIndex = section.length + index;
        const nodeId = `__matrix-empty-fold-${sourceId}-${sectionIndex}-${trackIndex}`;
        return {
          nodeId,
          layout: {
            width: widths[trackIndex],
            height: sharedHeight,
            cells: [{
              nodeId,
              x: 0,
              y: 0,
              width: widths[trackIndex],
              height: sharedHeight,
              requiredHeight: sharedHeight,
              terminal: true,
              horizontalTerminal: true,
              verticalTerminal: true,
              placeholder: true,
              missingPeerSlot: true,
            }],
          },
        };
      }
    );
    return [...resized, ...placeholders];
  });
}

function proportionalShare(total: number, index: number, count: number): number {
  return total * (index + 1) / count - total * index / count;
}

function layoutOrientedChildSections(
  parentData: Record<string, unknown>,
  children: OrientedChildEntry[],
  childFlow: MatrixChildFlow,
  settings: DensitySettings,
  siblingGap: number,
  preserveEmptySlots: boolean,
  minimumWidth = 0,
  minimumHeight = 0
): OrientedBranchLayout {
  if (!children.length) return { width: minimumWidth, height: minimumHeight, cells: [] };
  const siblingGroup = equalizeTerminalSiblingHeights(children);
  const rawSections = orientedChildSections(parentData, siblingGroup.children);
  const foldedTerminalGroup = rawSections.length > 1
    && rawSections.every((section) => section.every(isTerminalSibling));
  const sections = childFlow === "column"
    ? rawSections.map((section) => alignSiblingRowBands(section, preserveEmptySlots))
    : alignFoldedTerminalRows(rawSections, preserveEmptySlots);
  // Fold is a continuation of the same Matrix, so it uses the same thin gap as
  // every other cell boundary. A larger separator exposes the canvas between
  // cells and makes the continuation look like a broken table.
  const foldGap = sections.length > 1 ? siblingGap : 0;

  if (childFlow === "column") {
    const naturalSections = sections.map((section) => ({
      children: section,
      width: Math.max(...section.map((child) => child.layout.width)),
      height: section.reduce((sum, child) => sum + child.layout.height, 0)
        + siblingGap * (section.length - 1),
    }));
    const naturalWidth = naturalSections.reduce((sum, section) => sum + section.width, 0)
      + foldGap * (naturalSections.length - 1);
    const width = Math.max(minimumWidth, naturalWidth);
    const height = Math.max(minimumHeight, ...naturalSections.map((section) => section.height));
    const extraWidth = width - naturalWidth;
    const cells: OrientedBranchCell[] = [];
    let sectionX = 0;

    naturalSections.forEach((section, sectionIndex) => {
      const sectionWidth = section.width
        + proportionalShare(extraWidth, sectionIndex, naturalSections.length);
      // Terminal Fold sections are one logical table track and keep their
      // shared edge. Complex branches retain their natural subtree height:
      // filling a shorter branch would recursively inflate and misalign all of
      // its descendant cells.
      const extraHeight = sections.length < 2 || foldedTerminalGroup
        ? height - section.height
        : 0;
      let childY = 0;
      section.children.forEach((child, childIndex) => {
        const childHeight = child.layout.height
          + proportionalShare(extraHeight, childIndex, section.children.length);
        const stretched = stretchOrientedBranch(
          child.layout,
          sectionWidth,
          childHeight,
          { allowLockedHorizontalTerminalTracks: true }
        );
        cells.push(...translateOrientedCells(stretched.cells, sectionX, childY));
        childY += stretched.height + siblingGap;
      });
      sectionX += sectionWidth + foldGap;
    });
    return { width, height, cells };
  }

  const naturalSections = sections.map((section) => ({
    children: section,
    width: section.reduce((sum, child) => sum + child.layout.width, 0)
      + siblingGap * (section.length - 1),
    height: Math.max(...section.map((child) => child.layout.height)),
  }));
  const naturalHeight = naturalSections.reduce((sum, section) => sum + section.height, 0)
    + foldGap * (naturalSections.length - 1);
  const width = Math.max(minimumWidth, ...naturalSections.map((section) => section.width));
  const height = Math.max(minimumHeight, naturalHeight);
  const extraHeight = height - naturalHeight;
  const cells: OrientedBranchCell[] = [];
  let sectionY = 0;

  naturalSections.forEach((section, sectionIndex) => {
    const sectionHeight = section.height
      + proportionalShare(extraHeight, sectionIndex, naturalSections.length);
    // This is the vertical counterpart of the natural-height rule above.
    // Only terminal Fold rows share the widest section's outer edge.
    const extraWidth = sections.length < 2 || foldedTerminalGroup
      ? width - section.width
      : 0;
    let childX = 0;
    section.children.forEach((child, childIndex) => {
      const childWidth = child.layout.width
        + proportionalShare(extraWidth, childIndex, section.children.length);
      const stretched = stretchOrientedBranch(
        child.layout,
        childWidth,
        sectionHeight,
        { allowLockedVerticalTerminalTracks: true }
      );
      cells.push(...translateOrientedCells(stretched.cells, childX, sectionY));
      childX += stretched.width + siblingGap;
    });
    sectionY += sectionHeight + foldGap;
  });
  return { width, height, cells };
}

/**
 * Builds the mixed Matrix form. Branch direction decides whether the direct
 * child area sits right of or below its parent, while child flow independently
 * decides whether direct siblings form a row or a column.
 */
function computeOrientedMatrixLayout(
  rootId: string,
  hierarchy: Hierarchy,
  byId: Map<string, Node>,
  rows: MatrixRow[],
  spanMap: Map<string, MatrixLogicalSpan>,
  duplicateNodeIds: Set<string>,
  columnWidths: number[],
  automaticColumnWidths: number[],
  density: MatrixTableDensity,
  settings: DensitySettings,
  tableX: number,
  tableY: number,
  packCompactGroups: boolean
): MatrixLayoutResult {
  const root = byId.get(rootId)!;
  const rootData = (root.data ?? {}) as Record<string, unknown>;
  const preserveEmptySlots = rootData.matrixIncompleteRowMode === "empty";
  const rootOrientation = storedOrientation(rootData.matrixOrientation) ?? "horizontal";
  const rootChildFlow = matrixChildFlowForNode(
    rootId,
    rootOrientation,
    hierarchy,
    byId,
    packCompactGroups
  );

  const buildBranch = (
    nodeId: string,
    column: number,
    inherited: MatrixOrientation,
    parentChildFlow: MatrixChildFlow,
    ancestors: Set<string>
  ): OrientedBranchLayout => {
    const node = byId.get(nodeId);
    if (!node || ancestors.has(nodeId)) return { width: 0, height: 0, cells: [] };
    const data = (node.data ?? {}) as Record<string, unknown>;
    const orientation = matrixOrientationForNode(nodeId, inherited, byId);
    const childFlow = matrixChildFlowForNode(
      nodeId,
      orientation,
      hierarchy,
      byId,
      packCompactGroups
    );
    const exactWidth = positiveNumber(data.matrixWidthOverride);
    const exactHeight = positiveNumber(data.matrixHeightOverride);
    const width = exactWidth
      ? Math.ceil(clamp(exactWidth, MATRIX_USER_MIN_COLUMN_WIDTH, MATRIX_USER_MAX_COLUMN_WIDTH))
      : automaticColumnWidths[column] ?? preferredCellWidth(node, column, settings, false);
    const ownRequiredHeight = requiredCellHeight(node, width, settings);
    const nextAncestors = new Set(ancestors).add(nodeId);
    const children = visibleChildren(nodeId, hierarchy, byId)
      .filter((childId) => !nextAncestors.has(childId))
      .map((childId) => ({
        nodeId: childId,
        layout: buildBranch(childId, column + 1, orientation, childFlow, nextAncestors),
      }))
      .filter((child) => child.layout.cells.length > 0);

    if (!children.length) {
      return {
        width,
        height: ownRequiredHeight,
        cells: [{
          nodeId,
          x: 0,
          y: 0,
          width,
          height: ownRequiredHeight,
          requiredHeight: ownRequiredHeight,
          terminal: true,
          horizontalTerminal: true,
          verticalTerminal: true,
          widthLocked: exactWidth !== null,
          heightLocked: exactHeight !== null,
          terminalPeerFlow: parentChildFlow,
          mergeTrailingHorizontal: orientation === "horizontal" && parentChildFlow === "column",
          mergeTrailingVertical: orientation === "vertical" && parentChildFlow === "row",
        }],
      };
    }

    const siblingGap = matrixSiblingGapForNode(nodeId, settings.cellGap, byId);
    const childArea = layoutOrientedChildSections(
      data,
      children,
      childFlow,
      settings,
      siblingGap,
      preserveEmptySlots,
      orientation === "vertical" ? width : 0,
      orientation === "horizontal" ? ownRequiredHeight : 0
    );

    if (orientation === "vertical") {
      return {
        width: childArea.width,
        height: ownRequiredHeight + settings.cellGap + childArea.height,
        cells: [
          {
            nodeId,
            x: 0,
            y: 0,
            width: childArea.width,
            height: ownRequiredHeight,
            requiredHeight: ownRequiredHeight,
            terminal: false,
            horizontalTerminal: true,
            verticalTerminal: false,
            widthLocked: exactWidth !== null,
            heightLocked: exactHeight !== null,
          },
          ...translateOrientedCells(childArea.cells, 0, ownRequiredHeight + settings.cellGap),
        ],
      };
    }

    return {
      width: width + settings.cellGap + childArea.width,
      height: childArea.height,
      cells: [
        {
          nodeId,
          x: 0,
          y: 0,
          width,
          height: childArea.height,
          requiredHeight: ownRequiredHeight,
          terminal: false,
          horizontalTerminal: false,
          verticalTerminal: true,
          widthLocked: exactWidth !== null,
          heightLocked: exactHeight !== null,
        },
        ...translateOrientedCells(childArea.cells, width + settings.cellGap, 0),
      ],
    };
  };

  const builtRootChildren = visibleChildren(rootId, hierarchy, byId)
    .map((childId) => ({
      nodeId: childId,
      layout: buildBranch(childId, 0, rootOrientation, rootChildFlow, new Set([rootId])),
    }))
    .filter((child) => child.layout.cells.length > 0);
  const preferredHeaderWidth = Math.ceil(clamp(
    preferredCellWidth(root, 0, settings),
    MATRIX_HEADER_MIN_WIDTH,
    760
  ));
  const body = layoutOrientedChildSections(
    rootData,
    builtRootChildren,
    rootChildFlow,
    settings,
    matrixSiblingGapForNode(rootId, settings.cellGap, byId),
    preserveEmptySlots,
    preferredHeaderWidth,
    0
  );
  const tableWidth = body.width;
  const bodyHeight = body.height;
  const headerHeight = requiredCellHeight(root, tableWidth, settings, settings.minHeaderHeight);
  const bodyY = tableY + headerHeight + (builtRootChildren.length ? settings.cellGap : 0);
  const bodyX = tableX;
  const orientedCells = mergeOrientedTerminalCellsToOuterEdge(
    translateOrientedCells(body.cells, bodyX, bodyY)
  );

  const emptyCells = orientedCells
    .filter((cell) => cell.placeholder)
    .map<MatrixEmptyCellGeometry>((cell) => ({
      x: cell.x,
      y: cell.y,
      width: cell.width,
      height: cell.height,
    }));
  const cells = orientedCells
    .filter((cell) => !cell.placeholder)
    .map<MatrixCellGeometry>((cell) => {
      const span = spanMap.get(cell.nodeId);
      return {
        ...cell,
        column: span?.column ?? 0,
        rowStart: span?.rowStart ?? 0,
        rowEnd: span?.rowEnd ?? 0,
        rowSpan: span ? span.rowEnd - span.rowStart + 1 : 1,
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
    width: tableWidth,
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

  const columnX: number[] = [];
  let nextColumnX = tableX;
  for (const width of columnWidths) {
    columnX.push(nextColumnX);
    nextColumnX += width + settings.cellGap;
  }
  const rowHeights = rows.map((row) => Math.max(
    settings.minRowHeight,
    ...row.path.map((nodeId, column) => {
      const node = byId.get(nodeId);
      return node ? requiredCellHeight(node, columnWidths[column] ?? MATRIX_MIN_COLUMN_WIDTH, settings) : 0;
    })
  ));
  const rowY: number[] = [];
  let nextRowY = bodyY;
  for (const height of rowHeights) {
    rowY.push(nextRowY);
    nextRowY += height + settings.cellGap;
  }
  const totalHeight = headerHeight + (bodyHeight ? settings.cellGap + bodyHeight : 0);
  const bounds = createNodeRect(`matrix-bounds-${rootId}`, tableX, tableY, tableWidth, totalHeight);
  const diagnostics = diagnoseMatrix(rootId, rows, cells, header, hierarchy, byId);
  diagnostics.duplicateNodeIds.push(...[...duplicateNodeIds]
    .filter((id) => !diagnostics.duplicateNodeIds.includes(id)));

  if (process.env.NODE_ENV !== "production" && Object.values(diagnostics).some((items) => items.length)) {
    console.warn("[matrix-layout] geometry diagnostics", diagnostics);
  }

  return {
    rootId,
    density,
    orientation: rootOrientation,
    rows,
    cells,
    emptyCells,
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

function applyMatrixTableSizeOverrides(
  result: MatrixLayoutResult,
  root: Node,
  byId: Map<string, Node>
): MatrixLayoutResult {
  const data = (root.data ?? {}) as Record<string, unknown>;
  const requestedWidth = positiveNumber(data.matrixTableWidthOverride);
  const requestedHeight = positiveNumber(data.matrixTableHeightOverride);
  if (!requestedWidth && !requestedHeight) return result;

  const targetWidth = requestedWidth
    ? clamp(requestedWidth, MATRIX_MIN_TABLE_WIDTH, MATRIX_MAX_TABLE_WIDTH)
    : result.bounds.width;
  const targetHeight = requestedHeight
    ? clamp(requestedHeight, MATRIX_MIN_TABLE_HEIGHT, MATRIX_MAX_TABLE_HEIGHT)
    : result.bounds.height;
  const scaleX = targetWidth / Math.max(1, result.bounds.width);
  const scaleY = targetHeight / Math.max(1, result.bounds.height);
  const originX = result.bounds.left;
  const originY = result.bounds.top;
  const scaleCell = (cell: MatrixCellGeometry): MatrixCellGeometry => ({
    ...cell,
    x: originX + (cell.x - originX) * scaleX,
    y: originY + (cell.y - originY) * scaleY,
    width: cell.width * scaleX,
    height: cell.height * scaleY,
    requiredHeight: cell.requiredHeight * scaleY,
  });
  const header = scaleCell(result.header);
  const cells = result.cells.map(scaleCell);
  const emptyCells = result.emptyCells.map((cell) => ({
    ...cell,
    x: originX + (cell.x - originX) * scaleX,
    y: originY + (cell.y - originY) * scaleY,
    width: cell.width * scaleX,
    height: cell.height * scaleY,
  }));
  const placements: Record<string, MatrixPlacement> = {};
  for (const cell of [header, ...cells]) {
    const node = byId.get(cell.nodeId);
    if (!node) continue;
    const position = nodePositionForRect(node, cell.x, cell.y, cell.width, cell.height);
    placements[cell.nodeId] = { ...position, width: cell.width, height: cell.height };
  }

  return {
    ...result,
    cells,
    emptyCells,
    placements,
    columnWidths: result.columnWidths.map((width) => width * scaleX),
    columnX: result.columnX.map((x) => originX + (x - originX) * scaleX),
    rowHeights: result.rowHeights.map((height) => height * scaleY),
    rowY: result.rowY.map((y) => originY + (y - originY) * scaleY),
    header,
    bounds: createNodeRect(result.bounds.id, originX, originY, targetWidth, targetHeight),
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

  const spanMap = new Map<string, MatrixLogicalSpan>();
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
  const automaticColumnWidths = Array.from({ length: columnCount }, (_, column) => {
    const nodes = [...spanMap.values()]
      .filter((span) => span.column === column)
      .map((span) => byId.get(span.nodeId))
      .filter((node): node is Node => !!node);
    const minimum = column === 0 ? MATRIX_FIRST_COLUMN_MIN_WIDTH : MATRIX_MIN_COLUMN_WIDTH;
    return Math.max(
      minimum,
      ...nodes.map((node) => preferredCellWidth(node, column, settings, false))
    );
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

  const hasFoldedBranch = hasFoldedMatrixBranch(rootId, hierarchy, byId);
  const packCompactGroups = rootData.matrixPackCompactGroups === true
    && hasCompactLeafSiblingGroups(rootId, hierarchy, byId);
  if (
    hasVerticalMatrixBranch(rootId, hierarchy, byId)
    || hasFoldedBranch
    || hasExplicitMatrixChildFlow(rootId, hierarchy, byId)
    || packCompactGroups
    || hasExplicitMatrixGeometry(rootId, hierarchy, byId)
  ) {
    return applyMatrixTableSizeOverrides(computeOrientedMatrixLayout(
      rootId,
      hierarchy,
      byId,
      rows,
      spanMap,
      duplicateNodeIds,
      columnWidths,
      automaticColumnWidths,
      density,
      settings,
      tableX,
      tableY,
      packCompactGroups
    ), root, byId);
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

  // Direct leaf children under one parent are one visual sibling group. The
  // oriented/Fold path already normalizes this case before composing sections;
  // keep the standard hierarchy-table path consistent by giving every sibling
  // row the largest content-safe height in its group.
  for (const parentId of [rootId, ...spanMap.keys()]) {
    const childIds = visibleChildren(parentId, hierarchy, byId);
    if (
      childIds.length < 2
      || childIds.some((childId) => visibleChildren(childId, hierarchy, byId).length > 0)
    ) continue;
    const childSpans = childIds.flatMap((childId) => spanMap.get(childId) ?? []);
    if (
      childSpans.length !== childIds.length
      || childSpans.some((span) => span.rowStart !== span.rowEnd)
    ) continue;
    const siblingHeight = Math.max(
      ...childSpans.map((span) => rowHeights[span.rowStart])
    );
    childSpans.forEach((span) => {
      rowHeights[span.rowStart] = siblingHeight;
    });
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
      const isTerminal = visibleChildren(span.nodeId, hierarchy, byId).length === 0;
      const width = isTerminal
        ? columnWidths.slice(span.column).reduce((sum, columnWidth) => sum + columnWidth, 0)
          + settings.cellGap * (columnWidths.length - span.column - 1)
        : columnWidths[span.column];
      return {
        nodeId: span.nodeId,
        column: span.column,
        rowStart: span.rowStart,
        rowEnd: span.rowEnd,
        rowSpan: span.rowEnd - span.rowStart + 1,
        x: columnX[span.column],
        y,
        width,
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

  return applyMatrixTableSizeOverrides({
    rootId,
    density,
    orientation: storedOrientation(rootData.matrixOrientation) ?? "horizontal",
    rows,
    cells,
    emptyCells: [],
    placements,
    columnWidths,
    columnX,
    rowHeights,
    rowY,
    header,
    bounds,
    diagnostics,
  }, root, byId);
}
