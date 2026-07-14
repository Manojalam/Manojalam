import type { CSSProperties } from "react";
import type { BorderLayer, LayoutVisualStyle } from "./types";
import {
  effectiveCornerRadius,
  fitSingleUnbrokenWord,
  legacyRadiusToPercent,
} from "./canvas/shape-fitting";
import { fittedContentScale } from "./canvas/node-sizing";
import type { Size } from "./canvas/node-geometry";
import { resolveLayoutFontSize } from "./layout/layout-presentation";

/** CSS applied to the text-content container of a node.
 *  Always emits explicit values for inheritable properties so CSS
 *  inheritance works correctly inside TipTap's ProseMirror. */
export function getTextStyle(d: Record<string, unknown>): CSSProperties {
  const layoutStyle = resolveLayoutVisualStyle(d);
  const fontSize = resolveLayoutFontSize(d);
  return {
    // NOTE: text alignment is intentionally NOT applied here. Alignment is
    // handled purely at the paragraph level inside the editor so the right
    // panel (all paragraphs) and floating menu (selected paragraph) don't
    // fight over a container-level text-align.
    fontSize:   fontSize ? `${fontSize}px` : undefined,
    fontFamily: d.fontFamily ? String(d.fontFamily) : undefined,
    // Always emit italic/bold so browsers don't need to guess defaults
    fontStyle:  d.fontStyle  === "italic" ? "italic" : "normal",
    fontWeight: d.fontWeight === "bold"   ? "700"    : undefined,
    color:      layoutStyle && d.layoutAutoText !== false
      ? layoutStyle.textColor
      : (d.textColor as string) ?? undefined,
  };
}

function plainTextForFitting(d: Record<string, unknown>): string {
  if (typeof d.richText === "string" && d.richText.trim()) {
    return d.richText
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .trim();
  }
  return typeof d.text === "string" ? d.text.trim() : "";
}

