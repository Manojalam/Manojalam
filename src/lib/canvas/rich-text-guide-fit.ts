export interface RenderedBoundsSize {
  width: number;
  height: number;
}

/**
 * Reduce an already-rendered rich-text scale until its glyph bounds fit the
 * label guide. This is the final safety net after estimated and DOM fitting.
 */
export function correctedGuideContentScale(
  currentScale: number,
  content: RenderedBoundsSize,
  guide: RenderedBoundsSize,
  inset = 2
): number {
  const normalizedScale = Number.isFinite(currentScale) ? Math.max(0.05, currentScale) : 1;
  const contentWidth = Math.max(0, Number.isFinite(content.width) ? content.width : 0);
  const contentHeight = Math.max(0, Number.isFinite(content.height) ? content.height : 0);
  if (contentWidth <= 0 || contentHeight <= 0) return normalizedScale;

  const availableWidth = Math.max(1, guide.width - inset * 2);
  const availableHeight = Math.max(1, guide.height - inset * 2);
  const correction = Math.min(
    1,
    availableWidth / contentWidth,
    availableHeight / contentHeight
  );
  if (!Number.isFinite(correction) || correction >= 0.995) return normalizedScale;
  return Math.max(0.05, normalizedScale * correction * 0.985);
}
