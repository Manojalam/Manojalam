import type { Editor } from "@tiptap/core";

export interface InlineTextToolbarContext {
  nodeId?: string;
  selectedNodeIds: string[];
  editorEditable: boolean;
  editorFocused: boolean;
  hasTextSelection: boolean;
}

export type RichTextAlignment = "left" | "center" | "right" | "justify";

export interface RichTextSelectionRange {
  from: number;
  to: number;
}

export type RichTextCommandChain = ReturnType<Editor["chain"]>;

export const TEXT_TOOL_FOCUS_SELECTOR =
  "[data-universal-text-tools], [data-app-color-picker]";

const RICH_TEXT_ALIGNMENTS: readonly RichTextAlignment[] = [
  "left",
  "center",
  "right",
  "justify",
];

/**
 * ProseMirror has one native selection. Keep additive selections as normalized,
 * disjoint document ranges so toolbar commands can replay against each range.
 */
export function normalizeRichTextSelectionRanges(
  ranges: readonly RichTextSelectionRange[],
  maximumPosition = Number.MAX_SAFE_INTEGER
): RichTextSelectionRange[] {
  const maximum = Number.isFinite(maximumPosition)
    ? Math.max(0, Math.floor(maximumPosition))
    : Number.MAX_SAFE_INTEGER;
  const normalized = ranges
    .map(({ from, to }) => ({
      from: Math.max(0, Math.min(maximum, Math.floor(Math.min(from, to)))),
      to: Math.max(0, Math.min(maximum, Math.floor(Math.max(from, to)))),
    }))
    .filter(({ from, to }) => from < to)
    .sort((left, right) => left.from - right.from || left.to - right.to);

  const merged: RichTextSelectionRange[] = [];
  for (const range of normalized) {
    const previous = merged[merged.length - 1];
    if (previous && range.from <= previous.to) {
      previous.to = Math.max(previous.to, range.to);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

export function appendRichTextSelectionRange(
  ranges: readonly RichTextSelectionRange[],
  nextRange: RichTextSelectionRange,
  maximumPosition = Number.MAX_SAFE_INTEGER
): RichTextSelectionRange[] {
  return normalizeRichTextSelectionRanges(
    [...ranges, nextRange],
    maximumPosition
  );
}

/**
 * Replay one TipTap formatting command against every retained range in a
 * single transaction, then restore the most recently selected range.
 */
export function applyRichTextCommandAcrossRanges(
  editor: Editor,
  selectedRanges: readonly RichTextSelectionRange[],
  command: (chain: RichTextCommandChain) => RichTextCommandChain,
  options: { focus?: boolean } = {}
): boolean {
  const ranges = normalizeRichTextSelectionRanges(
    selectedRanges,
    editor.state.doc.content.size
  );
  if (!ranges.length) return false;

  let chain = editor.chain();
  for (const range of ranges) {
    chain = command(chain.setTextSelection(range));
  }
  chain = chain.setTextSelection(ranges[ranges.length - 1]);
  if (options.focus !== false) {
    chain = chain.focus(undefined, { scrollIntoView: false });
  }
  return chain.run();
}

export function resolveRichTextAdditiveSelectionRanges({
  baseRanges,
  browserRanges = [],
  editorRange,
  dragRange,
  maximumPosition = Number.MAX_SAFE_INTEGER,
}: {
  baseRanges: readonly RichTextSelectionRange[];
  browserRanges?: readonly RichTextSelectionRange[];
  editorRange?: RichTextSelectionRange | null;
  dragRange?: RichTextSelectionRange | null;
  maximumPosition?: number;
}): RichTextSelectionRange[] {
  return normalizeRichTextSelectionRanges([
    ...baseRanges,
    ...browserRanges,
    ...(editorRange ? [editorRange] : []),
    ...(dragRange ? [dragRange] : []),
  ], maximumPosition);
}

/** Compare CSS colors persisted by TipTap without changing their authored form. */
export function comparableRichTextColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/\s+/g, "");
  return normalized || null;
}

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
