import type { Size } from "./node-geometry";

export const MIN_AUTOFIT_WIDTH = 160;
export const MIN_AUTOFIT_HEIGHT = 56;
export const MAX_AUTOFIT_WIDTH = 560;

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
}

function finitePositive(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function nodePadding(nodeType: string | undefined): Size {
  if (nodeType === "sticky") return { width: 36, height: 30 };
  if (nodeType === "text") return { width: 36, height: 26 };
  if (nodeType === "mindmap") return { width: 44, height: 30 };
  return { width: 52, height: 42 };
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

  if (options.growOnly && options.currentSize) {
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
