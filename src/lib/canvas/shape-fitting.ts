import type { Size } from "./node-geometry";

export const MIN_AUTOFIT_WIDTH = 160;
export const MIN_AUTOFIT_HEIGHT = 56;
export const MAX_AUTOFIT_WIDTH = 560;
export const MAX_AUTOFIT_NODE_WIDTH = 640;
export const MAX_AUTOFIT_NODE_HEIGHT = 480;

export interface ContentMeasurement extends Size {
  lineCount?: number;
  lineHeight?: number;
}

export interface ShapeFitOptions {
  nodeType?: string;
  currentSize?: Size;
  borderWidth?: number;
  growOnly?: boolean;
  minWidth?: number;
  minHeight?: number;
  maxContentWidth?: number;
  maxWidth?: number;
  maxHeight?: number;
}

export interface SingleWordFit {
  singleWord: boolean;
  fontSize: number;
}

interface GraphemeSegmenter {
  segment(value: string): Iterable<unknown>;
}

const SegmenterConstructor = (Intl as unknown as {
  Segmenter?: new (locale: string, options: { granularity: "grapheme" }) => GraphemeSegmenter;
}).Segmenter;
const graphemeSegmenter = SegmenterConstructor
  ? new SegmenterConstructor("und", { granularity: "grapheme" })
  : null;

