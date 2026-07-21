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
  /** Text and authored typography that produced this DOM measurement. */
  presentationKey?: string;
  /** Unscaled guide width used when the rich text was measured. */
  measurementWidth?: number;
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
  /** Stable authored-text aspect used before an exact DOM measurement exists. */
  preferredAspect?: number;
}

export interface ShapeLabelBox extends Size {
  x: number;
  y: number;
}

/**
 * Stable axis-aligned text box for a diamond. The diamond outline satisfies
 * width/outerWidth + height/outerHeight <= 1 for an inscribed rectangle, so
 * using half of the inset interior on each axis keeps every glyph away from
 * both pointed tips while giving alignment and fitting one dependable box.
 */
export function diamondTextLabelBox(renderedSize: Size, inset = 8): ShapeLabelBox {
  const renderedWidth = finitePositive(renderedSize.width, MIN_AUTOFIT_WIDTH);
  const renderedHeight = finitePositive(renderedSize.height, MIN_AUTOFIT_HEIGHT);
  const safeInset = Math.max(0, Math.min(inset, renderedWidth / 4, renderedHeight / 4));
  const width = Math.max(8, (renderedWidth - safeInset * 2) / 2);
  const height = Math.max(8, (renderedHeight - safeInset * 2) / 2);
  return {
    x: (renderedWidth - width) / 2,
    y: (renderedHeight - height) / 2,
    width,
    height,
  };
}

export interface ShapeTextFlowLayout {
  /** Nearly the full node bounds; the outline profile supplies the real inset. */
  box: ShapeLabelBox;
  /** Equivalent rectangular area used by the font-size fitter. */
  capacity: Size;
  /** Concave regions floated away from the left and right sides of the text. */
  leftExclusion: string;
  rightExclusion: string;
  areaRatio: number;
}

export interface ShapeTextFlowOptions {
  cornerRadius?: number;
  petalCount?: number;
}

type NormalizedPoint = readonly [x: number, y: number];

const SHAPE_FLOW_INSET = 4;
const SHAPE_FLOW_SAMPLES = 24;

const SHAPE_FLOW_POLYGONS: Partial<Record<string, readonly NormalizedPoint[]>> = {
  diamond: [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]],
  triangle: [[0.5, 0], [0, 1], [1, 1]],
  hexagon: [[0.25, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0.25, 1], [0, 0.5]],
  star: [[0.5, 0], [0.61, 0.35], [0.98, 0.35], [0.68, 0.57], [0.79, 0.91], [0.5, 0.7], [0.21, 0.91], [0.32, 0.57], [0.02, 0.35], [0.39, 0.35]],
  arrow: [[0.6, 0.25], [0.6, 0], [1, 0.5], [0.6, 1], [0.6, 0.75], [0, 0.75], [0, 0.25]],
  parallelogram: [[0.16, 0], [1, 0], [0.84, 1], [0, 1]],
  trapezoid: [[0.18, 0], [0.82, 0], [1, 1], [0, 1]],
  offPageConnector: [[0, 0], [1, 0], [1, 0.76], [0.5, 1], [0, 0.76]],
  callout: [[0, 0], [1, 0], [1, 0.78], [0.64, 0.78], [0.5, 1], [0.38, 0.78], [0, 0.78]],
  document: [[0.06, 0.05], [0.94, 0.05], [0.94, 0.76], [0.76, 0.74], [0.6, 0.9], [0.46, 0.83], [0.28, 0.72], [0.14, 0.86], [0.06, 0.8]],
  cloud: [[0.3, 0.8], [0.17, 0.76], [0.05, 0.64], [0.06, 0.48], [0.17, 0.39], [0.2, 0.27], [0.35, 0.22], [0.43, 0.25], [0.58, 0.17], [0.75, 0.25], [0.78, 0.36], [0.92, 0.4], [0.96, 0.58], [0.9, 0.74], [0.78, 0.8]],
};

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

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function polygonHorizontalRange(points: readonly NormalizedPoint[], y: number): readonly [number, number] {
  const scanY = Math.max(0.000001, Math.min(0.999999, y));
  const intersections: number[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const [x1, y1] = points[index];
    const [x2, y2] = points[(index + 1) % points.length];
    if (y1 === y2 || scanY < Math.min(y1, y2) || scanY >= Math.max(y1, y2)) continue;
    const progress = (scanY - y1) / (y2 - y1);
    intersections.push(x1 + (x2 - x1) * progress);
  }
  if (intersections.length < 2) return [0.5, 0.5];
  intersections.sort((a, b) => a - b);
  return [clampUnit(intersections[0]), clampUnit(intersections[intersections.length - 1])];
}

