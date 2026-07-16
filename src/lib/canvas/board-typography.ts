import type { Node } from "@xyflow/react";

export const MIN_BOARD_FONT_SIZE = 8;
export const MAX_BOARD_FONT_SIZE = 96;

const BOARD_TYPOGRAPHY_NODE_TYPES = new Set(["shape", "sticky", "text", "mindmap"]);

export function normalizeBoardFontSize(value: number): number {
  if (!Number.isFinite(value)) return 14;
  return Math.max(MIN_BOARD_FONT_SIZE, Math.min(MAX_BOARD_FONT_SIZE, Math.round(value)));
}

export function supportsBoardTypography(node: Node): boolean {
  return BOARD_TYPOGRAPHY_NODE_TYPES.has(node.type ?? "");
}

/** Remove rich-text runs that would otherwise override a whole-object font-size change. */
export function normalizeWholeBoxFontSize(
  data: Record<string, unknown>,
  value: number
): Record<string, unknown> {
  const patch: Record<string, unknown> = { fontSize: value };
  if (typeof data.richText !== "string") return patch;

  const fallback = data.richText.replace(/font-size\s*:\s*[^;"']+;?/gi, "");
  if (typeof document === "undefined") {
    patch.richText = fallback;
    return patch;
  }

  const container = document.createElement("div");
  container.innerHTML = data.richText;
  container.querySelectorAll<HTMLElement>("[style]").forEach((element) => {
    element.style.removeProperty("font-size");
    if (!element.getAttribute("style")?.trim()) element.removeAttribute("style");
  });
  patch.richText = container.innerHTML || fallback;
  return patch;
}

export function applyBoardFontSize(nodes: Node[], value: number): Node[] {
  const fontSize = normalizeBoardFontSize(value);
  return nodes.map((node) => {
    if (!supportsBoardTypography(node)) return node;
    const data = (node.data ?? {}) as Record<string, unknown>;
    const patch = normalizeWholeBoxFontSize(data, fontSize);
    if (data.layoutVisualStyle) patch.layoutAutoTypography = false;
    return { ...node, data: { ...data, ...patch } };
  });
}
