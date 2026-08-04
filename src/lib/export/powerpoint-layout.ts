import type { Node } from "@xyflow/react";
import type { ShapeType } from "../types";
import { getNodeRect } from "../layout/geometry";

export const POWERPOINT_SLIDE = {
  width: 13.333,
  height: 7.5,
  content: {
    x: 0.52,
    y: 1.08,
    width: 12.293,
    height: 5.82,
  },
} as const;

export interface PowerPointRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PowerPointTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
  boardBounds: PowerPointRect;
  contentBounds: PowerPointRect;
}

export interface PowerPointColor {
  color: string;
  transparency: number;
}

const NAMED_COLORS: Readonly<Record<string, string>> = {
  black: "000000",
  white: "FFFFFF",
  red: "EF4444",
  orange: "F97316",
  amber: "F59E0B",
  yellow: "EAB308",
  green: "22C55E",
  emerald: "10B981",
  teal: "14B8A6",
  cyan: "06B6D4",
  blue: "3B82F6",
  indigo: "6366F1",
  violet: "8B5CF6",
  purple: "A855F7",
  pink: "EC4899",
  rose: "F43F5E",
  gray: "6B7280",
  grey: "6B7280",
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function channelToHex(value: number): string {
  return Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0").toUpperCase();
}

/** Convert common authored CSS colors to PowerPoint's six-digit RGB format. */
export function powerPointColor(
  value: unknown,
  fallback = "6366F1"
): PowerPointColor {
  if (typeof value !== "string" || !value.trim()) {
    return { color: fallback, transparency: 0 };
  }
  const token = value.trim().toLowerCase();
  if (token === "transparent" || token === "none") {
    return { color: fallback, transparency: 100 };
  }
  const named = NAMED_COLORS[token];
  if (named) return { color: named, transparency: 0 };

  const hex = token.match(/^#([0-9a-f]{3,8})$/i)?.[1];
  if (hex) {
    if (hex.length === 3 || hex.length === 4) {
      const color = hex.slice(0, 3).split("").map((character) => `${character}${character}`).join("");
      const alpha = hex.length === 4 ? Number.parseInt(`${hex[3]}${hex[3]}`, 16) / 255 : 1;
      return { color: color.toUpperCase(), transparency: Math.round((1 - alpha) * 100) };
    }
    if (hex.length === 6 || hex.length === 8) {
      const alpha = hex.length === 8 ? Number.parseInt(hex.slice(6), 16) / 255 : 1;
      return { color: hex.slice(0, 6).toUpperCase(), transparency: Math.round((1 - alpha) * 100) };
    }
  }

  const rgb = token.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+)\s*)?\)$/i);
  if (rgb) {
    const alpha = rgb[4] === undefined ? 1 : clamp(Number(rgb[4]), 0, 1);
    return {
      color: `${channelToHex(Number(rgb[1]))}${channelToHex(Number(rgb[2]))}${channelToHex(Number(rgb[3]))}`,
      transparency: Math.round((1 - alpha) * 100),
    };
  }

  return { color: fallback, transparency: 0 };
}

export function plainPowerPointText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p\s*>/gi, "\n")
    .replace(/<\/li\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function textPart(value: unknown): string | null {
  const text = plainPowerPointText(value);
  return text || null;
}

/** Build editable, useful text for every board-node family. */
export function editableNodeText(node: Node): string {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const compact = (values: unknown[]) => values.map(textPart).filter((value): value is string => Boolean(value));
  switch (node.type) {
    case "sanskrit":
      return compact([data.title, data.devanagari, data.iast, data.translation, data.grammarNotes]).join("\n");
    case "shloka":
      return compact([
        data.title,
        data.sourceText,
        data.devanagari,
        data.iast,
        data.padaccheda,
        data.anvaya,
        data.padartha,
        data.translation,
        data.chandas,
      ]).join("\n");
    case "grammar": {
      const examples = Array.isArray(data.examples) ? data.examples.join(" • ") : data.examples;
      return compact([data.topic, data.category, data.rule, examples, data.exceptions]).join("\n");
    }
    case "audio":
      return compact([data.title, "Audio note"]).join("\n");
    case "frame":
      return textPart(data.title) ?? "Section";
    default:
      return compact([
        data.richText,
        data.text,
        data.label,
        data.title,
        data.centerText,
        data.devanagari,
        data.translation,
      ])[0] ?? "Untitled";
  }
}

/** Native PowerPoint shape names used by PptxGenJS. */
export function powerPointShapeName(shapeType: ShapeType | undefined): string {
  switch (shapeType) {
    case "rounded":
    case "capsule":
      return "roundRect";
    case "circle":
    case "ellipse":
      return "ellipse";
    case "diamond":
      return "diamond";
    case "callout":
      return "wedgeRoundRectCallout";
    case "triangle":
      return "triangle";
    case "hexagon":
      return "hexagon";
    case "star":
      return "star5";
    case "arrow":
      return "rightArrow";
    case "parallelogram":
      return "parallelogram";
    case "trapezoid":
      return "trapezoid";
    case "document":
      return "flowChartDocument";
    case "database":
      return "can";
    case "predefinedProcess":
      return "flowChartPredefinedProcess";
    case "delay":
      return "flowChartDelay";
    case "cloud":
      return "cloud";
    case "offPageConnector":
      return "flowChartOffpageConnector";
    case "flower":
      return "sun";
    case "leaf":
      return "teardrop";
    case "rectangle":
    default:
      return "rect";
  }
}

export function buildPowerPointTransform(
  nodes: readonly Node[],
  contentBounds: PowerPointRect = POWERPOINT_SLIDE.content
): PowerPointTransform {
  const rects = nodes.map(getNodeRect);
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);
  const scale = Math.min(contentBounds.width / width, contentBounds.height / height);
  const renderedWidth = width * scale;
  const renderedHeight = height * scale;
  return {
    scale,
    offsetX: contentBounds.x + (contentBounds.width - renderedWidth) / 2 - left * scale,
    offsetY: contentBounds.y + (contentBounds.height - renderedHeight) / 2 - top * scale,
    boardBounds: { x: left, y: top, width, height },
    contentBounds,
  };
}

export function transformNodeRect(node: Node, transform: PowerPointTransform): PowerPointRect {
  const rect = getNodeRect(node);
  return {
    x: rect.left * transform.scale + transform.offsetX,
    y: rect.top * transform.scale + transform.offsetY,
    width: Math.max(0.08, rect.width * transform.scale),
    height: Math.max(0.08, rect.height * transform.scale),
  };
}

export function scaledFontSize(sourcePixels: unknown, scale: number): number {
  const pixels = typeof sourcePixels === "number" && Number.isFinite(sourcePixels)
    ? sourcePixels
    : 18;
  return Math.round(clamp(pixels * scale * 72, 9, 28) * 10) / 10;
}

export function safePowerPointFilename(title: string): string {
  const safe = title
    .normalize("NFKD")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 100);
  return `${safe || "Teaching chart"}.pptx`;
}