export function getFittedTextPresentation(
  d: Record<string, unknown>,
  availableWidth: number,
  fallbackFontSize = 14,
  options: {
    availableHeight?: number;
    /** Fixed and layout-owned boxes visually scale authored rich text as one unit. */
    constrain?: boolean;
    fitMultiline?: boolean;
    minimumFontSize?: number;
  } = {}
): {
  style: CSSProperties;
  singleWord: boolean;
  constrained: boolean;
  fontSize: number;
  authoredFontSize: number;
  scale: number;
} {
  const style = getTextStyle(d);
  const inheritedFontSize = typeof style.fontSize === "number"
    ? style.fontSize
    : typeof style.fontSize === "string" ? Number.parseFloat(style.fontSize) : fallbackFontSize;
  const preferredFontSize = Number.isFinite(inheritedFontSize) ? inheritedFontSize : fallbackFontSize;
  const plainText = plainTextForFitting(d);
  const singleWord = !!plainText && !/\s/u.test(plainText);
  const availableHeight = options.availableHeight ?? Number.POSITIVE_INFINITY;
  const minimumFontSize = Math.max(4, Math.min(preferredFontSize, options.minimumFontSize ?? 8));
  const shouldConstrain = options.constrain ?? options.fitMultiline ?? false;
  let scale = 1;
  const storedMeasurement = (d.intrinsicContentSize ?? d.matrixIntrinsicSize) as
    | Partial<{ width: number; height: number; lineCount: number; lineHeight: number; naturalWidth: number }>
    | undefined;

  if (shouldConstrain && storedMeasurement) {
    scale = fittedContentScale(
      storedMeasurement,
      { width: availableWidth, height: availableHeight },
      Math.min(1, Math.max(0.2, minimumFontSize / preferredFontSize))
    );
    if (d.autoSizeMode !== "fixed") scale = Math.min(1, scale);
  } else if (shouldConstrain && singleWord) {
    const fit = fitSingleUnbrokenWord(plainText, preferredFontSize, availableWidth);
    scale = fit.fontSize / preferredFontSize;
  } else if (shouldConstrain && Number.isFinite(availableHeight) && plainText) {
    const estimatedHeight = (fontSize: number) => {
      const lineHeight = fontSize * 1.38;
      const lines = plainText.split(/\r?\n/);
      let wrappedLines = 0;
      for (const line of lines) {
        if (!line.trim()) {
          wrappedLines += 1;
          continue;
        }
        const scriptFactor = /[\u0900-\u097f]/u.test(line) ? 0.82 : 0.56;
        const unitsPerLine = Math.max(1, Math.floor(Math.max(1, availableWidth) / (fontSize * scriptFactor)));
        const words = line.trim().split(/\s+/u);
        let usedUnits = 0;
        let lineCount = 1;
        for (const word of words) {
          const units = Array.from(word).length;
          const nextUnits = usedUnits === 0 ? units : usedUnits + 1 + units;
          if (nextUnits <= unitsPerLine) {
            usedUnits = nextUnits;
          } else if (units <= unitsPerLine) {
            lineCount += 1;
            usedUnits = units;
          } else {
            lineCount += Math.max(1, Math.ceil(units / unitsPerLine)) - (usedUnits === 0 ? 1 : 0);
            usedUnits = units % unitsPerLine;
          }
        }
        wrappedLines += lineCount;
      }
      return Math.max(1, wrappedLines) * lineHeight;
    };

    if (estimatedHeight(preferredFontSize) > availableHeight) {
      let low = minimumFontSize;
      let high = preferredFontSize;
      for (let iteration = 0; iteration < 12; iteration += 1) {
        const candidate = (low + high) / 2;
        if (estimatedHeight(candidate) <= availableHeight) low = candidate;
        else high = candidate;
      }
      scale = Math.max(minimumFontSize, Math.min(preferredFontSize, low)) / preferredFontSize;
    }
  }
  const fittedFontSize = preferredFontSize * scale;
  return {
    style,
    singleWord,
    constrained: fittedFontSize < preferredFontSize - 0.05,
    fontSize: fittedFontSize,
    authoredFontSize: preferredFontSize,
    scale,
  };
}

export function textMeasurementKey(d: Record<string, unknown>): string {
  return [
    d.fontFamily ?? "",
    resolveLayoutFontSize(d) ?? "",
    d.fontWeight ?? "",
    d.fontStyle ?? "",
  ].join("|");
}

/** Default softness applied to solid fill colors so text stays readable */
export const DEFAULT_FILL_OPACITY = 0.18;

/** Parse a hex color (#rgb / #rrggbb / #rrggbbaa) → {r,g,b,a} */
function parseColor(hex: string): { r: number; g: number; b: number; a: number } | null {
  let h = hex.trim();
  if (!h.startsWith("#")) return null;
  h = h.slice(1);
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length === 6 || h.length === 8) {
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return { r, g, b, a };
  }
  return null;
}

/** Combine a base color + opacity into an rgba() string */
export function colorWithOpacity(color: string, opacity: number): string {
  const p = parseColor(color);
  if (!p) return color; // non-hex (e.g. named/rgba) — return as-is
  return `rgba(${p.r}, ${p.g}, ${p.b}, ${opacity})`;
}

/** Effective fill opacity for a node (defaults to soft) */
export function resolveFillOpacity(d: Record<string, unknown>): number {
  return typeof d.fillOpacity === "number" ? d.fillOpacity : DEFAULT_FILL_OPACITY;
}

/**
 * Resolve a node's fill color, applying its fill opacity so any chosen
 * color keeps the same softness as the rest of the fill system.
 */
export function resolveFillColor(d: Record<string, unknown>): string | undefined {
  const layoutStyle = resolveLayoutVisualStyle(d);
  if (layoutStyle && d.layoutAutoFill !== false) return layoutStyle.fillColor;
  const opacity = resolveFillOpacity(d);
  if (d.fillColor) return colorWithOpacity(d.fillColor as string, opacity);
  if (d.color)     return colorWithOpacity(d.color as string, opacity);
  return undefined;
}

