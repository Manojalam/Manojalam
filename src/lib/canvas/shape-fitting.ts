import type { Size } from "./node-geometry";

export const MIN_AUTOFIT_WIDTH = 160;
export const MIN_AUTOFIT_HEIGHT = 56;
export const MAX_AUTOFIT_WIDTH = 480;
export const MAX_AUTOFIT_NODE_WIDTH = 640;
export const MAX_AUTOFIT_NODE_HEIGHT = 1200;
/** Explicit callers can opt into a larger canvas-local envelope. */
export const MAX_FREEFORM_AUTOFIT_NODE_WIDTH = 4096;
export const MAX_FREEFORM_AUTOFIT_NODE_HEIGHT = 4096;
export const MEASUREMENT_SAFETY_X = 2;
export const MEASUREMENT_SAFETY_Y = 2;

export interface ContentMeasurement extends Size {
  lineCount?: number;
  lineHeight?: number;
  /** Width of the longest explicit line before soft wrapping. */
  naturalWidth?: number;
  /** Height of the explicit lines before width-dependent soft wrapping. */
  naturalHeight?: number;
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
  cornerRadius?: number;
}

export interface SingleWordFit {
  singleWord: boolean;
  fontSize: number;
}

export interface MaximumTextFitOptions {
  minimumFontSize?: number;
  maximumFontSize?: number;
  preferredFontSize?: number;
}

