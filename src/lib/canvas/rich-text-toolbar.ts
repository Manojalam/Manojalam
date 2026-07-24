export interface InlineTextToolbarContext {
  nodeId?: string;
  selectedNodeIds: string[];
  editorEditable: boolean;
  editorFocused: boolean;
  hasTextSelection: boolean;
}

export type RichTextAlignment = "left" | "center" | "right" | "justify";

export const TEXT_TOOL_FOCUS_SELECTOR =
  "[data-universal-text-tools], [data-app-color-picker]";

const RICH_TEXT_ALIGNMENTS: readonly RichTextAlignment[] = [
  "left",
  "center",
  "right",
  "justify",
];

/**
 * Prefer stored paragraph alignment, then what the selected block visibly
 * inherits from its node, before falling back to the node setting or left.
 */
export function resolveCapturedTextAlign(
  paragraphAlignment: unknown,
  renderedAlignment: unknown,
  nodeAlignment?: unknown
): RichTextAlignment {
  for (const candidate of [paragraphAlignment, renderedAlignment, nodeAlignment]) {
    if (typeof candidate !== "string") continue;
    const normalized = candidate.trim().toLowerCase();
    const alignment = RICH_TEXT_ALIGNMENTS.find((value) => value === normalized);
    if (alignment) return alignment;
  }
  return "left";
}

/** Treat focus inside a portaled text tool as part of the active editor session. */
export function isTextToolFocusTarget(target: unknown): boolean {
  if (
    !target
    || (typeof target !== "object" && typeof target !== "function")
    || !("closest" in target)
  ) return false;
  const closest = (target as { closest?: unknown }).closest;
  return typeof closest === "function"
    && !!closest.call(target, TEXT_TOOL_FOCUS_SELECTOR);
}

/** Only a deliberate text selection in the single focused node owns an inline toolbar. */
export function canShowInlineTextToolbar({
  nodeId,
  selectedNodeIds,
  editorEditable,
  editorFocused,
  hasTextSelection,
}: InlineTextToolbarContext): boolean {
  if (!editorEditable || !editorFocused || !hasTextSelection) return false;
  if (!nodeId) return true;
  return selectedNodeIds.length === 1 && selectedNodeIds[0] === nodeId;
}