function ellipseHorizontalRange(y: number, left = 0, right = 1, top = 0, bottom = 1): readonly [number, number] {
  if (y < top || y > bottom) return [0.5, 0.5];
  const centerX = (left + right) / 2;
  const centerY = (top + bottom) / 2;
  const radiusX = (right - left) / 2;
  const radiusY = Math.max(0.000001, (bottom - top) / 2);
  const normalizedY = (y - centerY) / radiusY;
  const halfWidth = radiusX * Math.sqrt(Math.max(0, 1 - normalizedY * normalizedY));
  return [clampUnit(centerX - halfWidth), clampUnit(centerX + halfWidth)];
}

function roundedHorizontalRange(y: number, size: Size, cornerRadius: number): readonly [number, number] {
  const width = finitePositive(size.width, MIN_AUTOFIT_WIDTH);
  const height = finitePositive(size.height, MIN_AUTOFIT_HEIGHT);
  const radius = Math.max(0, Math.min(cornerRadius, width / 2, height / 2));
  if (radius <= 0) return [0, 1];
  const radiusX = radius / width;
  const radiusY = radius / height;
  if (y >= radiusY && y <= 1 - radiusY) return [0, 1];
  const centerY = y < radiusY ? radiusY : 1 - radiusY;
  const normalizedY = (y - centerY) / Math.max(0.000001, radiusY);
  const inset = radiusX * (1 - Math.sqrt(Math.max(0, 1 - normalizedY * normalizedY)));
  return [clampUnit(inset), clampUnit(1 - inset)];
}

function shapeHorizontalRange(
  shapeType: string | undefined,
  y: number,
  renderedSize: Size,
  options: ShapeTextFlowOptions
): readonly [number, number] {
  const polygon = SHAPE_FLOW_POLYGONS[shapeType ?? ""];
  if (polygon) {
    const range = polygonHorizontalRange(polygon, y);
    // A pair of half-width floats requires a center-spanning interval. Slices
    // such as the arrow tip are deliberately left unavailable to centered text.
    return range[0] <= 0.5 && range[1] >= 0.5 ? range : [0.5, 0.5];
  }
  switch (shapeType) {
    case "circle":
    case "ellipse":
      return ellipseHorizontalRange(y);
    case "capsule":
      return roundedHorizontalRange(y, renderedSize, Math.min(renderedSize.width, renderedSize.height) / 2);
    case "rounded":
      return roundedHorizontalRange(y, renderedSize, options.cornerRadius ?? 0);
    case "flower": {
      const petals = Math.max(4, Math.min(16, Math.round(options.petalCount ?? 8)));
      const profilePower = petals % 2 === 0 ? 0.82 : 0.9;
      const [left, right] = ellipseHorizontalRange(y, 0.02, 0.98, 0.01, 0.99);
      const halfWidth = (right - left) / 2 * profilePower;
      return [0.5 - halfWidth, 0.5 + halfWidth];
    }
    case "leaf": {
      const halfWidth = 0.48 * Math.pow(Math.max(0, Math.sin(Math.PI * clampUnit(y))), 0.72);
      return [0.5 - halfWidth, 0.5 + halfWidth];
    }
    case "database": {
      if (y < 0.22) return ellipseHorizontalRange(y, 0.1, 0.9, 0.08, 0.36);
      if (y > 0.78) return ellipseHorizontalRange(y, 0.1, 0.9, 0.64, 0.92);
      return [0.1, 0.9];
    }
    case "predefinedProcess":
      return [0.04, 0.96];
    case "delay": {
      const normalizedY = (y - 0.5) / 0.5;
      const right = 0.55 + 0.41 * Math.sqrt(Math.max(0, 1 - normalizedY * normalizedY));
      return y < 0.05 || y > 0.95 ? [0.5, 0.5] : [0.08, right];
    }
    default:
      return [0, 1];
  }
}

function percentage(value: number): string {
  return `${Math.round(clampUnit(value) * 10000) / 100}%`;
}

function exclusionPolygon(
  side: "left" | "right",
  ranges: ReadonlyArray<readonly [number, number]>
): string {
  const boundary = ranges.map((range, index) => {
    const y = index / Math.max(1, ranges.length - 1);
    const x = side === "left"
      ? Math.min(1, range[0] * 2)
      : Math.max(0, (range[1] - 0.5) * 2);
    return `${percentage(x)} ${percentage(y)}`;
  });
  const start = side === "left" ? "0% 0%" : "100% 0%";
  const end = side === "left" ? "0% 100%" : "100% 100%";
  return `polygon(${start}, ${boundary.join(", ")}, ${end})`;
}

/**
 * Shape-aware text flow for the full inner silhouette. CSS floats remove only
 * the space outside each horizontal slice, so wrapped lines can expand through
 * the wider portions of diamonds, capsules, polygons, and custom shapes.
 */
