export interface RenderedBoundsSize {
  width: number;
  height: number;
}

export interface RenderedBoundsRect extends RenderedBoundsSize {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export type ShapeTextVerticalAlign = "top" | "middle" | "bottom";
export type ShapeTextHorizontalAlign = "left" | "center" | "right";

/**
 * Reduce an already-rendered rich-text scale until its glyph bounds fit the
 * label guide. This is the final safety net after estimated and DOM fitting.
 */
export function correctedGuideContentScale(
  currentScale: number,
  content: RenderedBoundsSize,
  guide: RenderedBoundsSize,
  inset = 2,
  localToScreenScale = 1
): number {
  const normalizedScale = Number.isFinite(currentScale) ? Math.max(0.05, currentScale) : 1;
  const contentWidth = Math.max(0, Number.isFinite(content.width) ? content.width : 0);
  const contentHeight = Math.max(0, Number.isFinite(content.height) ? content.height : 0);
  if (contentWidth <= 0 || contentHeight <= 0) return normalizedScale;

  // Rectangles are reported in screen pixels, while the safety inset belongs
  // to the node's local coordinate system. Scaling the inset keeps the result
  // invariant when the React Flow viewport zoom changes.
  const screenScale = Number.isFinite(localToScreenScale)
    ? Math.max(0.01, localToScreenScale)
    : 1;
  const screenInset = Math.max(0, Number.isFinite(inset) ? inset : 0) * screenScale;
  const availableWidth = Math.max(1, guide.width - screenInset * 2);
  const availableHeight = Math.max(1, guide.height - screenInset * 2);
  const correction = Math.min(
    1,
    availableWidth / contentWidth,
    availableHeight / contentHeight
  );
  if (!Number.isFinite(correction) || correction >= 0.995) return normalizedScale;
  return Math.max(0.05, normalizedScale * correction * 0.985);
}

/**
 * Move contour-flow text from its actual rendered glyph position instead of
 * estimating its line count. The returned offset is expressed in the text
 * editor's local CSS pixels; the rectangles are browser (screen) coordinates.
 */
export function correctedShapeFlowOffset(
  currentOffset: number,
  content: RenderedBoundsRect,
  guide: RenderedBoundsRect,
  verticalAlign: ShapeTextVerticalAlign,
  options: {
    inset?: number;
    localToScreenScale?: number;
  } = {}
): number {
  const normalizedOffset = Number.isFinite(currentOffset) ? Math.max(0, currentOffset) : 0;
  const localToScreenScale = Number.isFinite(options.localToScreenScale)
    ? Math.max(0.01, options.localToScreenScale ?? 1)
    : 1;
  const inset = Number.isFinite(options.inset) ? Math.max(0, options.inset ?? 0) : 0;
  if (
    !Number.isFinite(content.top)
    || !Number.isFinite(content.height)
    || !Number.isFinite(guide.top)
    || !Number.isFinite(guide.bottom)
    || !Number.isFinite(guide.height)
    || content.height <= 0
    || guide.height <= 0
  ) return normalizedOffset;

  const screenInset = Math.min(guide.height / 2, inset * localToScreenScale);
  const targetTop = verticalAlign === "top"
    ? guide.top + screenInset
    : verticalAlign === "bottom"
      ? guide.bottom - screenInset - content.height
      : guide.top + (guide.height - content.height) / 2;
  const nextOffset = normalizedOffset + (targetTop - content.top) / localToScreenScale;
  const maximumOffset = guide.height / localToScreenScale;
  return Math.max(0, Math.min(maximumOffset, Number.isFinite(nextOffset) ? nextOffset : normalizedOffset));
}

/**
 * Correct a small horizontal drift introduced by CSS shape-outside floats.
 * The offset is visual only, so it never changes line wrapping or the guide
 * polygons themselves. Rectangles are browser (screen) coordinates and the
 * returned offset is in the editor's local CSS pixels.
 */
export function correctedShapeFlowHorizontalOffset(
  currentOffset: number,
  content: RenderedBoundsRect,
  guide: RenderedBoundsRect,
  horizontalAlign: ShapeTextHorizontalAlign,
  options: {
    inset?: number;
    localToScreenScale?: number;
  } = {}
): number {
  const normalizedOffset = Number.isFinite(currentOffset) ? currentOffset : 0;
  const localToScreenScale = Number.isFinite(options.localToScreenScale)
    ? Math.max(0.01, options.localToScreenScale ?? 1)
    : 1;
  const inset = Number.isFinite(options.inset) ? Math.max(0, options.inset ?? 0) : 0;
  if (
    !Number.isFinite(content.left)
    || !Number.isFinite(content.width)
    || !Number.isFinite(guide.left)
    || !Number.isFinite(guide.right)
    || !Number.isFinite(guide.width)
    || content.width <= 0
    || guide.width <= 0
  ) return normalizedOffset;

  const screenInset = Math.min(guide.width / 2, inset * localToScreenScale);
  const targetLeft = guide.left + screenInset;
  const targetRight = guide.right - screenInset;
  const target = horizontalAlign === "left"
    ? targetLeft
    : horizontalAlign === "right"
      ? targetRight - content.width
      : targetLeft + (targetRight - targetLeft - content.width) / 2;
  const nextOffset = normalizedOffset + (target - content.left) / localToScreenScale;
  const maximumOffset = Math.max(guide.width / localToScreenScale, 8);
  return Math.max(
    -maximumOffset,
    Math.min(maximumOffset, Number.isFinite(nextOffset) ? nextOffset : normalizedOffset)
  );
}
