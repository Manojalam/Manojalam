import type { CSSProperties } from "react";
import type { BorderLayer } from "./types";
import { effectiveCornerRadius, legacyRadiusToPercent } from "./canvas/shape-fitting";
import type { Size } from "./canvas/node-geometry";

/** CSS applied to the text-content container of a node.
 *  Always emits explicit values for inheritable properties so CSS
 *  inheritance works correctly inside TipTap's ProseMirror. */
export function getTextStyle(d: Record<string, unknown>): CSSProperties {
  return {
    // NOTE: text alignment is intentionally NOT applied here. Alignment is
    // handled purely at the paragraph level inside the editor so the right
    // panel (all paragraphs) and floating menu (selected paragraph) don't
    // fight over a container-level text-align.
    fontSize:   d.fontSize  ? `${d.fontSize}px`    : undefined,
    fontFamily: d.fontFamily ? String(d.fontFamily) : undefined,
    // Always emit italic/bold so browsers don't need to guess defaults
    fontStyle:  d.fontStyle  === "italic" ? "italic" : "normal",
    fontWeight: d.fontWeight === "bold"   ? "700"    : undefined,
    color:      (d.textColor as string)   ?? undefined,
  };
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
  const opacity = resolveFillOpacity(d);
  if (d.fillColor) return colorWithOpacity(d.fillColor as string, opacity);
  if (d.color)     return colorWithOpacity(d.color as string, opacity);
  return undefined;
}

/** Resolve a node's border color: uses explicit borderColor or accent color */
export function resolveBorderColor(d: Record<string, unknown>): string | undefined {
  return (d.borderColor as string) ?? (d.color as string) ?? undefined;
}

/** Resolve effective border width (default 2) */
export function resolveBorderWidth(d: Record<string, unknown>): number {
  return typeof d.borderWidth === "number" ? d.borderWidth : 2;
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