export function shapeTextFlowLayout(
  shapeType: string | undefined,
  renderedSize: Size,
  options: ShapeTextFlowOptions = {}
): ShapeTextFlowLayout {
  const renderedWidth = finitePositive(renderedSize.width, MIN_AUTOFIT_WIDTH);
  const renderedHeight = finitePositive(renderedSize.height, MIN_AUTOFIT_HEIGHT);
  const width = Math.max(8, renderedWidth - SHAPE_FLOW_INSET * 2);
  const height = Math.max(8, renderedHeight - SHAPE_FLOW_INSET * 2);
  const insetSize = { width, height };
  const ranges = Array.from({ length: SHAPE_FLOW_SAMPLES + 1 }, (_, index) => (
    shapeHorizontalRange(shapeType, index / SHAPE_FLOW_SAMPLES, insetSize, {
      ...options,
      cornerRadius: Math.max(0, (options.cornerRadius ?? 0) - SHAPE_FLOW_INSET),
    })
  ));
  const areaRatio = Math.max(
    0.08,
    ranges.reduce((sum, [left, right]) => sum + Math.max(0, right - left), 0) / ranges.length
  );
  return {
    box: { x: SHAPE_FLOW_INSET, y: SHAPE_FLOW_INSET, width, height },
    capacity: { width: Math.max(8, width * areaRatio), height },
    leftExclusion: exclusionPolygon("left", ranges),
    rightExclusion: exclusionPolygon("right", ranges),
    areaRatio,
  };
}

export function shouldUseShapeTextFlow(
  shapeType: string | undefined,
  renderedSize: Size,
  contentSize?: Partial<ContentMeasurement>,
  text?: string,
  options: ShapeTextFlowOptions = {}
): boolean {
  const normalizedText = text?.replace(/\s+/gu, " ").trim() ?? "";
  if (!shapeType || shapeType === "rectangle" || !normalizedText) return false;
  const hasWordBoundary = /\S\s+\S/u.test(normalizedText);
  // Decide from authored text whenever possible. Waiting for the first
  // ResizeObserver measurement made this switch from a rectangular editor to
  // contour flow after paint, which was visible as a label blink. A phrase
  // already has a stable shape-flow requirement before measurement arrives.
  if (hasWordBoundary) return true;
  if (!contentSize) return false;
  const lineCount = finitePositive(contentSize.lineCount, 0);
  const naturalWidth = finitePositive(contentSize.naturalWidth, contentSize.width ?? 0);
  return lineCount >= 2 || naturalWidth > shapeTextFlowLayout(shapeType, renderedSize, options).capacity.width;
}

/** Editing stays rectangular so caret movement matches the visible soft wraps. */
export function shouldRenderShapeTextFlow(
  shapeType: string | undefined,
  renderedSize: Size,
  contentSize: Partial<ContentMeasurement> | undefined,
  editing: boolean,
  text?: string,
  options: ShapeTextFlowOptions = {}
): boolean {
  return !editing && shouldUseShapeTextFlow(shapeType, renderedSize, contentSize, text, options);
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
  const measuredAspect = (contentWidth + padding.width) / (contentHeight + padding.height);
  const preferredAspect = finitePositive(options.preferredAspect, measuredAspect);
  const paddedAspect = Math.max(0.35, Math.min(4, preferredAspect));

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

/**
 * Pick one deterministic label aspect from authored text. This avoids using
 * the result of a previous wrapped layout to choose the next diamond box,
 * which made its center and line breaks shift after every measurement.
 */
export function diamondLabelPreferredAspect(text: string | undefined): number {
  const normalized = text?.replace(/\s+/gu, " ").trim() ?? "";
  if (!normalized) return 2.25;
  const wordCount = normalized
    .split(/\s+/u)
    .filter((token) => /[\p{L}\p{N}]/u.test(token))
    .length;
  if (wordCount <= 1) return 4;
  if (wordCount <= 3) return 2.2;
  if (wordCount <= 6) return 1.5;
  return 1.15;
}

/** Diamonds use one centered box; CSS contour floats remain available to all
 * other supported shapes without changing their established rendering. */
export function usesDeterministicDiamondLabel(shapeType: string | undefined): boolean {
  return shapeType === "diamond";
}

/** One centered, shape-safe rectangular label box shared by every shape renderer. */
export function shapeLabelBox(
  shapeType: string | undefined,
  renderedSize: Size,
  nodeType = "shape",
  options: ShapeTextContentOptions = {}
): ShapeLabelBox {
  const renderedWidth = finitePositive(renderedSize.width, MIN_AUTOFIT_WIDTH);
  const renderedHeight = finitePositive(renderedSize.height, MIN_AUTOFIT_HEIGHT);
  const contentSize = shapeTextContentSize(shapeType, renderedSize, nodeType, options);
  const width = Math.min(renderedWidth, contentSize.width);
  const height = Math.min(renderedHeight, contentSize.height);
  return {
    x: (renderedWidth - width) / 2,
    y: (renderedHeight - height) / 2,
    width,
    height,
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