export interface ShapeTextContentOptions {
  contentSize?: Partial<ContentMeasurement>;
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

export function nodeContentPadding(nodeType: string | undefined): Size {
  void nodeType;
  // Every editable content node already has a shape-safe text rectangle. Keep
  // only four pixels per side so all shared fill-space consumers use it fully.
  return { width: 8, height: 8 };
}

function shapeContentPadding(shapeType: string | undefined, nodeType: string | undefined): Size {
  if (shapeType === "diamond" && nodeType === "shape") {
    // Four pixels per side keeps text clear of the sloped border without
    // consuming most of the diamond's inscribed text rectangle.
    return { width: 8, height: 8 };
  }
  return nodeContentPadding(nodeType);
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

function estimatedTextWidth(value: string, fontSize: number): number {
  const widthFactor = /[\u2e80-\u9fff\uf900-\ufaff]/u.test(value)
    ? 1
    : /[\u0900-\u097f]/u.test(value) ? 0.82 : 0.56;
  return Math.max(1, graphemeCount(value)) * fontSize * widthFactor;
}

function estimatedWrappedLineCount(value: string, availableWidth: number, fontSize: number): number {
  const explicitLines = value.replace(/\r\n/g, "\n").split("\n");
  let lineCount = 0;
  for (const rawLine of explicitLines) {
    const line = rawLine.trim();
    if (!line) {
      lineCount += 1;
      continue;
    }
    const widthFactor = /[\u2e80-\u9fff\uf900-\ufaff]/u.test(line)
      ? 1
      : /[\u0900-\u097f]/u.test(line) ? 0.82 : 0.56;
    const unitsPerLine = Math.max(1, Math.floor(availableWidth / Math.max(0.5, fontSize * widthFactor)));
    const words = line.split(/\s+/u);
    let usedUnits = 0;
    let wrappedLines = 1;
    for (const word of words) {
      const units = graphemeCount(word);
      const nextUnits = usedUnits === 0 ? units : usedUnits + 1 + units;
      if (nextUnits <= unitsPerLine) {
        usedUnits = nextUnits;
      } else if (units <= unitsPerLine) {
        wrappedLines += 1;
        usedUnits = units;
      } else {
        wrappedLines += Math.max(1, Math.ceil(units / unitsPerLine)) - (usedUnits === 0 ? 1 : 0);
        usedUnits = units % unitsPerLine;
      }
    }
    lineCount += wrappedLines;
  }
  return Math.max(1, lineCount);
}

/** Largest whole-node font size that fits a shape's already-safe text rectangle. */
export function maximumFittedTextFontSize(
  value: string,
  available: Size,
  options: MaximumTextFitOptions = {}
): number {
  const preferred = finitePositive(options.preferredFontSize, 14);
  const minimum = Math.max(1, Math.min(preferred, finitePositive(options.minimumFontSize, 8)));
  const maximum = Math.max(minimum, finitePositive(options.maximumFontSize, 96));
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (!normalized) return preferred;
  const width = Math.max(1, finitePositive(available.width, 1));
  const height = Math.max(1, finitePositive(available.height, 1));
  const singleWord = !/\s/u.test(normalized);
  const lineHeight = /[\u0900-\u097f]/u.test(normalized) ? 1.42 : 1.38;
  const fits = (fontSize: number) => {
    if (singleWord && estimatedTextWidth(normalized, fontSize) > width) return false;
    const lines = singleWord ? 1 : estimatedWrappedLineCount(value, width, fontSize);
    return lines * fontSize * lineHeight <= height;
  };

  if (!fits(minimum)) return minimum;
  let lower = minimum;
  let upper = maximum;
  for (let iteration = 0; iteration < 14; iteration += 1) {
    const candidate = (lower + upper) / 2;
    if (fits(candidate)) lower = candidate;
    else upper = candidate;
  }
  return Math.max(minimum, Math.floor(lower * 4) / 4);
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
  return Math.max(8, width / scale - shapeContentPadding(shapeType, nodeType).width);
}

/** Approximate the safe text rectangle inside a rendered node shape. */
export function shapeTextContentSize(
  shapeType: string | undefined,
  renderedSize: Size,
  nodeType = "shape",
  options: ShapeTextContentOptions = {}
): Size {
  const width = finitePositive(renderedSize.width, MIN_AUTOFIT_WIDTH);
  const height = finitePositive(renderedSize.height, MIN_AUTOFIT_HEIGHT);
  const padding = shapeContentPadding(shapeType, nodeType);
  // Prefer the unwrapped width. Using an already-constrained rendered width
  // feeds a narrow diamond editor back into this aspect calculation and can
  // collapse the text area to a one-character column.
  const contentWidth = finitePositive(
    options.contentSize?.naturalWidth,
    finitePositive(options.contentSize?.width, 180)
  );
  // Diamonds need both unwrapped axes. Pairing naturalWidth with the height
  // produced by an already-narrow editor creates a feedback loop: wrapping
  // increases the measured height, which makes the next diamond box narrower.
  const contentHeight = finitePositive(
    shapeType === "diamond" ? options.contentSize?.naturalHeight : undefined,
    finitePositive(options.contentSize?.height, 80)
  );
  const paddedAspect = Math.max(
    0.35,
    Math.min(4, (contentWidth + padding.width) / (contentHeight + padding.height))
  );

  if (shapeType === "circle") {
    const safeHeight = Math.min(width, height) / Math.sqrt(paddedAspect ** 2 + 1);
    return {
      width: Math.max(8, safeHeight * paddedAspect - padding.width),
      height: Math.max(8, safeHeight - padding.height),
    };
  }
  if (shapeType === "ellipse") {
    const radiusX = width / 2;
    const radiusY = height / 2;
    const halfHeight = 1 / Math.sqrt(
      (paddedAspect / radiusX) ** 2 + (1 / radiusY) ** 2
    );
    return {
      width: Math.max(8, halfHeight * 2 * paddedAspect - padding.width),
      height: Math.max(8, halfHeight * 2 - padding.height),
    };
  }
  if (shapeType === "diamond") {
    const radiusX = width / 2;
    const radiusY = height / 2;
    const halfHeight = 1 / (paddedAspect / radiusX + 1 / radiusY);
    return {
      width: Math.max(8, halfHeight * 2 * paddedAspect - padding.width),
      height: Math.max(8, halfHeight * 2 - padding.height),
    };
  }

  const scale = (() => {
    switch (shapeType) {
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

function shapeSafeSize(shapeType: string, box: Size, cornerRadius = 0): Size {
  switch (shapeType) {
    case "circle": {
      const diameter = Math.hypot(box.width, box.height);
      return { width: diameter, height: diameter };
    }
    case "ellipse": {
      const contentRatio = box.width / Math.max(1, box.height);
      const ratios = [0.8, 1, 1.25, 1.4, 1.6, 1.8, 2, contentRatio]
        .map((ratio) => Math.max(0.7, Math.min(2.4, ratio)));
      return ratios
        .map((ratio) => {
          const radiusY = Math.sqrt(
            Math.pow(box.width / 2 / ratio, 2) + Math.pow(box.height / 2, 2)
          );
          return { width: radiusY * 2 * ratio, height: radiusY * 2 };
        })
        .reduce((best, candidate) => (
          candidate.width * candidate.height < best.width * best.height ? candidate : best
        ));
    }
    case "diamond": {
      // For a square diamond, an axis-aligned box fits when its width and
      // height add up to the diamond's side length. Doubling both dimensions
      // and then forcing a square leaves a large amount of usable area empty.
      const side = box.width + box.height;
      return { width: side, height: side };
    }
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
    case "rounded": {
      const inset = Math.min(12, Math.max(0, cornerRadius) * 0.22);
      return { width: box.width + inset * 2, height: box.height + inset * 2 };
    }
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
  const padding = shapeContentPadding(shapeType, options.nodeType);
  const borderAllowance = Math.max(0, finitePositive(options.borderWidth, 0)) * 2;
  const maxContentWidth = finitePositive(options.maxContentWidth, MAX_AUTOFIT_WIDTH - padding.width);
  const contentWidth = Math.min(maxContentWidth, finitePositive(contentSize.width, MIN_AUTOFIT_WIDTH - padding.width));
  const contentHeight = finitePositive(contentSize.height, MIN_AUTOFIT_HEIGHT - padding.height);
  const padded = {
    width: contentWidth + padding.width + borderAllowance + MEASUREMENT_SAFETY_X,
    height: contentHeight + padding.height + borderAllowance + MEASUREMENT_SAFETY_Y,
  };
  const fitted = shapeSafeSize(shapeType ?? "rectangle", padded, options.cornerRadius);
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
