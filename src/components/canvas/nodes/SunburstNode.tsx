"use client";

import { Fragment, memo, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { NodeResizer, type Node, type NodeProps, type ResizeParams } from "@xyflow/react";
import { ArrowLeft, ArrowRight, Link2, Move, Plus, Rows3, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { SunburstNodeData } from "@/lib/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { buildHierarchy, type Hierarchy } from "@/lib/layout/hierarchy";
import {
  CHART_NODE_MAX_SIZE,
  resolveChartNodeResize,
  SUNBURST_MIN_SIZE,
} from "@/lib/canvas/chart-sizing";
import { isHierarchyRadialChartActive } from "@/lib/canvas/chart-selection";
import { resolveObjectRotation } from "@/lib/canvas/object-rotation";
import {
  normalizeRadialLabelRotation,
  resolveChartAwareCenterLabelRotation,
  resolveChartAwareSectorLabelRotation,
} from "@/lib/canvas/radial-label-rotation";
import {
  radialColorScheme,
  radialHierarchyWeight,
  radialOutermostCommonFontSize,
  radialSectorColors,
  type RadialColorSchemeDefinition,
} from "@/lib/radial-layout";
import {
  DEFAULT_RELATIONSHIP_TYPE,
  LEGACY_RELATIONSHIP_TYPE,
  relationshipDefinition,
  resolveRelationshipPolicy,
} from "@/lib/relationships";
import { useCanvasStore } from "@/store/canvas-store";
import { useUIStore } from "@/store/ui-store";
import {
  chartHierarchyEdgeToken,
  chartNodeContentToken,
} from "@/lib/canvas/chart-render-data";
import { RichTextEditor } from "../RichTextEditor";

type PolarPoint = { x: number; y: number };

type SunburstTreeNode = {
  id: string;
  parentId: string | null;
  branchId: string;
  depth: number;
  siblingIndex: number;
  siblingCount: number;
  branchIndex: number;
  weight: number;
  startAngle: number;
  endAngle: number;
  innerRadius: number;
  outerRadius: number;
  children: SunburstTreeNode[];
};

type SunburstSegment = SunburstTreeNode & {
  label: string;
  richText: string;
  fill: string;
  fillEnd: string;
  textColor: string;
  borderColor: string;
  borderWidth: number;
  borderStyle: "solid" | "dashed" | "dotted";
  fontFamily?: string;
  fontWeight: CSSProperties["fontWeight"];
  fontStyle: CSSProperties["fontStyle"];
  textAlign: CSSProperties["textAlign"];
  preferredFontSize?: number;
  maximizeText: boolean;
  textRotation?: number;
};

type LabelFit = {
  lines: string[];
  fontSize: number;
  width: number;
  height: number;
};

type LabelGeometry = LabelFit & {
  x: number;
  y: number;
  rotation: number;
};

type LabelTextStyle = {
  fontFamily?: string;
  fontWeight?: CSSProperties["fontWeight"];
  fontStyle?: CSSProperties["fontStyle"];
};

type BoundaryDrag = {
  pointerId: number;
  nodeId: string;
  nextId: string;
  startAngle: number;
  currentAngle: number;
  endAngle: number;
  nodeWeight: number;
  nextWeight: number;
};

type CenterDrag = {
  pointerId: number;
  rootId: string;
};

type LabelRotationDrag = {
  pointerId: number;
  nodeId: string;
  centerX: number;
  centerY: number;
  startPointerAngle: number;
  startRotation: number;
};

type SunburstVisualBounds = {
  minX: number;
  minY: number;
  width: number;
  height: number;
};

const ROOT_START_ANGLE = -90;
const ROOT_END_ANGLE = 270;
const CHART_PADDING = 22;
const MIN_SECTOR_ANGLE = 2.5;
const MIN_CENTER_RATIO = 14;
const MAX_CENTER_RATIO = 58;
const DEVANAGARI_LINE_HEIGHT = 1.46;
const DEVANAGARI_INK_PADDING_X = 0.16;
const DEVANAGARI_INK_PADDING_Y = 0.18;
const DEVANAGARI_FONT = "var(--font-noto-devanagari), 'Noto Sans Devanagari', sans-serif";
let textMeasurementCanvas: HTMLCanvasElement | null = null;

function roundedBound(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function storedVisualBounds(value: unknown): SunburstVisualBounds | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<SunburstVisualBounds>;
  if (
    typeof candidate.minX !== "number" || !Number.isFinite(candidate.minX) ||
    typeof candidate.minY !== "number" || !Number.isFinite(candidate.minY) ||
    typeof candidate.width !== "number" || !Number.isFinite(candidate.width) || candidate.width <= 0 ||
    typeof candidate.height !== "number" || !Number.isFinite(candidate.height) || candidate.height <= 0
  ) return null;
  return candidate as SunburstVisualBounds;
}

function SunburstBoundsSynchronizer({
  nodeId,
  chartSize,
  bounds,
}: {
  nodeId: string;
  chartSize: number;
  bounds: SunburstVisualBounds;
}) {
  const minX = roundedBound(bounds.minX);
  const minY = roundedBound(bounds.minY);
  const width = roundedBound(bounds.width);
  const height = roundedBound(bounds.height);

  useEffect(() => {
    useCanvasStore.setState((state) => {
      const node = state.nodes.find((candidate) => candidate.id === nodeId);
      if (!node) return {};
      const data = (node.data ?? {}) as Record<string, unknown>;
      const previous = storedVisualBounds(data.relationshipVisualBounds) ?? {
        minX: 0,
        minY: 0,
        width: chartSize,
        height: chartSize,
      };
      const currentWidth = dimension(node.style?.width, chartSize);
      const currentHeight = dimension(node.style?.height, chartSize);
      if (
        previous.minX === minX && previous.minY === minY &&
        previous.width === width && previous.height === height &&
        Math.abs(currentWidth - width) < 0.001 && Math.abs(currentHeight - height) < 0.001
      ) return {};

      const nextData = { ...data };
      const isBaseBounds = Math.abs(minX) < 0.001
        && Math.abs(minY) < 0.001
        && Math.abs(width - chartSize) < 0.001
        && Math.abs(height - chartSize) < 0.001;
      if (isBaseBounds) delete nextData.relationshipVisualBounds;
      else nextData.relationshipVisualBounds = { minX, minY, width, height };

      const basePosition = {
        x: node.position.x - previous.minX,
        y: node.position.y - previous.minY,
      };
      return {
        nodes: state.nodes.map((candidate) => candidate.id === nodeId
          ? {
              ...candidate,
              position: { x: basePosition.x + minX, y: basePosition.y + minY },
              data: nextData,
              style: { ...(candidate.style ?? {}), width, height },
            }
          : candidate),
      };
    });
  }, [chartSize, height, minX, minY, nodeId, width]);

  return null;
}

function dimension(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function stripRichText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function nodeLabel(node: Node | undefined): string {
  if (!node) return "";
  const data = (node.data ?? {}) as Record<string, unknown>;
  const richText = stripRichText(data.richText);
  if (richText) return richText;
  const fields = ["text", "title", "topic", "label", "devanagari", "iast", "translation", "rule"];
  const text = fields
    .map((field) => data[field])
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ");
  return text.replace(/[ \t]+/g, " ").trim();
}

function nodeRichText(node: Node | undefined, label: string): string {
  const data = (node?.data ?? {}) as Record<string, unknown>;
  if (typeof data.richText === "string" && data.richText.trim()) return data.richText;
  return `<p>${escapeHtml(label).replace(/\n/g, "<br>")}</p>`;
}

function pointOnCircle(cx: number, cy: number, radius: number, angleDeg: number): PolarPoint {
  const angle = (angleDeg * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle),
  };
}

function arcSegmentPath(
  cx: number,
  cy: number,
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number
): string {
  const span = Math.max(0.01, endAngle - startAngle);
  const largeArc = span > 180 ? 1 : 0;
  const outerStart = pointOnCircle(cx, cy, outerRadius, startAngle);
  const outerEnd = pointOnCircle(cx, cy, outerRadius, endAngle);
  const innerEnd = pointOnCircle(cx, cy, innerRadius, endAngle);
  const innerStart = pointOnCircle(cx, cy, innerRadius, startAngle);

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    "Z",
  ].join(" ");
}

const graphemeSegmenter = typeof Intl.Segmenter === "function"
  ? new Intl.Segmenter("sa", { granularity: "grapheme" })
  : null;

function textMeasureUnits(text: string): number {
  return graphemeSegmenter
    ? Array.from(graphemeSegmenter.segment(text)).length
    : Array.from(text).length;
}

function isDevanagariText(text: string): boolean {
  return /[\u0900-\u097f]/.test(text);
}

function labelFontFamily(label: string, configured?: string): string | undefined {
  if (!isDevanagariText(label)) return configured;
  return configured ? `${configured}, ${DEVANAGARI_FONT}` : DEVANAGARI_FONT;
}

function labelFontWeight(label: string, configured: CSSProperties["fontWeight"]): CSSProperties["fontWeight"] {
  if (!isDevanagariText(label)) return configured;
  return typeof configured === "number" ? Math.min(700, configured) : configured;
}

function canvasFontFamily(family: string | undefined): string {
  if (!family) return "sans-serif";
  if (typeof document === "undefined") return family;
  return family.replace(/var\((--[^),]+)(?:,[^)]+)?\)/g, (_match, variable: string) =>
    getComputedStyle(document.documentElement).getPropertyValue(variable).trim() || "sans-serif"
  );
}

function browserTextMetrics(
  text: string,
  fontSize: number,
  label: string,
  style: LabelTextStyle
): TextMetrics | null {
  if (typeof document === "undefined") return null;
  textMeasurementCanvas ??= document.createElement("canvas");
  const context = textMeasurementCanvas.getContext("2d");
  if (!context) return null;
  const family = canvasFontFamily(labelFontFamily(label, style.fontFamily));
  const weight = labelFontWeight(label, style.fontWeight ?? 400) ?? 400;
  context.font = `${style.fontStyle ?? "normal"} ${weight} ${fontSize}px ${family}`;
  return context.measureText(text);
}

