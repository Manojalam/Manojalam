import type { Node } from "@xyflow/react";
import type { LayoutMode, LayoutVisualStyle } from "../types";
import { fitShapeToContent, type ContentMeasurement } from "../canvas/shape-fitting";
import type { Hierarchy } from "./hierarchy";
import { getSubtree } from "./hierarchy";

const SIZED_LAYOUT_MODES = new Set<LayoutMode>([
  "fromParentFreeForm",
  "horizontal",
  "vertical",
  "list",
  "topDown",
  "linear",
]);

const SQUARE_SHAPES = new Set(["circle", "diamond", "star", "flower"]);
const NON_UNIFORM_SHAPES = new Set([
  ...SQUARE_SHAPES,
  "ellipse",
  "triangle",
  "leaf",
]);

export interface LayoutNodeSize {
  width: number;
  height: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function positiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function stripRichText(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function nodeText(data: Record<string, unknown>): string {
  if (typeof data.richText === "string" && data.richText.trim()) {
    return stripRichText(data.richText).trim();
  }
  return ["text", "title", "topic", "label", "devanagari", "iast", "translation", "rule"]
    .map((field) => data[field])
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n")
    .trim();
}

function maximumInlineFontSize(data: Record<string, unknown>): number {
  if (typeof data.richText !== "string") return 0;
  const sizes = [...data.richText.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/gi)]
    .map((match) => Number(match[1]))
    .filter(Number.isFinite);
  return sizes.length ? Math.max(...sizes) : 0;
}

function wrappedLineCount(lines: string[], charactersPerLine: number): number {
  const limit = Math.max(1, charactersPerLine);
  let count = 0;
  for (const rawLine of lines.length ? lines : [""]) {
    const words = rawLine.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      count += 1;
      continue;
    }
    let current = 0;
    for (const word of words) {
      const length = Array.from(word).length;
      if (length >= limit) {
        if (current) count += 1;
        count += Math.ceil(length / limit);
        current = 0;
        continue;
      }
      const next = current ? current + 1 + length : length;
      if (next > limit) {
        count += 1;
        current = length;
      } else {
        current = next;
      }
    }
    if (current) count += 1;
  }
  return Math.max(1, count);
}

function roleFontSize(mode: LayoutMode, depth: number): number {
  if (mode === "matrix") return depth === 0 ? 24 : depth === 1 ? 20 : 18;
  if (mode === "list") return depth === 0 ? 22 : depth === 1 ? 19 : 17;
  if (mode === "linear") return depth === 0 ? 20 : 18;
  return depth === 0 ? 22 : depth === 1 ? 19 : 17;
}

export function layoutFontSizeFor(mode: LayoutMode, depth: number): number {
  return roleFontSize(mode, Math.max(0, depth));
}

export function resolveLayoutFontSize(data: Record<string, unknown>): number | undefined {
  const visualStyle = data.layoutVisualStyle as Partial<LayoutVisualStyle> | undefined;
  const storedFontSize = positiveNumber(data.fontSize);
  if (
    data.layoutAutoTypography !== false
    && typeof visualStyle?.fontSize === "number"
    && Number.isFinite(visualStyle.fontSize)
  ) {
    // Layout typography is a readability floor. It must never shrink text the
    // user already made larger before arranging the branch.
    return Math.max(storedFontSize ?? 0, visualStyle.fontSize);
  }
  return storedFontSize ?? undefined;
}

export function supportsGeneratedLayoutSizing(mode: LayoutMode): boolean {
  return SIZED_LAYOUT_MODES.has(mode);
}

function sizingPreset(mode: LayoutMode, depth: number) {
  if (mode === "list") {
    return {
      minimumWidth: depth === 0 ? 240 : depth === 1 ? 220 : 200,
      minimumHeight: depth === 0 ? 72 : 64,
      maximumContentWidth: depth === 0 ? 380 : 340,
    };
  }
  if (mode === "linear") {
    return { minimumWidth: depth === 0 ? 220 : 180, minimumHeight: 64, maximumContentWidth: 280 };
  }
  if (mode === "vertical" || mode === "topDown") {
    return {
      minimumWidth: depth === 0 ? 230 : 190,
      minimumHeight: depth === 0 ? 72 : 64,
      maximumContentWidth: 320,
    };
  }
  return {
    minimumWidth: depth === 0 ? 230 : 190,
    minimumHeight: depth === 0 ? 72 : 64,
    maximumContentWidth: 300,
  };
}

