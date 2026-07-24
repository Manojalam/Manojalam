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

/**
 * Speech outline in the component's normalized 100 × 100 SVG space.
 *
 * Horizontal bubbles are commonly much wider than they are tall. Keep the
 * bottom tail deliberately narrow in x-space so `preserveAspectRatio="none"`
 * does not stretch it into a broad centered notch.
 */
export function speechBubblePath(direction: TextCalloutDirection): string {
  if (direction === "top") {
    return "M38 20 L50 2 L62 20 H88 Q96 20 96 28 V88 Q96 96 88 96 H12 Q4 96 4 88 V28 Q4 20 12 20 Z";
  }
  if (direction === "right") {
    return "M12 4 H72 Q80 4 80 12 V38 L98 50 L80 62 V88 Q80 96 72 96 H12 Q4 96 4 88 V12 Q4 4 12 4 Z";
  }
  if (direction === "left") {
    return "M28 4 H88 Q96 4 96 12 V88 Q96 96 88 96 H28 Q20 96 20 88 V62 L2 50 L20 38 V12 Q20 4 28 4 Z";
  }
  return "M12 4 H88 Q96 4 96 12 V72 Q96 80 88 80 H55 L51.5 96 Q50 99 48.5 96 L45 80 H12 Q4 80 4 72 V12 Q4 4 12 4 Z";
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