function textMetrics(
  lines: string[],
  fontSize: number,
  label: string,
  style: LabelTextStyle,
  useBrowserMetrics: boolean
): { width: number; height: number } {
  const devanagari = lines.some(isDevanagariText);
  const widthFactor = devanagari ? 0.62 : 0.54;
  const lineHeight = devanagari ? DEVANAGARI_LINE_HEIGHT : 1.12;
  const inkPaddingX = devanagari ? DEVANAGARI_INK_PADDING_X : 0;
  const inkPaddingY = devanagari ? DEVANAGARI_INK_PADDING_Y : 0;
  const measurements = useBrowserMetrics
    ? lines.map((line) => browserTextMetrics(line, fontSize, label, style))
    : [];
  const measuredWidth = measurements.length && measurements.every(Boolean)
    ? Math.max(0, ...measurements.map((measurement) => {
        if (!measurement) return 0;
        return Math.max(
          measurement.width,
          (measurement.actualBoundingBoxLeft ?? 0) + (measurement.actualBoundingBoxRight ?? 0)
        );
      }))
    : Math.max(0, ...lines.map((line) => textMeasureUnits(line) * fontSize * widthFactor));
  const measuredInkHeight = measurements.length && measurements.every(Boolean)
    ? Math.max(0, ...measurements.map((measurement) =>
        measurement
          ? (measurement.actualBoundingBoxAscent ?? 0) + (measurement.actualBoundingBoxDescent ?? 0)
          : 0
      ))
    : 0;
  const lineBoxHeight = fontSize * lineHeight;
  return {
    width: measuredWidth + fontSize * inkPaddingX,
    height: Math.max(
      lineBoxHeight * Math.max(1, lines.length),
      lineBoxHeight * Math.max(0, lines.length - 1) + measuredInkHeight
    ) + fontSize * inkPaddingY,
  };
}

function explicitLabelLines(label: string): string[] {
  return label
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim().replace(/\s+/g, " "))
    .filter(Boolean);
}

function wrapLabel(label: string, maxUnits: number): string[] {
  const safeUnits = Math.max(1, Math.floor(maxUnits));
  const lines: string[] = [];

  for (const explicitLine of label.replace(/\r\n/g, "\n").split("\n")) {
    const words = explicitLine.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (textMeasureUnits(next) > safeUnits && current) {
        lines.push(current);
        current = word;
      } else {
        current = next;
      }
    }
    if (current) lines.push(current);
  }

  return lines.length ? lines : [""];
}

function wrapLabelToWidth(
  label: string,
  availableWidth: number,
  fontSize: number,
  style: LabelTextStyle,
  useBrowserMetrics: boolean
): string[] {
  if (!useBrowserMetrics) {
    const widthFactor = isDevanagariText(label) ? 0.62 : 0.54;
    const maxUnits = availableWidth / Math.max(0.8, fontSize * widthFactor);
    return wrapLabel(label, maxUnits);
  }

  const lines: string[] = [];
  for (const explicitLine of label.replace(/\r\n/g, "\n").split("\n")) {
    const words = explicitLine.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      const nextWidth = textMetrics([next], fontSize, label, style, true).width;
      if (current && nextWidth > availableWidth) {
        lines.push(current);
        current = word;
      } else {
        current = next;
      }
    }
    if (current) lines.push(current);
  }
  return lines.length ? lines : [""];
}

function fitLabel(
  label: string,
  availableWidth: number,
  availableHeight: number,
  preferredFontSize: number,
  style: LabelTextStyle,
  useBrowserMetrics: boolean,
  minimumReadableFont: number,
  maximizeFontSize = false
): LabelFit {
  const width = Math.max(0.5, availableWidth);
  const height = Math.max(0.5, availableHeight);
  if (!label.trim()) return { lines: [], fontSize: preferredFontSize, width, height };

  const maxFont = maximizeFontSize
    ? 96
    : Math.max(minimumReadableFont, preferredFontSize);
  const unwrapped = explicitLabelLines(label);
  const fittedLinesAt = (fontSize: number): string[] | null => {
    const unwrappedMetrics = textMetrics(unwrapped, fontSize, label, style, useBrowserMetrics);
    if (unwrappedMetrics.width <= width && unwrappedMetrics.height <= height) return unwrapped;
    const lines = wrapLabelToWidth(label, width, fontSize, style, useBrowserMetrics);
    const metrics = textMetrics(lines, fontSize, label, style, useBrowserMetrics);
    return metrics.width <= width && metrics.height <= height ? lines : null;
  };

  if (maximizeFontSize) {
    let lower = minimumReadableFont;
    let upper = maxFont;
    let lines = fittedLinesAt(lower);
    if (!lines) return { lines: [], fontSize: minimumReadableFont, width, height };
    for (let iteration = 0; iteration < 14; iteration += 1) {
      const candidate = (lower + upper) / 2;
      const candidateLines = fittedLinesAt(candidate);
      if (candidateLines) {
        lower = candidate;
        lines = candidateLines;
      } else {
        upper = candidate;
      }
    }
    return { lines, fontSize: Math.floor(lower * 4) / 4, width, height };
  }

  const unwrappedMetrics = textMetrics(unwrapped, maxFont, label, style, useBrowserMetrics);
  if (unwrappedMetrics.width <= width && unwrappedMetrics.height <= height) {
    return { lines: unwrapped, fontSize: maxFont, width, height };
  }

  const preferredWrapped = wrapLabelToWidth(label, width, maxFont, style, useBrowserMetrics);
  const preferredWrappedMetrics = textMetrics(preferredWrapped, maxFont, label, style, useBrowserMetrics);
  if (preferredWrappedMetrics.width <= width && preferredWrappedMetrics.height <= height) {
    return { lines: preferredWrapped, fontSize: maxFont, width, height };
  }

  let fontSize = maxFont;
  while (fontSize >= minimumReadableFont) {
    const smallerUnwrapped = textMetrics(unwrapped, fontSize, label, style, useBrowserMetrics);
    if (smallerUnwrapped.width <= width && smallerUnwrapped.height <= height) {
      return { lines: unwrapped, fontSize, width, height };
    }
    const lines = wrapLabelToWidth(label, width, fontSize, style, useBrowserMetrics);
    const metrics = textMetrics(lines, fontSize, label, style, useBrowserMetrics);
    if (metrics.width <= width && metrics.height <= height) {
      return { lines, fontSize, width, height };
    }
    if (fontSize === minimumReadableFont) break;
    fontSize = Math.max(minimumReadableFont, fontSize - Math.max(0.25, fontSize * 0.06));
  }

  return { lines: [], fontSize: minimumReadableFont, width, height };
}

function sectorLabelGeometry(
  segment: SunburstSegment,
  center: number,
  useBrowserMetrics: boolean,
  chartRotation: unknown,
  preferredFontSizeOverride?: number,
  minimumReadableFontSizeOverride?: number
): LabelGeometry {
  const midAngle = (segment.startAngle + segment.endAngle) / 2;
  const textRadius = (segment.innerRadius + segment.outerRadius) / 2;
  const point = pointOnCircle(center, center, textRadius, midAngle);
  const angleSpan = segment.endAngle - segment.startAngle;
  const arcLength = Math.max(0.5, (angleSpan * Math.PI * textRadius) / 180);
  const radialBand = Math.max(0.5, segment.outerRadius - segment.innerRadius);
  const useRadialAxis = radialBand > arcLength;
  const width = useRadialAxis ? radialBand : arcLength;
  const height = useRadialAxis ? arcLength : radialBand;
  const defaultMax = segment.depth <= 1 ? 30 : 22;
  const preferred = clamp(preferredFontSizeOverride ?? segment.preferredFontSize ?? defaultMax, 4, 96);
  const automaticMinimum = isDevanagariText(segment.label)
    ? segment.depth <= 1 ? 14 : 12
    : segment.depth <= 1 ? 13 : 11;
  const minimumReadable = typeof minimumReadableFontSizeOverride === "number"
    ? clamp(minimumReadableFontSizeOverride, 4, preferred)
    : segment.preferredFontSize === undefined
      ? automaticMinimum
      : Math.min(preferred, automaticMinimum);
  const fit = fitLabel(segment.label, width, height, preferred, {
    fontFamily: segment.fontFamily,
    fontWeight: /<(strong|b)\b/i.test(segment.richText) ? 700 : segment.fontWeight,
    fontStyle: /<(em|i)\b/i.test(segment.richText) ? "italic" : segment.fontStyle,
  }, useBrowserMetrics, minimumReadable, segment.maximizeText && preferredFontSizeOverride === undefined);
  const baseRotation = useRadialAxis ? midAngle : midAngle + 90;
  const rotation = resolveChartAwareSectorLabelRotation(
    baseRotation,
    chartRotation,
    segment.textRotation
  );
  return { ...fit, x: point.x, y: point.y, rotation };
}

function circleLabelGeometry(
  label: string,
  radius: number,
  center: number,
  preferredFontSize: number | undefined,
  style: LabelTextStyle,
  useBrowserMetrics: boolean,
  maximizeFontSize = false,
  manualRotation: unknown = 0,
  chartRotation: unknown = 0
): LabelGeometry {
  const width = Math.max(24, radius * 1.55);
  const height = Math.max(24, radius * 1.5);
  const preferred = clamp(preferredFontSize ?? Math.min(32, radius * 0.34), 5, 96);
  const automaticMinimum = isDevanagariText(label) ? 16 : 14;
  const minimumReadable = preferredFontSize === undefined ? automaticMinimum : Math.min(preferred, automaticMinimum);
  return {
    ...fitLabel(label, width, height, preferred, style, useBrowserMetrics, minimumReadable, maximizeFontSize),
    x: center,
    y: center,
    rotation: resolveChartAwareCenterLabelRotation(chartRotation, manualRotation),
  };
}

