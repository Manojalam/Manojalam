import type { AutoSizeMode } from "../types";
import type { Size } from "./node-geometry";
import {
  fitShapeToContent,
  MAX_AUTOFIT_NODE_HEIGHT,
  MAX_AUTOFIT_NODE_WIDTH,
  MAX_AUTOFIT_WIDTH,
  shapeTextContentSize,
  type ContentMeasurement,
} from "./shape-fitting";

export const SIZE_CHANGE_EPSILON = 2;
export const WIDTH_OVERFLOW_THRESHOLD = 8;
export const SHRINK_THRESHOLD = 24;
export const DEFAULT_PREFERRED_CONTENT_WIDTH = 240;

export type ContentResizeReason =
  | "input"
  | "paste"
  | "format"
  | "blur"
  | "layout"
  | "fit"
  | "conversion";

export interface AutoSizeOptions {
  mode: AutoSizeMode;
  currentSize: Size;
  content: ContentMeasurement;
  nodeType?: string;
  shapeType?: string;
  borderWidth?: number;
  cornerRadius?: number;
  textPadding?: number;
  reason?: ContentResizeReason;
  minWidth?: number;
  minHeight?: number;
  maxContentWidth?: number;
  maxWidth?: number;
  maxHeight?: number;
}

export interface AutoSizeResult extends Size {
  changed: boolean;
}

