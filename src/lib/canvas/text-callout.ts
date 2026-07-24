import type { Point, Size } from "./node-geometry";
import type {
  TextCalloutAnchor,
  TextCalloutDirection,
  TextFrameStyle,
} from "../types";

export type {
  TextCalloutAnchor,
  TextCalloutDirection,
  TextFrameStyle,
} from "../types";

export interface PercentageBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function normalizeTextFrameStyle(value: unknown): TextFrameStyle {
  return value === "speech" || value === "thought" ? value : "plain";
}

export function normalizeTextCalloutDirection(value: unknown): TextCalloutDirection {
  return value === "top" || value === "right" || value === "left" ? value : "bottom";
}

/** Shape-fitting proxy used by text auto-size calculations. */
export function textFrameShapeType(style: TextFrameStyle): "rectangle" | "callout" | "cloud" {
  if (style === "speech") return "rectangle";
  if (style === "thought") return "cloud";
  return "rectangle";
}

export function normalizeTextCalloutAnchor(value: unknown): TextCalloutAnchor | null {
  if (!value || typeof value !== "object") return null;
  const anchor = value as Partial<TextCalloutAnchor>;
  return Number.isFinite(anchor.x) && Number.isFinite(anchor.y)
    ? { x: anchor.x as number, y: anchor.y as number }
    : null;
}

function calloutTailLength(size: Size): number {
  return Math.max(18, Math.min(42, Math.min(size.width, size.height) * 0.38));
}

/** Default tail tip relative to the callout body's top-left corner. */
export function defaultTextCalloutTip(
  size: Size,
  direction: TextCalloutDirection
): Point {
  const length = calloutTailLength(size);
  if (direction === "top") return { x: size.width / 2, y: -length };
  if (direction === "right") return { x: size.width + length, y: size.height / 2 };
  if (direction === "left") return { x: -length, y: size.height / 2 };
  return { x: size.width / 2, y: size.height + length };
}

/** Initial persisted canvas point used when a speech body first moves. */
export function defaultTextCalloutAnchor(
  topLeft: Point,
  size: Size,
  direction: TextCalloutDirection
): TextCalloutAnchor {
  const tip = defaultTextCalloutTip(size, direction);
  return { x: topLeft.x + tip.x, y: topLeft.y + tip.y };
}

/** Tail tip relative to the currently rendered callout body. */
export function relativeTextCalloutTip(
  topLeft: Point,
  size: Size,
  direction: TextCalloutDirection,
  anchor: unknown
): Point {
  const normalized = normalizeTextCalloutAnchor(anchor);
  return normalized
    ? { x: normalized.x - topLeft.x, y: normalized.y - topLeft.y }
    : defaultTextCalloutTip(size, direction);
}

/** Shift an absolute speech anchor when its node is copied or duplicated. */
export function translateTextCalloutAnchor(
  anchor: unknown,
  offset: Point
): TextCalloutAnchor | undefined {
  const normalized = normalizeTextCalloutAnchor(anchor);
  return normalized
    ? { x: normalized.x + offset.x, y: normalized.y + offset.y }
    : undefined;
}

function finiteSize(size: Size): Size {
  return {
    width: Number.isFinite(size.width) && size.width > 0 ? size.width : 100,
    height: Number.isFinite(size.height) && size.height > 0 ? size.height : 100,
  };
}

function roundCoordinate(value: number): number {
  return Math.round(value * 100) / 100;
}

function calloutPathNumber(value: number): string {
  return String(roundCoordinate(value));
}

/**
 * Rounded speech body with a tail that may extend beyond the node bounds.
 * The tail base follows the projected tip while remaining clear of corners.
 */