function buildSunburstTree(
  rootId: string,
  hierarchy: Hierarchy,
  byId: Map<string, Node>,
  equalOutermostSegments = false
): SunburstTreeNode {
  const build = (
    id: string,
    parentId: string | null,
    depth: number,
    siblingIndex: number,
    siblingCount: number,
    branchIndex: number,
    branchId: string
  ): SunburstTreeNode => {
    const childIds = hierarchy.get(id)?.childIds ?? [];
    const children = childIds.map((childId, index) =>
      build(
        childId,
        id,
        depth + 1,
        index,
        childIds.length,
        depth === 0 ? index : branchIndex,
        depth === 0 ? childId : branchId
      )
    );
    const data = (byId.get(id)?.data ?? {}) as Record<string, unknown>;
    return {
      id,
      parentId,
      branchId,
      depth,
      siblingIndex,
      siblingCount,
      branchIndex,
      weight: radialHierarchyWeight(
        children.map((child) => child.weight),
        data.radialWeight,
        equalOutermostSegments
      ),
      startAngle: ROOT_START_ANGLE,
      endAngle: ROOT_END_ANGLE,
      innerRadius: 0,
      outerRadius: 0,
      children,
    };
  };
  return build(rootId, null, 0, 0, 1, 0, rootId);
}

function maxDepthOf(node: SunburstTreeNode): number {
  return Math.max(node.depth, ...node.children.map(maxDepthOf));
}

type RadialBand = { innerRadius: number; outerRadius: number };

function radialBands(
  centerRadius: number,
  outerRadius: number,
  depthCount: number,
  widthWeights: unknown
): RadialBand[] {
  const source = Array.isArray(widthWeights) ? widthWeights : [];
  const weights = Array.from({ length: depthCount }, (_, index) =>
    clamp(dimension(source[index], 1), 0.000001, 1000000)
  );
  if (!weights.length) return [];
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const availableRadius = Math.max(0, outerRadius - centerRadius);
  const minimumBand = Math.min(28, availableRadius / (2 * weights.length));
  const flexibleRadius = Math.max(0, availableRadius - minimumBand * weights.length);
  let cursor = centerRadius;
  return weights.map((weight, index) => {
    const width = index === weights.length - 1
      ? outerRadius - cursor
      : minimumBand + flexibleRadius * (weight / Math.max(0.01, total));
    const band = { innerRadius: cursor, outerRadius: cursor + width };
    cursor += width;
    return band;
  });
}

function assignGeometry(node: SunburstTreeNode, centerRadius: number, bands: RadialBand[]): void {
  if (node.depth === 0) {
    node.innerRadius = 0;
    node.outerRadius = centerRadius;
  } else {
    const band = bands[Math.min(node.depth - 1, bands.length - 1)];
    node.innerRadius = band?.innerRadius ?? centerRadius;
    node.outerRadius = band?.outerRadius ?? centerRadius;
  }

  const childWeight = node.children.reduce((sum, child) => sum + child.weight, 0);
  let currentAngle = node.startAngle;
  node.children.forEach((child, index) => {
    child.startAngle = currentAngle;
    child.endAngle = index === node.children.length - 1
      ? node.endAngle
      : currentAngle + (node.endAngle - node.startAngle) * (child.weight / Math.max(0.01, childWeight));
    assignGeometry(child, centerRadius, bands);
    currentAngle = child.endAngle;
  });
}

function extendTerminalSectors(node: SunburstTreeNode, outerRadius: number): void {
  if (node.depth > 0 && !node.children.length) node.outerRadius = outerRadius;
  node.children.forEach((child) => extendTerminalSectors(child, outerRadius));
}

function collectSegments(
  node: SunburstTreeNode,
  byId: Map<string, Node>,
  scheme: RadialColorSchemeDefinition,
  chartStyle: Record<string, unknown> = {}
): SunburstSegment[] {
  const segments: SunburstSegment[] = [];
  const walk = (candidate: SunburstTreeNode) => {
    if (candidate.depth > 0) {
      const source = byId.get(candidate.id);
      const data = (source?.data ?? {}) as Record<string, unknown>;
      const branchData = (byId.get(candidate.branchId)?.data ?? {}) as Record<string, unknown>;
      const label = nodeLabel(source);
      const paletteColors = radialSectorColors(
        scheme,
        candidate.branchIndex,
        candidate.depth,
        candidate.siblingIndex,
        candidate.siblingCount,
        branchData.radialFillColor as string | undefined,
        data.radialFillColor as string | undefined
      );
      segments.push({
        ...candidate,
        label,
        richText: nodeRichText(source, label),
        fill: (chartStyle.fillColor as string | undefined) ?? paletteColors.fill,
        fillEnd: (chartStyle.fillColor as string | undefined) ?? paletteColors.fillEnd,
        textColor: (chartStyle.textColor as string | undefined) ?? (data.radialTextColor as string | undefined) ?? (data.textColor as string | undefined) ?? paletteColors.text,
        borderColor: (chartStyle.borderColor as string | undefined) ?? (data.radialBorderColor as string | undefined) ?? paletteColors.border,
        borderWidth: clamp(dimension(chartStyle.borderWidth ?? data.radialBorderWidth, 1.4), 0, 16),
        borderStyle: (data.radialBorderStyle as SunburstSegment["borderStyle"] | undefined) ?? "solid",
        fontFamily: (chartStyle.fontFamily as string | undefined) ?? (data.fontFamily as string | undefined),
        fontWeight: chartStyle.fontWeight === "bold"
          ? 700
          : chartStyle.fontWeight === "normal"
            ? 400
            : data.fontWeight === "bold"
              ? 700
              : data.fontWeight === "normal"
                ? 400
                : candidate.depth <= 1 ? 700 : 600,
        fontStyle: chartStyle.fontStyle === "italic" || data.fontStyle === "italic" ? "italic" : "normal",
        textAlign: (data.textAlign as CSSProperties["textAlign"] | undefined) ?? "center",
        preferredFontSize: typeof chartStyle.fontSize === "number"
          ? chartStyle.fontSize
          : typeof data.fontSize === "number"
            ? data.fontSize
            : undefined,
        maximizeText: chartStyle.maximizeText === true || data.maximizeText === true,
        textRotation: typeof data.radialTextRotation === "number"
          ? data.radialTextRotation
          : undefined,
      });
    }
    candidate.children.forEach(walk);
  };
  walk(node);
  return segments;
}

function selectOriginalNode(nodeId: string, additive = false): void {
  useCanvasStore.setState((state) => {
    const selectedIds = new Set(additive ? state.selectedNodeIds : []);
    if (additive && selectedIds.has(nodeId)) selectedIds.delete(nodeId);
    else selectedIds.add(nodeId);
    const nextIds = Array.from(selectedIds);
    return {
      nodes: state.nodes.map((node) => ({ ...node, selected: selectedIds.has(node.id) })),
      edges: state.edges.map((edge) => ({ ...edge, selected: false })),
      selectedNodeIds: nextIds,
      selectedEdgeIds: [],
    };
  });
}

function dashArray(style: SunburstSegment["borderStyle"]): string | undefined {
  if (style === "dashed") return "7 5";
  if (style === "dotted") return "2 4";
  return undefined;
}

function editableTextPatch(node: Node, html: string): Record<string, unknown> {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const plain = stripRichText(html);
  if ("text" in data || ["shape", "mindmap", "sticky", "text"].includes(node.type ?? "")) {
    return { richText: html, text: plain };
  }
  if ("devanagari" in data) return { richText: html, devanagari: plain };
  if ("rule" in data) return { richText: html, rule: plain };
  if ("title" in data) return { richText: html, title: plain };
  return { richText: html, label: plain };
}

function unwrapAngle(angle: number, near: number): number {
  let result = angle;
  while (result < near - 180) result += 360;
  while (result > near + 180) result -= 360;
  return result;
}

