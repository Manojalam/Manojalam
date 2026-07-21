import type { CSSProperties } from "react";
import type { BorderLayer, LayoutVisualStyle } from "./types";
import {
  effectiveCornerRadius,
  fitSingleUnbrokenWord,
  legacyRadiusToPercent,
  maximumFittedTextFontSize,
} from "./canvas/shape-fitting";
import { fittedContentScale } from "./canvas/node-sizing";
import type { Size } from "./canvas/node-geometry";
import { BOARD_THEME_COLORS } from "./canvas/board-colors";
import { resolveLayoutFontSize } from "./layout/layout-presentation";

/** CSS applied to the text-content container of a node.
 *  Always emits explicit values for inheritable properties so CSS
 *  inheritance works correctly inside TipTap's ProseMirror. */
export function getTextStyle(
  d: Record<string, unknown>,
  renderedBackgroundColor?: string
): CSSProperties {
  const layoutStyle = resolveLayoutVisualStyle(d);
  const fontSize = resolveLayoutFontSize(d);
  const explicitTextColor = layoutStyle && d.layoutAutoText !== false
    ? layoutStyle.textColor
    : typeof d.textColor === "string" && d.textColor
      ? d.textColor
      : undefined;
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
    color: explicitTextColor ?? automaticNodeTextColor(
      renderedBackgroundColor ?? resolveFillColor(d)
    ),
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

function measuredFillScale(
  measurement: Partial<{
    width: number;
    height: number;
    lineCount: number;
    naturalWidth: number;
    naturalHeight: number;
  }> | undefined,
  available: Size
): { scale: number; compact: boolean } | null {
  if (!measurement) return null;
  const compact = (measurement.lineCount ?? 1) <= 2;
  // Compact labels can use their unwrapped authored dimensions. Dense labels
  // must use the real wrapped dimensions: estimating them from plain text can
  // enlarge rich text past the measured height and clip the final line.
  const width = compact
    ? measurement.naturalWidth ?? measurement.width
    : measurement.width;
  const height = compact
    ? measurement.naturalHeight ?? measurement.height
    : measurement.height;
  if (
    typeof width !== "number" || !Number.isFinite(width) || width <= 0
    || typeof height !== "number" || !Number.isFinite(height) || height <= 0
  ) return null;
  return {
    scale: Math.min(available.width / width, available.height / height),
    compact,
  };
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
    /** The actual surface behind the node text, including palette fallbacks. */
    backgroundColor?: string;
  } = {}
): {
  style: CSSProperties;
  singleWord: boolean;
  constrained: boolean;
  fontSize: number;
  authoredFontSize: number;
  scale: number;
} {
  const style = getTextStyle(d, options.backgroundColor);
  const inheritedFontSize = typeof style.fontSize === "number"
    ? style.fontSize
    : typeof style.fontSize === "string" ? Number.parseFloat(style.fontSize) : fallbackFontSize;
  const preferredFontSize = Number.isFinite(inheritedFontSize) ? inheritedFontSize : fallbackFontSize;
  const plainText = plainTextForFitting(d);
  const singleWord = !!plainText && !/\s/u.test(plainText);
  const availableHeight = options.availableHeight ?? Number.POSITIVE_INFINITY;
  const minimumFontSize = Math.max(4, Math.min(preferredFontSize, options.minimumFontSize ?? 8));
  const shouldConstrain = options.constrain ?? options.fitMultiline ?? false;
  const shouldMaximize = d.maximizeText === true && Number.isFinite(availableHeight) && !!plainText;
  let scale = 1;
  const storedCandidate = (d.intrinsicContentSize ?? d.matrixIntrinsicSize) as
    | Partial<{
        width: number;
        height: number;
        lineCount: number;
        lineHeight: number;
        naturalWidth: number;
        naturalHeight: number;
        presentationKey: string;
        measurementWidth: number;
      }>
    | undefined;
  // A DOM measurement is safe only for the exact text, authored typography,
  // and guide width that produced it. Old boards and in-flight formatting
  // changes intentionally fall back to conservative fitting until remeasured.
  const storedMeasurement = storedCandidate?.presentationKey === textMeasurementKey(d)
    && typeof storedCandidate.measurementWidth === "number"
    && Math.abs(storedCandidate.measurementWidth - availableWidth) <= 1
    ? storedCandidate
    : undefined;

  if (shouldMaximize) {
    const normalScale = getFittedTextPresentation(
      { ...d, maximizeText: false },
      availableWidth,
      fallbackFontSize,
      options
    ).scale;
    const maximumFontSize = maximumFittedTextFontSize(
      plainText,
      { width: availableWidth, height: availableHeight },
      { preferredFontSize, minimumFontSize, maximumFontSize: 96 }
    );
    const measuredScale = measuredFillScale(storedMeasurement, {
      width: availableWidth,
      height: availableHeight,
    });
    // Fill-space is monotonic across every shared consumer: it can enlarge the
    // normal rendered fit, but enabling it must never make that text smaller.
    // Compact rich text uses its real authored dimensions so inline font marks
    // cannot make one same-sized node look arbitrarily smaller than another.
    const estimatedScale = maximumFontSize / preferredFontSize;
    const safeFillScale = measuredScale == null
      ? estimatedScale
      : measuredScale.compact
        ? measuredScale.scale
        : Math.min(estimatedScale, measuredScale.scale);
    scale = Math.max(normalScale, safeFillScale);
    scale = Math.max(minimumFontSize / preferredFontSize, Math.min(96 / preferredFontSize, scale));
  } else if (shouldConstrain && storedMeasurement) {
    scale = fittedContentScale(
      storedMeasurement,
      { width: availableWidth, height: availableHeight },
      Math.min(1, Math.max(0.2, minimumFontSize / preferredFontSize))
    );
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
    constrained: Math.abs(fittedFontSize - preferredFontSize) > 0.05,
    fontSize: fittedFontSize,
    authoredFontSize: preferredFontSize,
    scale,
  };
}