export function speechBubblePath(
  direction: TextCalloutDirection,
  requestedSize: Size = { width: 100, height: 100 },
  requestedTip?: Point
): string {
  const size = finiteSize(requestedSize);
  const tip = requestedTip ?? defaultTextCalloutTip(size, direction);
  const inset = Math.max(1, Math.min(3, Math.min(size.width, size.height) * 0.04));
  const left = inset;
  const top = inset;
  const right = size.width - inset;
  const bottom = size.height - inset;
  const radius = Math.max(
    4,
    Math.min(14, (right - left) / 4, (bottom - top) / 4)
  );
  const halfBase = Math.max(6, Math.min(14, Math.min(size.width, size.height) * 0.14));
  const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(max, value));
  const n = calloutPathNumber;

  if (direction === "top") {
    const center = clamp(tip.x, left + radius + halfBase, right - radius - halfBase);
    return [
      `M${n(left + radius)} ${n(top)}`,
      `H${n(center - halfBase)}`,
      `L${n(tip.x)} ${n(tip.y)}`,
      `L${n(center + halfBase)} ${n(top)}`,
      `H${n(right - radius)}`,
      `Q${n(right)} ${n(top)} ${n(right)} ${n(top + radius)}`,
      `V${n(bottom - radius)}`,
      `Q${n(right)} ${n(bottom)} ${n(right - radius)} ${n(bottom)}`,
      `H${n(left + radius)}`,
      `Q${n(left)} ${n(bottom)} ${n(left)} ${n(bottom - radius)}`,
      `V${n(top + radius)}`,
      `Q${n(left)} ${n(top)} ${n(left + radius)} ${n(top)} Z`,
    ].join(" ");
  }

  if (direction === "right") {
    const center = clamp(tip.y, top + radius + halfBase, bottom - radius - halfBase);
    return [
      `M${n(left + radius)} ${n(top)}`,
      `H${n(right - radius)}`,
      `Q${n(right)} ${n(top)} ${n(right)} ${n(top + radius)}`,
      `V${n(center - halfBase)}`,
      `L${n(tip.x)} ${n(tip.y)}`,
      `L${n(right)} ${n(center + halfBase)}`,
      `V${n(bottom - radius)}`,
      `Q${n(right)} ${n(bottom)} ${n(right - radius)} ${n(bottom)}`,
      `H${n(left + radius)}`,
      `Q${n(left)} ${n(bottom)} ${n(left)} ${n(bottom - radius)}`,
      `V${n(top + radius)}`,
      `Q${n(left)} ${n(top)} ${n(left + radius)} ${n(top)} Z`,
    ].join(" ");
  }

  if (direction === "left") {
    const center = clamp(tip.y, top + radius + halfBase, bottom - radius - halfBase);
    return [
      `M${n(left + radius)} ${n(top)}`,
      `H${n(right - radius)}`,
      `Q${n(right)} ${n(top)} ${n(right)} ${n(top + radius)}`,
      `V${n(bottom - radius)}`,
      `Q${n(right)} ${n(bottom)} ${n(right - radius)} ${n(bottom)}`,
      `H${n(left + radius)}`,
      `Q${n(left)} ${n(bottom)} ${n(left)} ${n(bottom - radius)}`,
      `V${n(center + halfBase)}`,
      `L${n(tip.x)} ${n(tip.y)}`,
      `L${n(left)} ${n(center - halfBase)}`,
      `V${n(top + radius)}`,
      `Q${n(left)} ${n(top)} ${n(left + radius)} ${n(top)} Z`,
    ].join(" ");
  }

  const center = clamp(tip.x, left + radius + halfBase, right - radius - halfBase);
  return [
    `M${n(left + radius)} ${n(top)}`,
    `H${n(right - radius)}`,
    `Q${n(right)} ${n(top)} ${n(right)} ${n(top + radius)}`,
    `V${n(bottom - radius)}`,
    `Q${n(right)} ${n(bottom)} ${n(right - radius)} ${n(bottom)}`,
    `H${n(center + halfBase)}`,
    `L${n(tip.x)} ${n(tip.y)}`,
    `L${n(center - halfBase)} ${n(bottom)}`,
    `H${n(left + radius)}`,
    `Q${n(left)} ${n(bottom)} ${n(left)} ${n(bottom - radius)}`,
    `V${n(top + radius)}`,
    `Q${n(left)} ${n(top)} ${n(left + radius)} ${n(top)} Z`,
  ].join(" ");
}

/** Body rectangle after reserving space for the speech tail or thought dots. */
export function textFrameBodyBox(
  style: TextFrameStyle,
  direction: TextCalloutDirection
): PercentageBox {
  if (style === "plain") return { x: 0, y: 0, width: 100, height: 100 };
  if (style === "speech") return { x: 4, y: 4, width: 92, height: 92 };

  const tail = 16;
  if (direction === "top") {
    return { x: 4, y: tail, width: 92, height: 96 - tail };
  }
  if (direction === "right") {
    return { x: 4, y: 4, width: 96 - tail, height: 92 };
  }
  if (direction === "left") {
    return { x: tail, y: 4, width: 96 - tail, height: 92 };
  }
  return { x: 4, y: 4, width: 92, height: 96 - tail };
}

/** Convert the percentage body box into the actual editable text area. */
export function textFrameContentSize(
  renderedSize: Size,
  style: TextFrameStyle,
  direction: TextCalloutDirection
): Size {
  const body = textFrameBodyBox(style, direction);
  return {
    width: Math.max(8, renderedSize.width * body.width / 100 - 16),
    height: Math.max(8, renderedSize.height * body.height / 100 - 16),
  };
}