function estimatedContent(
  node: Node,
  fontSize: number,
  maximumContentWidth: number
): ContentMeasurement {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const text = nodeText(data);
  const lines = text ? text.split(/\n/) : [""];
  const characters = Array.from(lines.join(" ")).length;
  const longestWord = lines
    .flatMap((line) => line.split(/\s+/))
    .reduce((maximum, word) => Math.max(maximum, Array.from(word).length), 0);
  const characterWidth = Math.max(6, fontSize * 0.6);
  const naturalWidth = Math.max(
    longestWord * characterWidth,
    Math.sqrt(Math.max(1, characters)) * characterWidth * 2.35
  );
  const width = clamp(naturalWidth, 96, maximumContentWidth);
  const lineCount = wrappedLineCount(lines, Math.max(8, Math.floor(width / characterWidth)));
  const lineHeight = fontSize * 1.42;
  const stored = (data.intrinsicContentSize ?? data.matrixIntrinsicSize) as Partial<ContentMeasurement> | undefined;
  const storedWidth = positiveNumber(stored?.width) ?? 0;
  const storedHeight = positiveNumber(stored?.height) ?? 0;
  return {
    width: Math.min(maximumContentWidth, Math.max(width, storedWidth)),
    height: Math.max(lineHeight, lineCount * lineHeight, storedHeight),
    lineCount: Math.max(lineCount, positiveNumber(stored?.lineCount) ?? 0),
    lineHeight,
  };
}

function nodeLayoutSize(node: Node, mode: LayoutMode, depth: number): LayoutNodeSize | null {
  if (!node.type || !["shape", "sticky", "text", "mindmap"].includes(node.type)) return null;
  const data = (node.data ?? {}) as Record<string, unknown>;
  const preset = sizingPreset(mode, depth);
  const fontSize = Math.max(resolveLayoutFontSize(data) ?? 14, maximumInlineFontSize(data));
  const content = estimatedContent(node, fontSize, preset.maximumContentWidth);
  const shapeType = node.type === "shape" ? String(data.shapeType ?? "rectangle") : "rectangle";
  const fitted = fitShapeToContent(shapeType, content, {
    nodeType: node.type,
    borderWidth: positiveNumber(data.borderWidth) ?? 2,
    growOnly: false,
    minWidth: preset.minimumWidth,
    minHeight: preset.minimumHeight,
    maxContentWidth: preset.maximumContentWidth,
  });
  return { width: Math.ceil(fitted.width), height: Math.ceil(fitted.height) };
}

function canShareListWidth(node: Node): boolean {
  if (node.type !== "shape") return true;
  const shapeType = String(((node.data ?? {}) as Record<string, unknown>).shapeType ?? "rectangle");
  return !NON_UNIFORM_SHAPES.has(shapeType);
}

/**
 * Compute render dimensions before layout positioning. This lets the layout
 * engine operate on the same boxes the user will see, rather than stale DOM
 * measurements from the previous layout.
 */
export function computeLayoutNodeSizes(
  nodes: Node[],
  hierarchy: Hierarchy,
  rootId: string,
  mode: LayoutMode
): Map<string, LayoutNodeSize> {
  const sizes = new Map<string, LayoutNodeSize>();
  if (!supportsGeneratedLayoutSizing(mode)) return sizes;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const rootDepth = hierarchy.get(rootId)?.depth ?? 0;

  for (const nodeId of getSubtree(rootId, hierarchy)) {
    const node = byId.get(nodeId);
    if (!node) continue;
    const depth = Math.max(0, (hierarchy.get(nodeId)?.depth ?? rootDepth) - rootDepth);
    const size = nodeLayoutSize(node, mode, depth);
    if (size) sizes.set(nodeId, size);
  }

  if (mode !== "list") return sizes;

  const maximumWidthByDepth = new Map<number, number>();
  for (const [nodeId, size] of sizes) {
    const node = byId.get(nodeId)!;
    if (!canShareListWidth(node)) continue;
    const depth = Math.max(0, (hierarchy.get(nodeId)?.depth ?? rootDepth) - rootDepth);
    maximumWidthByDepth.set(depth, Math.max(maximumWidthByDepth.get(depth) ?? 0, size.width));
  }
  for (const [nodeId, size] of sizes) {
    const node = byId.get(nodeId)!;
    if (!canShareListWidth(node)) continue;
    const depth = Math.max(0, (hierarchy.get(nodeId)?.depth ?? rootDepth) - rootDepth);
    sizes.set(nodeId, { ...size, width: maximumWidthByDepth.get(depth) ?? size.width });
  }
  return sizes;
}