export function textMeasurementKey(d: Record<string, unknown>): string {
  const content = typeof d.richText === "string"
    ? d.richText
    : typeof d.text === "string" ? d.text : "";
  let contentHash = 2166136261;
  for (let index = 0; index < content.length; index += 1) {
    contentHash ^= content.charCodeAt(index);
    contentHash = Math.imul(contentHash, 16777619);
  }
  return [
    d.fontFamily ?? "",
    resolveLayoutFontSize(d) ?? "",
    d.fontWeight ?? "",
    d.fontStyle ?? "",
    `${content.length}:${contentHash >>> 0}`,
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

function parseCssColor(color: string): { r: number; g: number; b: number; a: number } | null {
  const normalized = color.trim().toLowerCase();
  if (normalized === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  const hex = parseColor(normalized);
  if (hex) return hex;

  const rgb = normalized.match(
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(\d*\.?\d+))?\s*\)$/
  );
  if (!rgb) return null;
  const channels = rgb.slice(1, 4).map(Number);
  if (channels.some((channel) => channel < 0 || channel > 255)) return null;
  const alpha = rgb[4] === undefined ? 1 : Number(rgb[4]);
  if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) return null;
  return { r: channels[0], g: channels[1], b: channels[2], a: alpha };
}

function compositeColor(
  foreground: { r: number; g: number; b: number; a: number },
  background: { r: number; g: number; b: number; a: number }
): { r: number; g: number; b: number; a: number } {
  const alpha = foreground.a + background.a * (1 - foreground.a);
  if (alpha <= 0) return { r: 0, g: 0, b: 0, a: 0 };
  return {
    r: (foreground.r * foreground.a + background.r * background.a * (1 - foreground.a)) / alpha,
    g: (foreground.g * foreground.a + background.g * background.a * (1 - foreground.a)) / alpha,
    b: (foreground.b * foreground.a + background.b * background.a * (1 - foreground.a)) / alpha,
    a: alpha,
  };
}

function relativeLuminance(color: { r: number; g: number; b: number }): number {
  const [red, green, blue] = [color.r, color.g, color.b].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function contrastRatio(first: number, second: number): number {
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

const AUTOMATIC_DARK_TEXT = "#111827";
const AUTOMATIC_LIGHT_TEXT = "#f8fafc";
const DARK_MODE_OPAQUE_FILL_STRENGTH = 0.82;

function readableTextColor(background: { r: number; g: number; b: number }): string {
  const backgroundLuminance = relativeLuminance(background);
  const darkLuminance = relativeLuminance(parseColor(AUTOMATIC_DARK_TEXT)!);
  const lightLuminance = relativeLuminance(parseColor(AUTOMATIC_LIGHT_TEXT)!);
  return contrastRatio(backgroundLuminance, darkLuminance)
    >= contrastRatio(backgroundLuminance, lightLuminance)
    ? AUTOMATIC_DARK_TEXT
    : AUTOMATIC_LIGHT_TEXT;
}

/**
 * Pick automatic node text from the actual rendered fill. If a translucent
 * fill needs opposite text in light and dark mode, keep following the theme.
 */
export function automaticNodeTextColor(renderedBackgroundColor?: string): string {
  if (!renderedBackgroundColor) return "var(--foreground)";
  const fill = parseCssColor(renderedBackgroundColor);
  if (!fill || fill.a <= 0) return "var(--foreground)";

  const lightCanvas = parseCssColor(BOARD_THEME_COLORS.light.canvas)!;
  const darkCanvas = parseCssColor(BOARD_THEME_COLORS.dark.canvas)!;
  const lightModeText = readableTextColor(compositeColor(fill, lightCanvas));
  const darkModeFill = fill.a >= 0.999
    ? {
        r: fill.r * DARK_MODE_OPAQUE_FILL_STRENGTH + darkCanvas.r * (1 - DARK_MODE_OPAQUE_FILL_STRENGTH),
        g: fill.g * DARK_MODE_OPAQUE_FILL_STRENGTH + darkCanvas.g * (1 - DARK_MODE_OPAQUE_FILL_STRENGTH),
        b: fill.b * DARK_MODE_OPAQUE_FILL_STRENGTH + darkCanvas.b * (1 - DARK_MODE_OPAQUE_FILL_STRENGTH),
        a: 1,
      }
    : compositeColor(fill, darkCanvas);
  const darkModeText = readableTextColor(darkModeFill);
  return lightModeText === darkModeText ? lightModeText : "var(--foreground)";
}

/**
 * Tone fully opaque node surfaces toward the visible canvas in dark mode.
 * Saved colors stay exact, while transparent and already-soft fills retain
 * their authored alpha instead of picking up a dark matte.
 */
export function themeAwareNodeFillColor(renderedFillColor?: string): string | undefined {
  if (!renderedFillColor) return undefined;
  const fill = parseCssColor(renderedFillColor);
  if (!fill || fill.a < 0.999) return renderedFillColor;
  return `color-mix(in oklch, ${renderedFillColor} var(--node-opaque-fill-strength, 100%), var(--board-canvas-bg, var(--canvas-bg)))`;
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
