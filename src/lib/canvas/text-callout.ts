import type { Size } from "./node-geometry";
import type { TextCalloutDirection, TextFrameStyle } from "../types";

export type { TextCalloutDirection, TextFrameStyle } from "../types";

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
  if (style === "speech") return "callout";
  if (style === "thought") return "cloud";
  return "rectangle";
}

/** Body rectangle after reserving space for the speech tail or thought dots. */
export function textFrameBodyBox(
  style: TextFrameStyle,
  direction: TextCalloutDirection
): PercentageBox {
  if (style === "plain") return { x: 0, y: 0, width: 100, height: 100 };

  const tail = style === "speech" ? 20 : 16;
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