function SunburstNodeComponent({ data, id, selected }: NodeProps) {
  const d = data as SunburstNodeData;
  const objectRotation = resolveObjectRotation("sunburst", d as Record<string, unknown>);
  const nodeContentToken = useCanvasStore((state) => chartNodeContentToken(state.nodes));
  const hierarchyEdgeToken = useCanvasStore((state) => chartHierarchyEdgeToken(state.edges));
  const canvasDragging = useUIStore((state) => state.canvasDragging);
  const { nodes, edges } = useMemo(() => {
    // These tokens intentionally gate when the latest store snapshot is read.
    void canvasDragging;
    void hierarchyEdgeToken;
    void nodeContentToken;
    const state = useCanvasStore.getState();
    return { nodes: state.nodes, edges: state.edges };
  }, [canvasDragging, hierarchyEdgeToken, nodeContentToken]);
  const relationships = useCanvasStore((state) => state.relationships);
  const relationshipFans = useCanvasStore((state) => state.relationshipFans);
  const selectedNodeIds = useCanvasStore((state) => state.selectedNodeIds);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const createChildNode = useCanvasStore((state) => state.createChildNode);
  const createSiblingNode = useCanvasStore((state) => state.createSiblingNode);
  const moveSiblingNode = useCanvasStore((state) => state.moveSiblingNode);
  const clearRelationships = useCanvasStore((state) => state.clearRelationships);
  const pushHistory = useCanvasStore((state) => state.pushHistory);
  const finishManualNodeResize = useCanvasStore((state) => state.finishManualNodeResize);
  const relationshipSelection = useUIStore((state) => state.relationshipSelection);
  const startRelationshipSelection = useUIStore((state) => state.startRelationshipSelection);
  const toggleRelationshipTarget = useUIStore((state) => state.toggleRelationshipTarget);
  const openRelationshipDiagram = useUIStore((state) => state.openRelationshipDiagram);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fontMetricsRevision, setFontMetricsRevision] = useState(0);
  const clipPrefix = `sunburst-clip-${useId().replace(/:/g, "")}`;
  const svgRef = useRef<SVGSVGElement>(null);
  const boundaryDragRef = useRef<BoundaryDrag | null>(null);
  const centerDragRef = useRef<CenterDrag | null>(null);
  const labelRotationDragRef = useRef<LabelRotationDrag | null>(null);
  const editHistoryCaptured = useRef(false);

  const previewChartResize = useCallback((params: ResizeParams) => {
    const resize = resolveChartNodeResize("sunburst", params);
    if (!resize) return;
    useCanvasStore.setState((state) => ({
      nodes: state.nodes.map((node) => node.id === id
        ? {
            ...node,
            data: { ...(node.data ?? {}), ...resize.dataPatch },
            style: {
              ...(node.style ?? {}),
              width: resize.size.width,
              height: resize.size.height,
            },
          }
        : node),
    }));
  }, [id]);

  useEffect(() => {
    let active = true;
    if (typeof document === "undefined" || !document.fonts) return;
    const refreshMetrics = () => {
      if (active) setFontMetricsRevision((revision) => revision + 1);
    };
    void document.fonts.ready.then(refreshMetrics);
    document.fonts.addEventListener("loadingdone", refreshMetrics);
    return () => {
      active = false;
      document.fonts.removeEventListener("loadingdone", refreshMetrics);
    };
  }, []);

  const fontMetricsReady = fontMetricsRevision > 0;

  const model = useMemo(() => {
    const chartNodes = nodes.filter((node) =>
      node.type !== "sunburst"
      && node.type !== "frame"
      && node.type !== "relationshipDiagram"
      && node.type !== "junction"
    );
    const byId = new Map(chartNodes.map((node) => [node.id, node]));
    const root = byId.get(d.rootId);
    if (!root) return null;

    const hierarchy = buildHierarchy(chartNodes, edges);
    const tree = buildSunburstTree(
      d.rootId,
      hierarchy,
      byId,
      d.radialEqualOutermostSegments === true
    );
    const maxDepth = Math.max(1, maxDepthOf(tree));
    const size = dimension(d.chartSize, 720);
    const outerRadius = size / 2 - CHART_PADDING;
    const rootData = (root.data ?? {}) as Record<string, unknown>;
    const scheme = radialColorScheme(rootData.radialColorScheme);
    const centerRatio = clamp(
      dimension(rootData.radialCenterRatio, 28),
      MIN_CENTER_RATIO,
      MAX_CENTER_RATIO
    );
    const centerRadius = tree.children.length
      ? outerRadius * (centerRatio / 100)
      : outerRadius;
    const bands = radialBands(centerRadius, outerRadius, maxDepth, rootData.radialRingWidths);
    tree.startAngle = ROOT_START_ANGLE;
    tree.endAngle = ROOT_END_ANGLE;
    assignGeometry(tree, centerRadius, bands);
    extendTerminalSectors(tree, outerRadius);

    const segments = collectSegments(tree, byId, scheme, d as unknown as Record<string, unknown>);
    return {
      root,
      byId,
      chartNodeIds: new Set([d.rootId, ...segments.map((segment) => segment.id)]),
      chartNodes,
      hierarchy,
      tree,
      size,
      center: size / 2,
      centerRadius,
      outerRadius,
      scheme,
      segments,
    };
  }, [d, edges, nodes]);

  const finishEditing = useCallback(() => {
    if (editHistoryCaptured.current) pushHistory();
    editHistoryCaptured.current = false;
    setEditingId(null);
  }, [pushHistory]);

  const updateText = useCallback((nodeId: string, html: string) => {
    const node = useCanvasStore.getState().nodes.find((candidate) => candidate.id === nodeId);
    if (!node) return;
    if (!editHistoryCaptured.current) {
      pushHistory();
      editHistoryCaptured.current = true;
    }
    updateNodeData(nodeId, editableTextPatch(node, html));
  }, [pushHistory, updateNodeData]);

  if (!model) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-lg border border-dashed bg-background text-xs text-muted-foreground">
        Sunburst root missing
      </div>
    );
  }

  const selectedId = selectedNodeIds.length === 1 && model.chartNodeIds.has(selectedNodeIds[0])
    ? selectedNodeIds[0]
    : null;
  const selectedSectorIds = new Set(selectedNodeIds.filter((nodeId) => model.chartNodeIds.has(nodeId)));
  const chartActive = isHierarchyRadialChartActive(selected, selectedNodeIds, model.chartNodeIds);
  const selectedSegment = selectedId ? model.segments.find((segment) => segment.id === selectedId) ?? null : null;
  const selectedNode = selectedId ? model.byId.get(selectedId) ?? null : null;
  const rootData = (model.root.data ?? {}) as Record<string, unknown>;
  const rootLabel = nodeLabel(model.root);
  const rootRichText = nodeRichText(model.root, rootLabel);
  const rootFit = circleLabelGeometry(
    rootLabel,
    model.centerRadius,
    model.center,
    typeof d.fontSize === "number"
      ? d.fontSize
      : typeof rootData.fontSize === "number"
        ? rootData.fontSize
        : undefined,
    {
      fontFamily: d.fontFamily ?? rootData.fontFamily as string | undefined,
      fontWeight: /<(strong|b)\b/i.test(rootRichText)
        ? 700
        : d.fontWeight === "bold" || rootData.fontWeight === "bold"
          ? 700
          : d.fontWeight === "normal" || rootData.fontWeight === "normal" ? 400 : 800,
      fontStyle: /<(em|i)\b/i.test(rootRichText) || d.fontStyle === "italic" || rootData.fontStyle === "italic" ? "italic" : "normal",
    },
    fontMetricsReady,
    d.maximizeText === true || rootData.maximizeText === true,
    rootData.radialTextRotation,
    objectRotation,
  );
  const rootClipId = `${clipPrefix}-root`;
  const outermostLabelPreferredFontSize = clamp(
    typeof d.fontSize === "number" ? d.fontSize : 18,
    8,
    72
  );
  const outermostLabelMinimumFontSize = 8;
  const outermostLabelSegments = d.radialEqualOutermostLabelSizes === true
    ? model.segments.filter((segment) => !segment.children.length && segment.label.trim())
    : [];
  const outermostLabelFontSize = d.radialEqualOutermostLabelSizes === true
    ? radialOutermostCommonFontSize(
        outermostLabelSegments.map((segment) => {
          const geometry = sectorLabelGeometry(
            segment,
            model.center,
            fontMetricsReady,
            objectRotation,
            outermostLabelPreferredFontSize,
            outermostLabelMinimumFontSize
          );
          return geometry.lines.length ? geometry.fontSize : null;
        }),
        outermostLabelPreferredFontSize,
        outermostLabelMinimumFontSize
      )
    : null;

  const labelGeometryForSegment = (segment: SunburstSegment): LabelGeometry => {
    const useCommonOutermostSize = outermostLabelFontSize !== null && !segment.children.length;
    return sectorLabelGeometry(
      segment,
      model.center,
      fontMetricsReady,
      objectRotation,
      useCommonOutermostSize ? outermostLabelFontSize : undefined,
      useCommonOutermostSize ? outermostLabelMinimumFontSize : undefined
    );
  };

  const selectedGeometry = selectedId === d.rootId
    ? rootFit
    : selectedSegment
      ? labelGeometryForSegment(selectedSegment)
      : null;
  const selectedRichText = selectedId === d.rootId ? rootRichText : selectedSegment?.richText ?? "";
  const selectedLabel = selectedId === d.rootId ? rootLabel : selectedSegment?.label ?? "";
  const selectedClipId = selectedId === d.rootId
    ? rootClipId
    : selectedId
      ? `${clipPrefix}-${selectedId.replace(/[^a-zA-Z0-9_-]/g, "-")}`
      : null;
  const selectedTextStyle = selectedId === d.rootId
    ? {
        color: d.textColor ?? (rootData.radialTextColor as string | undefined) ?? (rootData.textColor as string | undefined) ?? model.scheme.rootText,
        fontFamily: d.fontFamily ?? rootData.fontFamily as string | undefined,
        fontWeight: d.fontWeight === "bold" || rootData.fontWeight === "bold" ? 700 : d.fontWeight === "normal" || rootData.fontWeight === "normal" ? 400 : 800,
        fontStyle: d.fontStyle === "italic" || rootData.fontStyle === "italic" ? "italic" : "normal",
        textAlign: (rootData.textAlign as CSSProperties["textAlign"] | undefined) ?? "center",
      }
    : selectedSegment
      ? {
          color: selectedSegment.textColor,
          fontFamily: selectedSegment.fontFamily,
          fontWeight: selectedSegment.fontWeight,
          fontStyle: selectedSegment.fontStyle,
          textAlign: selectedSegment.textAlign,
        }
      : null;

  const activeRelationshipSession = relationshipSelection?.chartRootNodeId === d.rootId
    ? relationshipSelection
    : null;
  const activeRelationshipPolicy = activeRelationshipSession
    ? resolveRelationshipPolicy({
        relationType: activeRelationshipSession.relationType,
        sourceNodeId: activeRelationshipSession.sourceNodeId,
        chartRootId: d.rootId,
        targetBranchNodeId: activeRelationshipSession.targetBranchNodeId,
        nodes: model.chartNodes,
        hierarchy: model.hierarchy,
      })
    : null;
  const validRelationshipTargetIds = activeRelationshipPolicy?.ok
    ? activeRelationshipPolicy.validTargetIdSet
    : new Set<string>();
  const draftRelationshipTargetIds = new Set(activeRelationshipSession?.draftTargetIds ?? []);

  const relationshipsForSelectedChart = selectedId
    ? relationships.filter((relationship) =>
        relationship.sourceNodeId === selectedId
        && model.chartNodeIds.has(relationship.targetNodeId)
      )
    : [];
  const hasRelationshipsForSelectedSource = selectedId
    ? relationships.some((relationship) =>
        relationship.sourceNodeId === selectedId
        && model.byId.has(relationship.targetNodeId)
      )
    : false;
  const selectedRelationshipTypes = Array.from(new Set(
    relationshipsForSelectedChart.map((relationship) => relationship.relationType)
  ));
  // Existing boards used `has-guna`. Keep that group as the primary editable
  // relationship until the user explicitly creates a newer generic group.
  const primaryRelationshipType = selectedRelationshipTypes.includes(DEFAULT_RELATIONSHIP_TYPE)
    ? DEFAULT_RELATIONSHIP_TYPE
    : selectedRelationshipTypes.includes(LEGACY_RELATIONSHIP_TYPE)
      ? LEGACY_RELATIONSHIP_TYPE
      : DEFAULT_RELATIONSHIP_TYPE;
  const selectedRelationshipFan = selectedId
    ? relationshipFans.find((fan) =>
        fan.sourceNodeId === selectedId && fan.relationType === primaryRelationshipType
      ) ?? null
    : null;
  const selectedRelationships = relationshipsForSelectedChart.filter(
    (relationship) => relationship.relationType === primaryRelationshipType
  );
  const legacySelectedRelationshipTypes = selectedRelationshipTypes.filter(
    (relationType) => relationType !== primaryRelationshipType
  );
  const selectedRelationshipPolicy = selectedId
    ? resolveRelationshipPolicy({
        relationType: primaryRelationshipType,
        sourceNodeId: selectedId,
        chartRootId: d.rootId,
        targetBranchNodeId: selectedRelationshipFan?.targetBranchNodeId,
        nodes: model.chartNodes,
        hierarchy: model.hierarchy,
      })
    : null;

  const relationshipTargetsBySource = new Map<string, Set<string>>();
  for (const relationship of relationships) {
    if (
      !model.chartNodeIds.has(relationship.sourceNodeId)
      || !model.byId.has(relationship.targetNodeId)
    ) continue;
    const targets = relationshipTargetsBySource.get(relationship.sourceNodeId) ?? new Set<string>();
    targets.add(relationship.targetNodeId);
    relationshipTargetsBySource.set(relationship.sourceNodeId, targets);
  }

  const beginRelationshipSelection = (relationType = DEFAULT_RELATIONSHIP_TYPE) => {
    if (!selectedId) return;
    const existingFan = relationshipFans.find((fan) =>
      fan.sourceNodeId === selectedId && fan.relationType === relationType
    );
    const policy = resolveRelationshipPolicy({
      relationType,
      sourceNodeId: selectedId,
      chartRootId: d.rootId,
      targetBranchNodeId: existingFan?.targetBranchNodeId,
      nodes: model.chartNodes,
      hierarchy: model.hierarchy,
    });
    if (!policy.ok) {
      toast.error("Relationships are not available for this section.");
      return;
    }
    if (!policy.validTargetIds.length) {
      toast.error("This chart does not contain another section to relate to.");
      return;
    }
    finishEditing();
    selectOriginalNode(selectedId);
    const existingTargets = new Set(
      relationships
        .filter((relationship) =>
          relationship.sourceNodeId === selectedId && relationship.relationType === relationType
        )
        .map((relationship) => relationship.targetNodeId)
    );
    startRelationshipSelection({
      sourceNodeId: selectedId,
      relationType,
      chartRootNodeId: d.rootId,
      ...(policy.targetBranchNodeId ? { targetBranchNodeId: policy.targetBranchNodeId } : {}),
      draftTargetIds: policy.validTargetIds.filter((nodeId) => existingTargets.has(nodeId)),
    });
  };

  const confirmClearRelationships = (relationType: string) => {
    if (!selectedId) return;
    const count = relationships.filter((relationship) =>
      relationship.sourceNodeId === selectedId && relationship.relationType === relationType
    ).length;
    if (!count) return;
    if (!window.confirm(`Clear all ${count} saved relationship${count === 1 ? "" : "s"} for this section?`)) return;
    clearRelationships(selectedId, relationType);
    toast.success("Relationships cleared.");
  };

  const nextSibling = selectedSegment
    ? model.segments.find((candidate) =>
        candidate.parentId === selectedSegment.parentId &&
        candidate.siblingIndex === selectedSegment.siblingIndex + 1
      ) ?? null
    : null;
  const previousSibling = selectedSegment
    ? model.segments.find((candidate) =>
        candidate.parentId === selectedSegment.parentId &&
        candidate.siblingIndex === selectedSegment.siblingIndex - 1
      ) ?? null
    : null;
  const boundaryPairs = selectedSegment
    ? [
        previousSibling ? { first: previousSibling, second: selectedSegment, key: `start-${selectedSegment.id}` } : null,
        nextSibling ? { first: selectedSegment, second: nextSibling, key: `end-${selectedSegment.id}` } : null,
      ].filter((pair): pair is { first: SunburstSegment; second: SunburstSegment; key: string } => !!pair)
    : [];

  const beginBoundaryDrag = (event: ReactPointerEvent<SVGElement>) => {
    const boundaryFirstId = event.currentTarget.dataset.boundaryFirstId;
    const boundarySecondId = event.currentTarget.dataset.boundarySecondId;
    const boundaryFirst = model.segments.find((segment) => segment.id === boundaryFirstId);
    const boundarySecond = model.segments.find((segment) => segment.id === boundarySecondId);
    if (!boundaryFirst || !boundarySecond) return;
    event.preventDefault();
    event.stopPropagation();
    pushHistory();
    const selectedData = (model.byId.get(boundaryFirst.id)?.data ?? {}) as Record<string, unknown>;
    const nextData = (model.byId.get(boundarySecond.id)?.data ?? {}) as Record<string, unknown>;
    boundaryDragRef.current = {
      pointerId: event.pointerId,
      nodeId: boundaryFirst.id,
      nextId: boundarySecond.id,
      startAngle: boundaryFirst.startAngle,
      currentAngle: boundaryFirst.endAngle,
      endAngle: boundarySecond.endAngle,
      nodeWeight: clamp(dimension(selectedData.radialWeight, 1), 0.1, 10),
      nextWeight: clamp(dimension(nextData.radialWeight, 1), 0.1, 10),
    };
    svgRef.current?.setPointerCapture(event.pointerId);
  };

  const beginCenterDrag = (event: ReactPointerEvent<SVGElement>) => {
    event.preventDefault();
    event.stopPropagation();
    pushHistory();
    centerDragRef.current = { pointerId: event.pointerId, rootId: d.rootId };
    svgRef.current?.setPointerCapture(event.pointerId);
  };

  const beginLabelRotationDrag = (event: ReactPointerEvent<SVGElement>) => {
    if (!selectedId || !selectedGeometry) return;
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return;
    event.preventDefault();
    event.stopPropagation();
    finishEditing();
    pushHistory();
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    const sourceData = (model.byId.get(selectedId)?.data ?? {}) as Record<string, unknown>;
    labelRotationDragRef.current = {
      pointerId: event.pointerId,
      nodeId: selectedId,
      centerX: selectedGeometry.x,
      centerY: selectedGeometry.y,
      startPointerAngle: (Math.atan2(point.y - selectedGeometry.y, point.x - selectedGeometry.x) * 180) / Math.PI,
      startRotation: normalizeRadialLabelRotation(sourceData.radialTextRotation),
    };
    svg.setPointerCapture(event.pointerId);
  };

  const moveDirectManipulation = (event: ReactPointerEvent<SVGSVGElement>) => {
    const centerDrag = centerDragRef.current;
    const drag = boundaryDragRef.current;
    const labelRotationDrag = labelRotationDragRef.current;
    const svg = svgRef.current;
    if (!svg) return;
    if (
      (!drag || drag.pointerId !== event.pointerId)
      && (!centerDrag || centerDrag.pointerId !== event.pointerId)
      && (!labelRotationDrag || labelRotationDrag.pointerId !== event.pointerId)
    ) return;
    event.preventDefault();
    event.stopPropagation();
    const matrix = svg.getScreenCTM();
    if (!matrix) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    const x = point.x;
    const y = point.y;
    if (labelRotationDrag && labelRotationDrag.pointerId === event.pointerId) {
      const rawAngle = (Math.atan2(y - labelRotationDrag.centerY, x - labelRotationDrag.centerX) * 180) / Math.PI;
      const pointerAngle = unwrapAngle(rawAngle, labelRotationDrag.startPointerAngle);
      const rotation = normalizeRadialLabelRotation(
        labelRotationDrag.startRotation + pointerAngle - labelRotationDrag.startPointerAngle
      );
      useCanvasStore.setState((state) => ({
        nodes: state.nodes.map((node) => node.id === labelRotationDrag.nodeId
          ? { ...node, data: { ...(node.data ?? {}), radialTextRotation: rotation } }
          : node),
      }));
      return;
    }
    if (centerDrag && centerDrag.pointerId === event.pointerId) {
      const radius = Math.hypot(x - model.center, y - model.center);
      const ratio = clamp((radius / Math.max(1, model.outerRadius)) * 100, MIN_CENTER_RATIO, MAX_CENTER_RATIO);
      useCanvasStore.setState((state) => ({
        nodes: state.nodes.map((node) => node.id === centerDrag.rootId
          ? { ...node, data: { ...(node.data ?? {}), radialCenterRatio: ratio } }
          : node),
      }));
      return;
    }
    if (!drag) return;
    const rawAngle = (Math.atan2(y - model.center, x - model.center) * 180) / Math.PI;
    const angle = unwrapAngle(rawAngle, drag.currentAngle);
    const pairSpan = drag.endAngle - drag.startAngle;
    const minSpan = Math.min(Math.max(MIN_SECTOR_ANGLE, pairSpan * 0.05), pairSpan * 0.42);
    const nextAngle = clamp(angle, drag.startAngle + minSpan, drag.endAngle - minSpan);
    const oldFirstSpan = Math.max(MIN_SECTOR_ANGLE, drag.currentAngle - drag.startAngle);
    const oldSecondSpan = Math.max(MIN_SECTOR_ANGLE, drag.endAngle - drag.currentAngle);
    const firstWeight = clamp(drag.nodeWeight * ((nextAngle - drag.startAngle) / oldFirstSpan), 0.1, 10);
    const secondWeight = clamp(drag.nextWeight * ((drag.endAngle - nextAngle) / oldSecondSpan), 0.1, 10);
    useCanvasStore.setState((state) => ({
      nodes: state.nodes.map((node) => {
        if (node.id === drag.nodeId) return { ...node, data: { ...(node.data ?? {}), radialWeight: firstWeight } };
        if (node.id === drag.nextId) return { ...node, data: { ...(node.data ?? {}), radialWeight: secondWeight } };
        return node;
      }),
    }));
  };

  const endDirectManipulation = (event: ReactPointerEvent<SVGSVGElement>) => {
    const centerDrag = centerDragRef.current;
    const drag = boundaryDragRef.current;
    const labelRotationDrag = labelRotationDragRef.current;
    const activePointerId = labelRotationDrag?.pointerId ?? drag?.pointerId ?? centerDrag?.pointerId;
    if (activePointerId !== event.pointerId) return;
    if (labelRotationDrag?.pointerId === event.pointerId) labelRotationDragRef.current = null;
    if (drag?.pointerId === event.pointerId) boundaryDragRef.current = null;
    if (centerDrag?.pointerId === event.pointerId) {
      centerDragRef.current = null;
      const root = useCanvasStore.getState().nodes.find((node) => node.id === centerDrag.rootId);
      const ratio = dimension((root?.data as Record<string, unknown> | undefined)?.radialCenterRatio, 28);
      updateNodeData(centerDrag.rootId, { radialCenterRatio: ratio });
    }
    try { svgRef.current?.releasePointerCapture(event.pointerId); } catch {}
    useCanvasStore.getState().setSaveStatus("unsaved");
  };

  const controlAngle = selectedSegment
    ? (selectedSegment.startAngle + selectedSegment.endAngle) / 2
    : -90;
  const controlRadius = model.outerRadius + 76;
  const controlGeometry = selectedId
    ? pointOnCircle(model.center, model.center, controlRadius, controlAngle)
    : null;
  const controlsVertical = Math.abs(Math.cos((controlAngle * Math.PI) / 180)) > 0.62;
  const rootRelationshipCount = relationshipTargetsBySource.get(d.rootId)?.size ?? 0;
  const rootRelationshipMarkerPoint = pointOnCircle(
    model.center,
    model.center,
    Math.max(12, model.centerRadius - 15),
    -45
  );
  const labelRotationStemStart = selectedGeometry
    ? pointOnCircle(
        selectedGeometry.x,
        selectedGeometry.y,
        selectedGeometry.height / 2 + 4,
        selectedGeometry.rotation - 90
      )
    : null;
  const labelRotationHandlePoint = selectedGeometry
    ? pointOnCircle(
        selectedGeometry.x,
        selectedGeometry.y,
        selectedGeometry.height / 2 + 30,
        selectedGeometry.rotation - 90
      )
    : null;

  return (
    <div className="relative h-full w-full">
      <SunburstBoundsSynchronizer
        nodeId={id}
        chartSize={model.size}
        bounds={{ minX: 0, minY: 0, width: model.size, height: model.size }}
      />
      <svg
        ref={svgRef}
        viewBox={`0 0 ${model.size} ${model.size}`}
        width={model.size}
        height={model.size}
        className="absolute overflow-visible"
        style={{
          left: 0,
          top: 0,
          transform: objectRotation ? `rotate(${objectRotation}deg)` : undefined,
          transformOrigin: "center",
        }}
        data-sunburst-export="true"
        role="img"
        aria-label={`Sunburst chart for ${rootLabel}`}
        onPointerMove={moveDirectManipulation}
        onPointerUp={endDirectManipulation}
        onPointerCancel={endDirectManipulation}
      >
        <defs>
          <clipPath id={rootClipId}>
            <circle cx={model.center} cy={model.center} r={model.centerRadius} />
          </clipPath>
        </defs>

        <circle
          cx={model.center}
          cy={model.center}
          r={model.outerRadius + 11}
          fill="transparent"
          stroke="transparent"
          strokeWidth="22"
          pointerEvents="stroke"
          className={d.locked === true ? "cursor-default" : "cursor-move"}
          data-export-ignore
          aria-label="Select and drag the radial chart"
        >
          <title>Select and drag the radial chart from its perimeter</title>
        </circle>

        <rect
          x="0"
          y="0"
          width={model.size}
          height={model.size}
          fill="none"
          stroke="none"
          pointerEvents="none"
          data-export-bounds
        />
        {chartActive && !activeRelationshipSession && (
          <circle
            cx={model.center}
            cy={model.center}
            r={model.outerRadius + 5}
            fill="none"
            stroke="#2563eb"
            strokeWidth="3"
            strokeDasharray="9 6"
            pointerEvents="none"
            data-export-ignore
          />
        )}
        {model.segments.map((segment) => {
          const selected = selectedSectorIds.has(segment.id);
          const hovered = hoveredId === segment.id;
          const relationshipSource = activeRelationshipSession?.sourceNodeId === segment.id;
          const validRelationshipTarget = validRelationshipTargetIds.has(segment.id);
          const selectedRelationshipTarget = draftRelationshipTargetIds.has(segment.id);
          const dimForRelationshipMode = !!activeRelationshipSession
            && !relationshipSource
            && !validRelationshipTarget;
          const segmentPath = arcSegmentPath(
            model.center,
            model.center,
            segment.innerRadius,
            segment.outerRadius,
            segment.startAngle,
            segment.endAngle
          );
          const segmentClipId = `${clipPrefix}-${segment.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
          const segmentGradientId = `${segmentClipId}-gradient`;
          const gradientStart = pointOnCircle(
            model.center,
            model.center,
            segment.innerRadius,
            (segment.startAngle + segment.endAngle) / 2
          );
          const gradientEnd = pointOnCircle(
            model.center,
            model.center,
            segment.outerRadius,
            (segment.startAngle + segment.endAngle) / 2
          );
          const labelGeometry = labelGeometryForSegment(segment);
          const relationshipMarkerPoint = pointOnCircle(
            model.center,
            model.center,
            segment.outerRadius - Math.min(15, (segment.outerRadius - segment.innerRadius) * 0.32),
            (segment.startAngle + segment.endAngle) / 2
          );
          const relationshipCount = relationshipTargetsBySource.get(segment.id)?.size ?? 0;

          return (
            <g key={segment.id}>
              <defs>
                <clipPath id={segmentClipId}>
                  <path d={segmentPath} />
                </clipPath>
                <linearGradient
                  id={segmentGradientId}
                  gradientUnits="userSpaceOnUse"
                  x1={gradientStart.x}
                  y1={gradientStart.y}
                  x2={gradientEnd.x}
                  y2={gradientEnd.y}
                >
                  <stop offset="0%" stopColor={segment.fill} />
                  <stop offset="100%" stopColor={segment.fillEnd} />
                </linearGradient>
              </defs>
              <path
                d={segmentPath}
                fill={`url(#${segmentGradientId})`}
                stroke={segment.borderColor}
                strokeWidth={segment.borderWidth}
                strokeDasharray={dashArray(segment.borderStyle)}
                className={activeRelationshipSession
                  ? validRelationshipTarget ? "cursor-pointer" : "cursor-not-allowed"
                  : "cursor-text"}
                onPointerDown={(event) => event.stopPropagation()}
                onMouseEnter={() => {
                  if (!activeRelationshipSession) setHoveredId(segment.id);
                }}
                onMouseLeave={() => {
                  if (!activeRelationshipSession) setHoveredId(null);
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  if (activeRelationshipSession) {
                    if (validRelationshipTarget) toggleRelationshipTarget(segment.id);
                    return;
                  }
                  const additive = event.shiftKey || event.ctrlKey || event.metaKey;
                  if (additive) {
                    finishEditing();
                    selectOriginalNode(segment.id, true);
                    return;
                  }
                  selectOriginalNode(segment.id);
                  setEditingId(segment.id);
                }}
              >
                <title>{segment.label}</title>
              </path>
              {!!rootData.radialDebugLabelBoxes && (
                <rect
                  x={labelGeometry.x - labelGeometry.width / 2}
                  y={labelGeometry.y - labelGeometry.height / 2}
                  width={labelGeometry.width}
                  height={labelGeometry.height}
                  transform={`rotate(${labelGeometry.rotation} ${labelGeometry.x} ${labelGeometry.y})`}
                  fill="rgba(236,72,153,0.08)"
                  stroke="#db2777"
                  strokeWidth="2"
                  strokeDasharray="8 5"
                  pointerEvents="none"
                  data-export-ignore
                />
              )}
              {labelGeometry.lines.length > 0 && (
                <g
                  clipPath={`url(#${segmentClipId})`}
                  pointerEvents="none"
                  style={{ visibility: selected && editingId === segment.id ? "hidden" : "visible" }}
                  data-export-restore={selected && editingId === segment.id ? "true" : undefined}
                >
                  <foreignObject
                    x={labelGeometry.x - labelGeometry.width / 2}
                    y={labelGeometry.y - labelGeometry.height / 2}
                    width={labelGeometry.width}
                    height={labelGeometry.height}
                    transform={`rotate(${labelGeometry.rotation} ${labelGeometry.x} ${labelGeometry.y})`}
                    overflow="visible"
                  >
                    <div
                      lang={isDevanagariText(segment.label) ? "sa" : undefined}
                      className="sunburst-rich-label"
                      style={{
                        width: "100%",
                        height: "100%",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        overflow: "visible",
                        boxSizing: "border-box",
                        padding: isDevanagariText(segment.label) ? "0.08em 0.08em 0.1em" : undefined,
                        color: segment.textColor,
                        fontSize: labelGeometry.fontSize,
                        lineHeight: isDevanagariText(segment.label) ? DEVANAGARI_LINE_HEIGHT : 1.12,
                        fontFamily: labelFontFamily(segment.label, segment.fontFamily),
                        fontWeight: labelFontWeight(segment.label, segment.fontWeight),
                        fontStyle: segment.fontStyle,
                        textAlign: segment.textAlign,
                        textShadow: "0 1px 1px rgba(255,255,255,0.28)",
                      }}
                      dangerouslySetInnerHTML={{ __html: segment.richText }}
                    />
                  </foreignObject>
                </g>
              )}
              {!activeRelationshipSession && (selected || hovered) && (
                <path
                  d={segmentPath}
                  fill="none"
                  stroke={selected ? "#2563eb" : "#0f172a"}
                  strokeWidth={selected ? Math.max(3, segment.borderWidth) : Math.max(2, segment.borderWidth)}
                  pointerEvents="none"
                  data-export-ignore
                />
              )}
              {dimForRelationshipMode && (
                <path
                  d={segmentPath}
                  fill="#f8fafc"
                  fillOpacity="0.72"
                  stroke="none"
                  pointerEvents="none"
                  data-export-ignore
                />
              )}
              {activeRelationshipSession && (relationshipSource || validRelationshipTarget) && (
                <path
                  d={segmentPath}
                  fill={selectedRelationshipTarget ? "rgba(16,185,129,0.18)" : "none"}
                  stroke={relationshipSource ? "#2563eb" : selectedRelationshipTarget ? "#059669" : "#0ea5e9"}
                  strokeWidth={relationshipSource ? 5 : selectedRelationshipTarget ? 4 : 2.5}
                  strokeDasharray={relationshipSource || selectedRelationshipTarget ? undefined : "7 5"}
                  pointerEvents="none"
                  data-export-ignore
                />
              )}
              {activeRelationshipSession && selectedRelationshipTarget && (
                <g pointerEvents="none" data-export-ignore>
                  <circle
                    cx={relationshipMarkerPoint.x}
                    cy={relationshipMarkerPoint.y}
                    r="11"
                    fill="#059669"
                    stroke="#ffffff"
                    strokeWidth="2.5"
                  />
                  <path
                    d={`M ${relationshipMarkerPoint.x - 5} ${relationshipMarkerPoint.y} l 3.5 3.5 7 -8`}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
              )}
              {!activeRelationshipSession && relationshipCount > 0 && (
                <g pointerEvents="none" role="img" aria-label={`${relationshipCount} relationships`}>
                  <circle
                    cx={relationshipMarkerPoint.x}
                    cy={relationshipMarkerPoint.y}
                    r="9"
                    fill="rgba(255,255,255,0.9)"
                    stroke={segment.borderColor}
                    strokeWidth="1.5"
                  />
                  <text
                    x={relationshipMarkerPoint.x}
                    y={relationshipMarkerPoint.y + 0.5}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="#0f172a"
                    fontSize="9"
                    fontWeight="700"
                  >
                    {relationshipCount}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        <circle
          cx={model.center}
          cy={model.center}
          r={model.centerRadius}
          fill={d.fillColor ?? (rootData.radialFillColor as string | undefined) ?? model.scheme.rootFill}
          stroke={d.borderColor ?? (rootData.radialBorderColor as string | undefined) ?? model.scheme.rootBorder}
          strokeWidth={dimension(d.borderWidth ?? rootData.radialBorderWidth, 4)}
          strokeDasharray={dashArray((rootData.radialBorderStyle as SunburstSegment["borderStyle"] | undefined) ?? "solid")}
          className={activeRelationshipSession
            ? validRelationshipTargetIds.has(d.rootId) ? "cursor-pointer" : "cursor-not-allowed"
            : "cursor-text"}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            if (activeRelationshipSession) {
              if (validRelationshipTargetIds.has(d.rootId)) toggleRelationshipTarget(d.rootId);
              return;
            }
            const additive = event.shiftKey || event.ctrlKey || event.metaKey;
            if (additive) {
              finishEditing();
              selectOriginalNode(d.rootId, true);
              return;
            }
            selectOriginalNode(d.rootId);
            setEditingId(d.rootId);
          }}
        >
          <title>{rootLabel}</title>
        </circle>
        {!!rootData.radialDebugLabelBoxes && (
          <rect
            x={rootFit.x - rootFit.width / 2}
            y={rootFit.y - rootFit.height / 2}
            width={rootFit.width}
            height={rootFit.height}
            transform={`rotate(${rootFit.rotation} ${rootFit.x} ${rootFit.y})`}
            fill="rgba(236,72,153,0.08)"
            stroke="#db2777"
            strokeWidth="2"
            strokeDasharray="8 5"
            pointerEvents="none"
            data-export-ignore
          />
        )}
        {rootFit.lines.length > 0 && (
          <foreignObject
            x={rootFit.x - rootFit.width / 2}
            y={rootFit.y - rootFit.height / 2}
            width={rootFit.width}
            height={rootFit.height}
            transform={`rotate(${rootFit.rotation} ${rootFit.x} ${rootFit.y})`}
            clipPath={`url(#${rootClipId})`}
            pointerEvents="none"
            overflow="visible"
            style={{ visibility: selectedId === d.rootId && editingId === d.rootId ? "hidden" : "visible" }}
            data-export-restore={selectedId === d.rootId && editingId === d.rootId ? "true" : undefined}
          >
            <div
              lang={isDevanagariText(rootLabel) ? "sa" : undefined}
              className="sunburst-rich-label"
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                overflow: "visible",
                boxSizing: "border-box",
                padding: isDevanagariText(rootLabel) ? "0.08em 0.08em 0.1em" : undefined,
                color: d.textColor ?? (rootData.radialTextColor as string | undefined) ?? (rootData.textColor as string | undefined) ?? model.scheme.rootText,
                fontSize: rootFit.fontSize,
                lineHeight: isDevanagariText(rootLabel) ? DEVANAGARI_LINE_HEIGHT : 1.12,
                fontFamily: labelFontFamily(rootLabel, d.fontFamily ?? rootData.fontFamily as string | undefined),
                fontWeight: labelFontWeight(rootLabel, d.fontWeight === "bold" || rootData.fontWeight === "bold" ? 700 : d.fontWeight === "normal" || rootData.fontWeight === "normal" ? 400 : 800),
                fontStyle: d.fontStyle === "italic" || rootData.fontStyle === "italic" ? "italic" : "normal",
                textAlign: (rootData.textAlign as CSSProperties["textAlign"] | undefined) ?? "center",
              }}
              dangerouslySetInnerHTML={{ __html: rootRichText }}
            />
          </foreignObject>
        )}
        {!activeRelationshipSession && rootRelationshipCount > 0 && (
          <g pointerEvents="none" role="img" aria-label={`${rootRelationshipCount} relationships`}>
            <circle
              cx={rootRelationshipMarkerPoint.x}
              cy={rootRelationshipMarkerPoint.y}
              r="10"
              fill="rgba(255,255,255,0.92)"
              stroke={(rootData.radialBorderColor as string | undefined) ?? model.scheme.rootBorder}
              strokeWidth="1.5"
            />
            <text
              x={rootRelationshipMarkerPoint.x}
              y={rootRelationshipMarkerPoint.y + 0.5}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#0f172a"
              fontSize="9"
              fontWeight="700"
            >
              {rootRelationshipCount}
            </text>
          </g>
        )}

        {!activeRelationshipSession && selectedSectorIds.has(d.rootId) && (
          <circle
            cx={model.center}
            cy={model.center}
            r={model.centerRadius}
            fill="none"
            stroke="#2563eb"
            strokeWidth={Math.max(4, dimension(rootData.radialBorderWidth, 4))}
            pointerEvents="none"
            data-export-ignore
          />
        )}
        {activeRelationshipSession
          && activeRelationshipSession.sourceNodeId !== d.rootId
          && !validRelationshipTargetIds.has(d.rootId) && (
          <circle
            cx={model.center}
            cy={model.center}
            r={model.centerRadius}
            fill="#f8fafc"
            fillOpacity="0.72"
            stroke="none"
            pointerEvents="none"
            data-export-ignore
          />
        )}
        {activeRelationshipSession
          && (activeRelationshipSession.sourceNodeId === d.rootId || validRelationshipTargetIds.has(d.rootId)) && (
          <circle
            cx={model.center}
            cy={model.center}
            r={model.centerRadius}
            fill={draftRelationshipTargetIds.has(d.rootId) ? "rgba(16,185,129,0.18)" : "none"}
            stroke={activeRelationshipSession.sourceNodeId === d.rootId
              ? "#2563eb"
              : draftRelationshipTargetIds.has(d.rootId) ? "#059669" : "#0ea5e9"}
            strokeWidth={activeRelationshipSession.sourceNodeId === d.rootId ? 5 : 3}
            strokeDasharray={activeRelationshipSession.sourceNodeId === d.rootId || draftRelationshipTargetIds.has(d.rootId)
              ? undefined
              : "7 5"}
            pointerEvents="none"
            data-export-ignore
          />
        )}

        {!activeRelationshipSession && selectedId && editingId === selectedId && selectedNode && selectedGeometry && selectedTextStyle && selectedClipId && (
          <foreignObject
            x={selectedGeometry.x - selectedGeometry.width / 2}
            y={selectedGeometry.y - selectedGeometry.height / 2}
            width={selectedGeometry.width}
            height={selectedGeometry.height}
            transform={`rotate(${selectedGeometry.rotation} ${selectedGeometry.x} ${selectedGeometry.y})`}
            className="sunburst-inline-editor nodrag nopan overflow-visible"
            overflow="visible"
            style={{ pointerEvents: "all", overflow: "visible" }}
            data-export-ignore
          >
            <div
              lang={isDevanagariText(selectedLabel) ? "sa" : undefined}
              className="sunburst-editor-label"
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "visible",
                boxSizing: "border-box",
                padding: isDevanagariText(selectedLabel) ? "0.08em 0.08em 0.1em" : undefined,
                color: selectedTextStyle.color,
                fontSize: selectedGeometry.fontSize,
                lineHeight: isDevanagariText(selectedLabel) ? DEVANAGARI_LINE_HEIGHT : 1.12,
                fontFamily: labelFontFamily(selectedLabel, selectedTextStyle.fontFamily),
                fontWeight: labelFontWeight(selectedLabel, selectedTextStyle.fontWeight),
                fontStyle: selectedTextStyle.fontStyle,
                textAlign: selectedTextStyle.textAlign,
              }}
            >
              <RichTextEditor
                key={selectedId}
                nodeId={selectedId}
                initialContent={selectedRichText}
                editable
                placeholder="Type here"
                className="h-full w-full [&_.ProseMirror]:flex [&_.ProseMirror]:h-full [&_.ProseMirror]:w-full [&_.ProseMirror]:flex-col [&_.ProseMirror]:items-center [&_.ProseMirror]:justify-center [&_.ProseMirror]:overflow-visible"
                blockAlign={(selectedNode.data as Record<string, unknown>).textAlign as "left" | "center" | "right" | "justify" | undefined}
                onChange={(html) => updateText(selectedId, html)}
                onBlur={finishEditing}
              />
            </div>
          </foreignObject>
        )}

        {!activeRelationshipSession
          && selectedId
          && selectedGeometry
          && labelRotationStemStart
          && labelRotationHandlePoint && (
          <g data-export-ignore>
            <line
              x1={labelRotationStemStart.x}
              y1={labelRotationStemStart.y}
              x2={labelRotationHandlePoint.x}
              y2={labelRotationHandlePoint.y}
              stroke="#2563eb"
              strokeWidth="2.5"
              pointerEvents="none"
            />
            <circle
              cx={labelRotationHandlePoint.x}
              cy={labelRotationHandlePoint.y}
              r="9"
              fill="#ffffff"
              stroke="#2563eb"
              strokeWidth="3"
              className="cursor-grab"
              aria-label="Rotate radial label"
              onPointerDown={beginLabelRotationDrag}
            >
              <title>Drag to rotate this label</title>
            </circle>
            <path
              d={`M ${labelRotationHandlePoint.x - 4.5} ${labelRotationHandlePoint.y + 0.5} A 4.5 4.5 0 1 1 ${labelRotationHandlePoint.x + 2.5} ${labelRotationHandlePoint.y + 3.5}`}
              fill="none"
              stroke="#2563eb"
              strokeWidth="1.6"
              strokeLinecap="round"
              pointerEvents="none"
            />
          </g>
        )}

        {!activeRelationshipSession && boundaryPairs.map(({ first, second, key }) => {
          const boundaryAngle = first.endAngle;
          const innerRadius = Math.min(first.innerRadius, second.innerRadius);
          const outerRadius = Math.max(first.outerRadius, second.outerRadius);
          const handleRadius = (innerRadius + outerRadius) / 2;
          return (
            <g key={key} data-export-ignore>
              <line
                data-boundary-first-id={first.id}
                data-boundary-second-id={second.id}
                x1={pointOnCircle(model.center, model.center, innerRadius, boundaryAngle).x}
                y1={pointOnCircle(model.center, model.center, innerRadius, boundaryAngle).y}
                x2={pointOnCircle(model.center, model.center, outerRadius, boundaryAngle).x}
                y2={pointOnCircle(model.center, model.center, outerRadius, boundaryAngle).y}
                stroke="transparent"
                strokeWidth="20"
                className="cursor-grab"
                onPointerDown={beginBoundaryDrag}
              />
              <line
                x1={pointOnCircle(model.center, model.center, innerRadius, boundaryAngle).x}
                y1={pointOnCircle(model.center, model.center, innerRadius, boundaryAngle).y}
                x2={pointOnCircle(model.center, model.center, outerRadius, boundaryAngle).x}
                y2={pointOnCircle(model.center, model.center, outerRadius, boundaryAngle).y}
                stroke="#2563eb"
                strokeWidth="2.5"
                pointerEvents="none"
              />
              <circle
                data-boundary-first-id={first.id}
                data-boundary-second-id={second.id}
                cx={pointOnCircle(model.center, model.center, handleRadius, boundaryAngle).x}
                cy={pointOnCircle(model.center, model.center, handleRadius, boundaryAngle).y}
                r="7"
                fill="#ffffff"
                stroke="#2563eb"
                strokeWidth="3"
                className="cursor-grab"
                onPointerDown={beginBoundaryDrag}
              >
                <title>Drag to resize adjacent sectors</title>
              </circle>
            </g>
          );
        })}

        {!activeRelationshipSession && selectedId === d.rootId && model.tree.children.length > 0 && (
          <g data-export-ignore>
            <circle
              cx={model.center}
              cy={model.center}
              r={model.centerRadius}
              fill="none"
              stroke="#2563eb"
              strokeWidth="2.5"
              pointerEvents="none"
            />
            <circle
              cx={model.center + model.centerRadius}
              cy={model.center}
              r="8"
              fill="#ffffff"
              stroke="#2563eb"
              strokeWidth="3"
              className="cursor-ew-resize"
              onPointerDown={beginCenterDrag}
            >
              <title>Drag to resize the center</title>
            </circle>
          </g>
        )}
      </svg>

      {!activeRelationshipSession && selectedId && controlGeometry && (
        <div
          className={`nodrag nopan absolute z-30 flex gap-1 ${controlsVertical ? "flex-col" : "flex-row"}`}
          style={{
            left: controlGeometry.x,
            top: controlGeometry.y,
            transform: "translate(-50%, -50%)",
          }}
          onPointerDown={(event) => event.stopPropagation()}
          data-export-ignore
        >
          {selectedRelationshipPolicy?.ok && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  title="Relationships"
                  aria-label="Relationships"
                  className="flex h-7 items-center justify-center gap-1 rounded-full border-2 border-white bg-emerald-600 px-2.5 text-[11px] font-semibold text-white shadow-lg transition-transform hover:scale-105"
                  onClick={(event) => event.stopPropagation()}
                >
                  <Link2 className="h-3.5 w-3.5" />
                  Relationships
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-64">
                <DropdownMenuItem onSelect={() => beginRelationshipSelection(primaryRelationshipType)}>
                  <Link2 className="h-4 w-4" />
                  {selectedRelationships.length ? "Edit relationships" : "Add relationships"}
                </DropdownMenuItem>
                {hasRelationshipsForSelectedSource && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => openRelationshipDiagram({
                        mode: "create",
                        chartRootNodeId: d.rootId,
                        sourceNodeIds: [selectedId],
                      })}
                    >
                      <Rows3 className="h-4 w-4" />
                      Generate relationship diagram
                    </DropdownMenuItem>
                  </>
                )}
                {selectedRelationships.length > 0 && (
                  <>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={() => confirmClearRelationships(primaryRelationshipType)}
                    >
                      <Trash2 className="h-4 w-4" />
                      Clear relationships
                    </DropdownMenuItem>
                  </>
                )}
                {legacySelectedRelationshipTypes.map((relationType) => {
                  const groupRelationships = relationships.filter((relationship) =>
                    relationship.sourceNodeId === selectedId
                    && relationship.relationType === relationType
                    && model.chartNodeIds.has(relationship.targetNodeId)
                  );
                  const relationshipLabel = relationshipDefinition(relationType)?.label ?? relationType;
                  return (
                    <Fragment key={relationType}>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => beginRelationshipSelection(relationType)}>
                        <Link2 className="h-4 w-4" />
                        Edit {relationshipLabel} relationships
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={() => confirmClearRelationships(relationType)}
                      >
                        <Trash2 className="h-4 w-4" />
                        Clear {groupRelationships.length === 1 ? "relationship" : "relationships"}
                      </DropdownMenuItem>
                    </Fragment>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <button
            type="button"
            title="Add child sector"
            aria-label="Add child sector"
            className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-110"
            onClick={(event) => {
              event.stopPropagation();
              finishEditing();
              createChildNode(selectedId);
            }}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          {selectedSegment?.parentId && (
            <>
              <button
                type="button"
                title="Add sibling sector"
                aria-label="Add sibling sector"
                className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-slate-700 text-white shadow-lg transition-transform hover:scale-110"
                onClick={(event) => {
                  event.stopPropagation();
                  finishEditing();
                  createSiblingNode(selectedSegment.id);
                }}
              >
                <Rows3 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title="Move sibling backward"
                aria-label="Move sibling backward"
                disabled={!previousSibling}
                className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-background text-foreground shadow-lg transition-transform hover:scale-110 disabled:cursor-not-allowed disabled:opacity-40"
                onClick={(event) => {
                  event.stopPropagation();
                  finishEditing();
                  moveSiblingNode(selectedSegment.id, -1);
                }}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title="Move sibling forward"
                aria-label="Move sibling forward"
                disabled={!nextSibling}
                className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-background text-foreground shadow-lg transition-transform hover:scale-110 disabled:cursor-not-allowed disabled:opacity-40"
                onClick={(event) => {
                  event.stopPropagation();
                  finishEditing();
                  moveSiblingNode(selectedSegment.id, 1);
                }}
              >
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      )}
      {chartActive && d.locked !== true && !activeRelationshipSession && (
        <div
          className="absolute -left-3 -top-3 z-[70] flex h-8 w-8 cursor-grab items-center justify-center rounded-full border-2 border-white bg-primary text-primary-foreground shadow-lg active:cursor-grabbing"
          title="Drag to move radial chart"
          aria-label="Drag to move radial chart"
          data-export-ignore
        >
          <Move className="h-4 w-4" />
        </div>
      )}
      <NodeResizer
        nodeId={id}
        minWidth={SUNBURST_MIN_SIZE}
        minHeight={SUNBURST_MIN_SIZE}
        maxWidth={CHART_NODE_MAX_SIZE}
        maxHeight={CHART_NODE_MAX_SIZE}
        keepAspectRatio
        isVisible={chartActive && d.locked !== true && !activeRelationshipSession}
        onResizeStart={() => pushHistory()}
        onResize={(_, params) => previewChartResize(params)}
        onResizeEnd={(_, params) => finishManualNodeResize(id, params)}
      />
    </div>
  );
}

export const SunburstNode = memo(SunburstNodeComponent);
