export interface InlineTextToolbarContext {
  nodeId?: string;
  selectedNodeIds: string[];
  editorEditable: boolean;
  editorFocused: boolean;
  hasTextSelection: boolean;
}

export type RichTextAlignment = "left" | "center" | "right" | "justify";

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