function positive(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function isSettledReason(reason: ContentResizeReason | undefined): boolean {
  return reason === "blur"
    || reason === "fit"
    || reason === "format"
    || reason === "conversion";
}

function isCoupledShape(shapeType: string): boolean {
  return [
    "circle", "ellipse", "diamond", "capsule", "star", "flower", "triangle",
    "arrow", "callout", "offPageConnector", "parallelogram", "trapezoid",
    "hexagon", "document", "database", "predefinedProcess", "delay", "cloud", "leaf",
  ].includes(shapeType);
}

export function resolveAutoSizeMode(data: Record<string, unknown>): AutoSizeMode {
  return data.autoSizeMode === "height-only" || data.autoSizeMode === "fixed"
    ? data.autoSizeMode
    : "smart";
}

export function shouldConstrainTextToNode(
  data: Record<string, unknown>,
  size: Size
): boolean {
  if (resolveAutoSizeMode(data) === "fixed") return true;
  if (data.layoutSizeOverride && typeof data.layoutSizeOverride === "object") return true;
  return size.width >= MAX_AUTOFIT_NODE_WIDTH - 1 || size.height >= MAX_AUTOFIT_NODE_HEIGHT - 1;
}

/**
 * Canonical node sizing policy. Content dimensions are authored-text pixels,
 * measured outside React Flow's transformed viewport.
 */
export function computeAutoSize(options: AutoSizeOptions): AutoSizeResult {
  const current = {
    width: positive(options.currentSize.width, options.minWidth ?? 160),
    height: positive(options.currentSize.height, options.minHeight ?? 56),
  };
  // A layout measurement is passive: it happens while a saved board hydrates,
  // when fonts finish loading, and whenever ResizeObserver rechecks the DOM.
  // It may refresh intrinsic text metrics, but it must never reinterpret the
  // persisted node rectangle as a new user sizing command.
  if (options.mode === "fixed" || options.reason === "layout") {
    return { ...current, changed: false };
  }

  const shapeType = options.shapeType ?? "rectangle";
  const nodeType = options.nodeType ?? "shape";
  const maxContentWidth = positive(options.maxContentWidth, MAX_AUTOFIT_WIDTH);
  const maxWidth = positive(options.maxWidth, MAX_AUTOFIT_NODE_WIDTH);
  const maxHeight = positive(options.maxHeight, MAX_AUTOFIT_NODE_HEIGHT);
  const content = {
    ...options.content,
    width: positive(options.content.width, 1),
    height: positive(options.content.height, 1),
  };
  const interior = shapeTextContentSize(shapeType, current, nodeType, {
    contentSize: content,
    textPadding: options.textPadding,
  });
  const naturalWidth = positive(content.naturalWidth, content.width);
  const singleLine = (content.lineCount ?? 1) <= 1.05;
  const horizontalOverflow = naturalWidth > interior.width + WIDTH_OVERFLOW_THRESHOLD;
  const verticalOverflow = content.height > interior.height + SIZE_CHANGE_EPSILON;
  const coupledShape = isCoupledShape(shapeType);
  const settled = isSettledReason(options.reason);

  let desiredContentWidth = Math.min(maxContentWidth, Math.max(1, content.width));
  if (singleLine) {
    desiredContentWidth = Math.min(maxContentWidth, naturalWidth);
  } else if (
    options.mode === "smart"
    && interior.width < DEFAULT_PREFERRED_CONTENT_WIDTH
    && naturalWidth > interior.width + WIDTH_OVERFLOW_THRESHOLD
    && (content.lineCount ?? 1) >= 4
  ) {
    desiredContentWidth = Math.min(maxContentWidth, naturalWidth, DEFAULT_PREFERRED_CONTENT_WIDTH);
  } else {
    desiredContentWidth = Math.min(maxContentWidth, interior.width);
  }

  const fitted = fitShapeToContent(shapeType, {
    ...content,
    width: desiredContentWidth,
  }, {
    nodeType,
    borderWidth: options.borderWidth,
    cornerRadius: options.cornerRadius,
    textPadding: options.textPadding,
    minWidth: options.minWidth,
    minHeight: options.minHeight,
    maxContentWidth,
    maxWidth,
    maxHeight,
  });

  let width = current.width;
  let height = current.height;

  if (options.mode === "height-only") {
    height = fitted.height;
  } else {
    const needsWidthGrowth = horizontalOverflow
      || (coupledShape && verticalOverflow)
      || (!singleLine && interior.width < DEFAULT_PREFERRED_CONTENT_WIDTH && desiredContentWidth > interior.width);
    if (needsWidthGrowth) width = Math.max(current.width, fitted.width);
    if (verticalOverflow || needsWidthGrowth) height = Math.max(current.height, fitted.height);
  }

  if (settled) {
    if (options.mode === "smart" && current.width - fitted.width >= SHRINK_THRESHOLD) {
      width = fitted.width;
    }
    if (current.height - fitted.height >= SIZE_CHANGE_EPSILON) height = fitted.height;
  }

  width = Math.max(options.minWidth ?? 160, Math.min(maxWidth, Math.ceil(width)));
  height = Math.max(options.minHeight ?? 56, Math.min(maxHeight, Math.ceil(height)));

  if (["circle", "diamond", "star", "flower"].includes(shapeType)) {
    const side = Math.min(maxWidth, maxHeight, Math.max(width, height));
    width = side;
    height = side;
  }

  const changed = Math.abs(width - current.width) > SIZE_CHANGE_EPSILON
    || Math.abs(height - current.height) > SIZE_CHANGE_EPSILON;
  return changed ? { width, height, changed: true } : { ...current, changed: false };
}

/** Scale authored rich text down only when a fixed/layout-owned box requires it. */
export function fittedContentScale(
  content: Partial<ContentMeasurement> | undefined,
  available: Size,
  minimumScale = 0.2
): number {
  if (!content) return 1;
  const width = positive(content.naturalWidth ?? content.width, 1);
  const wrappedWidth = positive(content.width, width);
  const height = positive(content.height, 1);
  const singleLine = (content.lineCount ?? 1) <= 1.05;
  const requiredWidth = singleLine ? width : wrappedWidth;
  // This is overflow fitting, not auto-fill: authored text may shrink to remain
  // visible, but larger boxes or reloads must never magnify it.
  const maximumScale = 1;
  const scale = Math.min(
    maximumScale,
    positive(available.width, 1) / requiredWidth,
    positive(available.height, 1) / height
  );
  return Math.max(
    Math.min(maximumScale, minimumScale),
    Math.min(maximumScale, Number.isFinite(scale) ? scale : 1)
  );
}