/** Resolve a node's border color: uses explicit borderColor or accent color */
export function resolveBorderColor(d: Record<string, unknown>): string | undefined {
  const layoutStyle = resolveLayoutVisualStyle(d);
  if (layoutStyle && d.layoutAutoBorder !== false) return layoutStyle.borderColor;
  return (d.borderColor as string) ?? (d.color as string) ?? undefined;
}

/** Resolve effective border width (default 2) */
export function resolveBorderWidth(d: Record<string, unknown>): number {
  const layoutStyle = resolveLayoutVisualStyle(d);
  if (layoutStyle && d.layoutAutoBorder !== false) return layoutStyle.borderWidth;
  return typeof d.borderWidth === "number" ? d.borderWidth : 2;
}

export function resolveBorderStyle(d: Record<string, unknown>): "solid" | "dashed" | "dotted" {
  const layoutStyle = resolveLayoutVisualStyle(d);
  if (layoutStyle && d.layoutAutoBorder !== false) return layoutStyle.borderStyle;
  return d.borderStyle === "dashed" || d.borderStyle === "dotted" ? d.borderStyle : "solid";
}

export function resolveLayoutVisualStyle(d: Record<string, unknown>): LayoutVisualStyle | undefined {
  const style = d.layoutVisualStyle as Partial<LayoutVisualStyle> | undefined;
  if (
    !style
    || typeof style.rootId !== "string"
    || typeof style.fillColor !== "string"
    || typeof style.borderColor !== "string"
    || typeof style.textColor !== "string"
  ) return undefined;
  return style as LayoutVisualStyle;
}

export function resolveAccentColor(d: Record<string, unknown>): string | undefined {
  const layoutStyle = resolveLayoutVisualStyle(d);
  if (layoutStyle && d.layoutAutoBorder !== false) return layoutStyle.accentColor;
  return (d.borderColor as string) ?? (d.color as string) ?? undefined;
}

export function resolveCornerRadiusPercent(
  d: Record<string, unknown>,
  size: Size,
  fallbackPercent = 40
): number {
  if (typeof d.cornerRadiusPercent === "number" && Number.isFinite(d.cornerRadiusPercent)) {
    return Math.max(0, Math.min(100, d.cornerRadiusPercent));
  }
  if (typeof d.borderRadius === "number") {
    return legacyRadiusToPercent(d.borderRadius, size, fallbackPercent);
  }
  return fallbackPercent;
}

/** Resolve the normalized radius against the node's current rendered dimensions. */
export function resolveNodeBorderRadius(
  d: Record<string, unknown>,
  size: Size,
  fallbackPercent = 40
): number {
  return effectiveCornerRadius(resolveCornerRadiusPercent(d, size, fallbackPercent), size, fallbackPercent);
}

/**
 * Compute the concentric layout for extra border layers.
 * Each returned entry is an absolutely-positioned div spec that surrounds
 * the whole shape (following its corner radius) and supports solid/dashed/dotted.
 */
export function computeBorderLayerBoxes(
  primaryWidth: number,
  baseRadius: number,
  layers: BorderLayer[]
): Array<{ id: string; inset: number; width: number; color: string; style: string; radius: number }> {
  let outer = primaryWidth; // start just outside the primary border
  const out: Array<{ id: string; inset: number; width: number; color: string; style: string; radius: number }> = [];
  for (const l of layers) {
    if (l.width <= 0) continue;
    outer += l.offset ?? 0;   // optional gap
    outer += l.width;         // this layer's outer edge distance from element
    out.push({
      id: l.id,
      inset: -outer,          // expand outward by `outer` px on all sides
      width: l.width,
      color: l.color,
      style: l.style ?? "solid",
      radius: baseRadius > 0 ? baseRadius + outer : 0,
    });
  }
  return out;
}