function finitePositive(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function nodePadding(nodeType: string | undefined): Size {
  if (nodeType === "sticky") return { width: 36, height: 30 };
  if (nodeType === "text") return { width: 36, height: 26 };
  if (nodeType === "mindmap") return { width: 44, height: 30 };
  return { width: 52, height: 42 };
}

function graphemeCount(value: string): number {
  return graphemeSegmenter
    ? Array.from(graphemeSegmenter.segment(value)).length
    : Array.from(value).length;
}

/** Keep one unbroken token on one line and reduce its font only when necessary. */
export function fitSingleUnbrokenWord(
  value: string,
  preferredFontSize: number,
  availableWidth: number
): SingleWordFit {
  const normalized = value.trim();
  const preferred = finitePositive(preferredFontSize, 14);
  if (!normalized || /\s/u.test(normalized)) return { singleWord: false, fontSize: preferred };

  const units = Math.max(1, graphemeCount(normalized));
  const widthFactor = /[\u2e80-\u9fff\uf900-\ufaff]/u.test(normalized)
    ? 1
    : /[\u0900-\u097f]/u.test(normalized) ? 0.95 : 0.58;
  const safeWidth = Math.max(1, availableWidth) * 0.96;
  const estimatedWidth = units * preferred * widthFactor;
  const fitted = estimatedWidth > safeWidth
    ? preferred * (safeWidth / estimatedWidth)
    : preferred;
  return { singleWord: true, fontSize: Math.max(0.5, Math.min(preferred, fitted)) };
}

/** Approximate the safe horizontal text interior used by each supported shape. */
export function shapeTextContentWidth(
  shapeType: string | undefined,
  renderedWidth: number,
  nodeType = "shape"
): number {
  const width = finitePositive(renderedWidth, MIN_AUTOFIT_WIDTH);
  const scale = (() => {
    switch (shapeType) {
      case "circle": return Math.SQRT2;
      case "ellipse": return Math.SQRT2;
      case "diamond": return 2;
      case "star":
      case "flower": return 1.8;
      case "triangle": return 1.75;
      case "arrow": return 1.55;
      case "callout":
      case "offPageConnector": return 1.3;
      case "parallelogram":
      case "trapezoid": return 1.35;
      case "hexagon":
      case "document":
      case "database":
      case "predefinedProcess":
      case "delay":
      case "cloud":
      case "leaf": return 1.26;
      case "capsule": return 1.5;
      default: return 1;
    }
  })();
  return Math.max(8, width / scale - nodePadding(nodeType).width);
}

/** Approximate the safe text rectangle inside a rendered node shape. */
export function shapeTextContentSize(
  shapeType: string | undefined,
  renderedSize: Size,
  nodeType = "shape"
): Size {
  const width = finitePositive(renderedSize.width, MIN_AUTOFIT_WIDTH);
  const height = finitePositive(renderedSize.height, MIN_AUTOFIT_HEIGHT);
  const padding = nodePadding(nodeType);
  const scale = (() => {
    switch (shapeType) {
      case "circle": return { width: Math.SQRT2, height: Math.SQRT2 };
      case "ellipse": return { width: Math.SQRT2, height: Math.SQRT2 };
      case "diamond": return { width: 2, height: 2 };
      case "star":
      case "flower": return { width: 1.8, height: 1.8 };
      case "triangle": return { width: 1.75, height: 1.9 };
      case "arrow": return { width: 1.55, height: 1.35 };
      case "callout":
      case "offPageConnector": return { width: 1.3, height: 1.42 };
      case "parallelogram":
      case "trapezoid": return { width: 1.35, height: 1.18 };
      case "hexagon":
      case "document":
      case "database":
      case "predefinedProcess":
      case "delay":
      case "cloud":
      case "leaf": return { width: 1.26, height: 1.26 };
      case "capsule": return { width: 1.5, height: 1 };
      default: return { width: 1, height: 1 };
    }
  })();
  return {
    width: Math.max(8, width / scale.width - padding.width),
    height: Math.max(8, height / scale.height - padding.height),
  };
}

function shapeSafeSize(shapeType: string, box: Size): Size {
  switch (shapeType) {
    case "circle": {
      const diameter = Math.max(box.width, box.height) * Math.SQRT2;
      return { width: diameter, height: diameter };
    }
    case "ellipse":
      return { width: box.width * Math.SQRT2, height: box.height * Math.SQRT2 };
    case "diamond":
      return { width: box.width * 2, height: box.height * 2 };
    case "star":
    case "flower": {
      const diameter = Math.max(box.width, box.height) * 1.8;
      return { width: diameter, height: diameter };
    }
    case "triangle":
      return { width: box.width * 1.75, height: box.height * 1.9 };
    case "arrow":
      return { width: box.width * 1.55, height: box.height * 1.35 };
    case "callout":
    case "offPageConnector":
      return { width: box.width * 1.3, height: box.height * 1.42 };
    case "parallelogram":
    case "trapezoid":
      return { width: box.width * 1.35, height: box.height * 1.18 };
    case "hexagon":
    case "document":
    case "database":
    case "predefinedProcess":
    case "delay":
    case "cloud":
    case "leaf":
      return { width: box.width * 1.26, height: box.height * 1.26 };
    case "capsule":
      return { width: Math.max(box.width + box.height, box.height * 2), height: box.height };
    default:
      return box;
  }
}

/** Fit a safe text rectangle into the visible interior of the requested shape. */
export function fitShapeToContent(
  shapeType: string | undefined,
  contentSize: ContentMeasurement,
  options: ShapeFitOptions = {}
): Size {
  const padding = nodePadding(options.nodeType);
  const borderAllowance = Math.max(0, finitePositive(options.borderWidth, 0)) * 2;
  const maxContentWidth = finitePositive(options.maxContentWidth, MAX_AUTOFIT_WIDTH - padding.width);
  const contentWidth = Math.min(maxContentWidth, finitePositive(contentSize.width, MIN_AUTOFIT_WIDTH - padding.width));
  const contentHeight = finitePositive(contentSize.height, MIN_AUTOFIT_HEIGHT - padding.height);
  const padded = {
    width: contentWidth + padding.width + borderAllowance,
    height: contentHeight + padding.height + borderAllowance,
  };
  const fitted = shapeSafeSize(shapeType ?? "rectangle", padded);
  let width = Math.max(options.minWidth ?? MIN_AUTOFIT_WIDTH, Math.ceil(fitted.width));
  let height = Math.max(options.minHeight ?? MIN_AUTOFIT_HEIGHT, Math.ceil(fitted.height));
  const maxWidth = finitePositive(options.maxWidth, Number.MAX_SAFE_INTEGER);
  const maxHeight = finitePositive(options.maxHeight, Number.MAX_SAFE_INTEGER);

  if (["circle", "diamond", "star", "flower"].includes(shapeType ?? "")) {
    const size = Math.min(Math.max(width, height), maxWidth, maxHeight);
    width = size;
    height = size;
  } else {
    width = Math.min(width, maxWidth);
    height = Math.min(height, maxHeight);
  }

  if (options.growOnly && options.currentSize) {
    // The limits govern automatic growth, not a size the user explicitly set.
    width = Math.max(width, finitePositive(options.currentSize.width, width));
    height = Math.max(height, finitePositive(options.currentSize.height, height));
  }
  return { width, height };
}

export function effectiveCornerRadius(percent: unknown, size: Size, fallbackPercent = 20): number {
  const numeric = typeof percent === "number" && Number.isFinite(percent) ? percent : fallbackPercent;
  const normalized = Math.max(0, Math.min(100, numeric)) / 100;
  return Math.min(finitePositive(size.width, 1), finitePositive(size.height, 1)) / 2 * normalized;
}

export function legacyRadiusToPercent(radius: unknown, size: Size, fallbackPercent = 20): number {
  if (typeof radius !== "number" || !Number.isFinite(radius) || radius < 0) return fallbackPercent;
  const maximum = Math.min(finitePositive(size.width, 1), finitePositive(size.height, 1)) / 2;
  return maximum > 0 ? Math.max(0, Math.min(100, radius / maximum * 100)) : fallbackPercent;
}
