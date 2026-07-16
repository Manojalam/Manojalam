/**
 * Scale fitted rich text without changing the width of its alignment box.
 *
 * CSS zoom already scales absolute lengths such as glyphs and line height, but
 * intentionally leaves percentage widths unchanged. Inversely expanding the
 * wrapper width would therefore move centered/right-aligned text as the scale
 * changes instead of merely making the content smaller.
 */
export function getRichTextScaleStyle(contentScale: number): { zoom: number } | undefined {
  const scale = Number.isFinite(contentScale)
    ? Math.max(0.2, Math.min(12, contentScale))
    : 1;
  return Math.abs(scale - 1) > 0.001 ? { zoom: scale } : undefined;
}
