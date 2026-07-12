"use client";

import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import type { Node, NodeProps } from "@xyflow/react";
import { Plus } from "lucide-react";
import type { SunburstNodeData } from "@/lib/types";
import { buildHierarchy, type Hierarchy } from "@/lib/layout/hierarchy";
import {
  radialColorScheme,
  radialSectorColors,
  type RadialColorSchemeDefinition,
} from "@/lib/radial-layout";
import { useCanvasStore } from "@/store/canvas-store";
import { RichTextEditor } from "../RichTextEditor";

type PolarPoint = { x: number; y: number };

type SunburstTreeNode = {
  id: string;
  parentId: string | null;
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
  textColor: string;
  borderColor: string;
  borderWidth: number;
  borderStyle: "solid" | "dashed" | "dotted";
  fontFamily?: string;
  fontWeight: CSSProperties["fontWeight"];
  fontStyle: CSSProperties["fontStyle"];
  textAlign: CSSProperties["textAlign"];
  preferredFontSize?: number;
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
  useBrowserMetrics: boolean
): LabelFit {
  const width = Math.max(0.5, availableWidth);
  const height = Math.max(0.5, availableHeight);
  if (!label.trim()) return { lines: [], fontSize: preferredFontSize, width, height };

  const maxFont = Math.max(3, preferredFontSize);
  const minimumReadableFont = 4;
  const unwrapped = explicitLabelLines(label);
  const unwrappedMetrics = textMetrics(unwrapped, maxFont, label, style, useBrowserMetrics);
  if (unwrappedMetrics.width <= width && unwrappedMetrics.height <= height) {
    return { lines: unwrapped, fontSize: maxFont, width, height };
  }

  const preferredWrapped = wrapLabelToWidth(label, width, maxFont, style, useBrowserMetrics);
  const preferredWrappedMetrics = textMetrics(preferredWrapped, maxFont, label, style, useBrowserMetrics);
  if (preferredWrappedMetrics.width <= width && preferredWrappedMetrics.height <= height) {
    return { lines: preferredWrapped, fontSize: maxFont, width, height };
  }

  for (let fontSize = maxFont; fontSize >= minimumReadableFont; fontSize -= Math.max(0.25, fontSize * 0.06)) {
    const smallerUnwrapped = textMetrics(unwrapped, fontSize, label, style, useBrowserMetrics);
    if (smallerUnwrapped.width <= width && smallerUnwrapped.height <= height) {
      return { lines: unwrapped, fontSize, width, height };
    }
    const lines = wrapLabelToWidth(label, width, fontSize, style, useBrowserMetrics);
    const metrics = textMetrics(lines, fontSize, label, style, useBrowserMetrics);
    if (metrics.width <= width && metrics.height <= height) {
      return { lines, fontSize, width, height };
    }
  }

  return { lines: [], fontSize: minimumReadableFont, width, height };
}

function sectorLabelGeometry(segment: SunburstSegment, center: number, useBrowserMetrics: boolean): LabelGeometry {
  const midAngle = (segment.startAngle + segment.endAngle) / 2;
  const textRadius = (segment.innerRadius + segment.outerRadius) / 2;
  const point = pointOnCircle(center, center, textRadius, midAngle);
  const angleSpan = segment.endAngle - segment.startAngle;
  const arcLength = Math.max(0.5, (angleSpan * Math.PI * textRadius) / 180);
  const radialBand = Math.max(0.5, segment.outerRadius - segment.innerRadius);
  const useRadialAxis = radialBand > arcLength;
  const width = useRadialAxis ? radialBand : arcLength;
  const height = useRadialAxis ? arcLength : radialBand;
  const defaultMax = segment.depth <= 1 ? 28 : 20;
  const preferred = clamp(segment.preferredFontSize ?? defaultMax, 4, 96);
  const fit = fitLabel(segment.label, width, height, preferred, {
    fontFamily: segment.fontFamily,
    fontWeight: /<(strong|b)\b/i.test(segment.richText) ? 700 : segment.fontWeight,
    fontStyle: /<(em|i)\b/i.test(segment.richText) ? "italic" : segment.fontStyle,
  }, useBrowserMetrics);
  const baseRotation = useRadialAxis ? midAngle : midAngle + 90;
  const normalized = ((baseRotation % 360) + 360) % 360;
  const rotation = normalized > 90 && normalized < 270 ? baseRotation + 180 : baseRotation;
  return { ...fit, x: point.x, y: point.y, rotation };
}

function circleLabelGeometry(
  label: string,
  radius: number,
  center: number,
  preferredFontSize: number | undefined,
  style: LabelTextStyle,
  useBrowserMetrics: boolean
): LabelGeometry {
  const width = Math.max(24, radius * 1.55);
  const height = Math.max(24, radius * 1.5);
  const preferred = clamp(preferredFontSize ?? Math.min(32, radius * 0.34), 5, 96);
  return { ...fitLabel(label, width, height, preferred, style, useBrowserMetrics), x: center, y: center, rotation: 0 };
}

function buildSunburstTree(rootId: string, hierarchy: Hierarchy, byId: Map<string, Node>): SunburstTreeNode {
  const build = (
    id: string,
    parentId: string | null,
    depth: number,
    siblingIndex: number,
    siblingCount: number,
    branchIndex: number
  ): SunburstTreeNode => {
    const childIds = hierarchy.get(id)?.childIds ?? [];
    const children = childIds.map((childId, index) =>
      build(childId, id, depth + 1, index, childIds.length, depth === 0 ? index : branchIndex)
    );
    const data = (byId.get(id)?.data ?? {}) as Record<string, unknown>;
    const manualWeight = clamp(dimension(data.radialWeight, 1), 0.1, 10);
    const automaticWeight = children.length
      ? children.reduce((sum, child) => sum + child.weight, 0)
      : 1;
    return {
      id,
      parentId,
      depth,
      siblingIndex,
      siblingCount,
      branchIndex,
      weight: Math.max(0.01, automaticWeight * manualWeight),
      startAngle: ROOT_START_ANGLE,
      endAngle: ROOT_END_ANGLE,
      innerRadius: 0,
      outerRadius: 0,
      children,
    };
  };
  return build(rootId, null, 0, 0, 1, 0);
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
    clamp(dimension(source[index], 1), 0.25, 4)
  );
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = centerRadius;
  return weights.map((weight, index) => {
    const width = index === weights.length - 1
      ? outerRadius - cursor
      : (outerRadius - centerRadius) * (weight / Math.max(0.01, total));
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
  scheme: RadialColorSchemeDefinition
): SunburstSegment[] {
  const segments: SunburstSegment[] = [];
  const walk = (candidate: SunburstTreeNode) => {
    if (candidate.depth > 0) {
      const source = byId.get(candidate.id);
      const data = (source?.data ?? {}) as Record<string, unknown>;
      const label = nodeLabel(source);
      const paletteColors = radialSectorColors(
        scheme,
        candidate.branchIndex,
        candidate.depth,
        candidate.siblingIndex,
        candidate.siblingCount
      );
      segments.push({
        ...candidate,
        label,
        richText: nodeRichText(source, label),
        fill: (data.radialFillColor as string | undefined) ?? paletteColors.fill,
        textColor: (data.radialTextColor as string | undefined) ?? (data.textColor as string | undefined) ?? paletteColors.text,
        borderColor: (data.radialBorderColor as string | undefined) ?? paletteColors.border,
        borderWidth: clamp(dimension(data.radialBorderWidth, 1.4), 0, 16),
        borderStyle: (data.radialBorderStyle as SunburstSegment["borderStyle"] | undefined) ?? "solid",
        fontFamily: data.fontFamily as string | undefined,
        fontWeight: data.fontWeight === "bold"
          ? 700
          : data.fontWeight === "normal"
            ? 400
            : candidate.depth <= 1 ? 700 : 600,
        fontStyle: data.fontStyle === "italic" ? "italic" : "normal",
        textAlign: (data.textAlign as CSSProperties["textAlign"] | undefined) ?? "center",
        preferredFontSize: typeof data.fontSize === "number" ? data.fontSize : undefined,
      });
    }
    candidate.children.forEach(walk);
  };
  walk(node);
  return segments;
}

function selectOriginalNode(nodeId: string): void {
  useCanvasStore.setState((state) => ({
    nodes: state.nodes.map((node) => ({ ...node, selected: node.id === nodeId })),
    edges: state.edges.map((edge) => ({ ...edge, selected: false })),
    selectedNodeIds: [nodeId],
    selectedEdgeIds: [],
  }));
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

function SunburstNodeComponent({ data }: NodeProps) {
  const d = data as SunburstNodeData;
  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);
  const selectedNodeIds = useCanvasStore((state) => state.selectedNodeIds);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const createChildNode = useCanvasStore((state) => state.createChildNode);
  const pushHistory = useCanvasStore((state) => state.pushHistory);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fontMetricsRevision, setFontMetricsRevision] = useState(0);
  const clipPrefix = `sunburst-clip-${useId().replace(/:/g, "")}`;
  const svgRef = useRef<SVGSVGElement>(null);
  const boundaryDragRef = useRef<BoundaryDrag | null>(null);
  const centerDragRef = useRef<CenterDrag | null>(null);
  const editHistoryCaptured = useRef(false);

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
    const chartNodes = nodes.filter((node) => node.type !== "sunburst" && node.type !== "frame");
    const byId = new Map(chartNodes.map((node) => [node.id, node]));
    const root = byId.get(d.rootId);
    if (!root) return null;

    const hierarchy = buildHierarchy(chartNodes, edges);
    const tree = buildSunburstTree(d.rootId, hierarchy, byId);
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

    return {
      root,
      byId,
      tree,
      size,
      center: size / 2,
      centerRadius,
      outerRadius,
      scheme,
      segments: collectSegments(tree, byId, scheme),
    };
  }, [d.chartSize, d.rootId, edges, nodes]);

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

  const selectedId = selectedNodeIds.length === 1 && model.byId.has(selectedNodeIds[0])
    ? selectedNodeIds[0]
    : null;
  const selectedSegment = selectedId ? model.segments.find((segment) => segment.id === selectedId) ?? null : null;
  const selectedNode = selectedId ? model.byId.get(selectedId) ?? null : null;
  const rootData = (model.root.data ?? {}) as Record<string, unknown>;
  const rootLabel = nodeLabel(model.root);
  const rootRichText = nodeRichText(model.root, rootLabel);
  const rootFit = circleLabelGeometry(
    rootLabel,
    model.centerRadius,
    model.center,
    typeof rootData.fontSize === "number" ? rootData.fontSize : undefined,
    {
      fontFamily: rootData.fontFamily as string | undefined,
      fontWeight: /<(strong|b)\b/i.test(rootRichText)
        ? 700
        : rootData.fontWeight === "bold" ? 700 : rootData.fontWeight === "normal" ? 400 : 800,
      fontStyle: /<(em|i)\b/i.test(rootRichText) || rootData.fontStyle === "italic" ? "italic" : "normal",
    },
    fontMetricsReady
  );
  const rootClipId = `${clipPrefix}-root`;

  const selectedGeometry = selectedId === d.rootId
    ? rootFit
    : selectedSegment
      ? sectorLabelGeometry(selectedSegment, model.center, fontMetricsReady)
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
        color: (rootData.radialTextColor as string | undefined) ?? (rootData.textColor as string | undefined) ?? model.scheme.rootText,
        fontFamily: rootData.fontFamily as string | undefined,
        fontWeight: rootData.fontWeight === "bold" ? 700 : rootData.fontWeight === "normal" ? 400 : 800,
        fontStyle: rootData.fontStyle === "italic" ? "italic" : "normal",
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

  const beginBoundaryDrag = (
    event: ReactPointerEvent<SVGElement>,
    boundaryFirst: SunburstSegment,
    boundarySecond: SunburstSegment
  ) => {
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

  const moveDirectManipulation = (event: ReactPointerEvent<SVGSVGElement>) => {
    const centerDrag = centerDragRef.current;
    const drag = boundaryDragRef.current;
    const svg = svgRef.current;
    if (!svg) return;
    if ((!drag || drag.pointerId !== event.pointerId) && (!centerDrag || centerDrag.pointerId !== event.pointerId)) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = svg.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * model.size;
    const y = ((event.clientY - bounds.top) / Math.max(1, bounds.height)) * model.size;
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
    const activePointerId = drag?.pointerId ?? centerDrag?.pointerId;
    if (activePointerId !== event.pointerId) return;
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

  const plusGeometry = selectedId === d.rootId
    ? pointOnCircle(model.center, model.center, model.centerRadius * 0.72, 0)
    : selectedSegment
      ? pointOnCircle(
          model.center,
          model.center,
          Math.max(selectedSegment.innerRadius + 20, selectedSegment.outerRadius - 20),
          (selectedSegment.startAngle + selectedSegment.endAngle) / 2
        )
      : null;

  return (
    <div className="relative h-full w-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${model.size} ${model.size}`}
        className="h-full w-full overflow-visible"
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

        {model.segments.map((segment) => {
          const selected = selectedId === segment.id;
          const hovered = hoveredId === segment.id;
          const segmentPath = arcSegmentPath(
            model.center,
            model.center,
            segment.innerRadius,
            segment.outerRadius,
            segment.startAngle,
            segment.endAngle
          );
          const segmentClipId = `${clipPrefix}-${segment.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
          const labelGeometry = sectorLabelGeometry(segment, model.center, fontMetricsReady);

          return (
            <g key={segment.id}>
              <defs>
                <clipPath id={segmentClipId}>
                  <path d={segmentPath} />
                </clipPath>
              </defs>
              <path
                d={segmentPath}
                fill={segment.fill}
                stroke={selected ? "#2563eb" : hovered ? "#0f172a" : segment.borderColor}
                strokeWidth={selected ? Math.max(3, segment.borderWidth) : hovered ? Math.max(2, segment.borderWidth) : segment.borderWidth}
                strokeDasharray={selected ? undefined : dashArray(segment.borderStyle)}
                className="cursor-text transition-opacity"
                opacity={hoveredId && !hovered && !selected ? 0.78 : 1}
                onPointerDown={(event) => event.stopPropagation()}
                onMouseEnter={() => setHoveredId(segment.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={(event) => {
                  event.stopPropagation();
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
                />
              )}
              {(!selected || editingId !== segment.id) && labelGeometry.lines.length > 0 && (
                <g clipPath={`url(#${segmentClipId})`} pointerEvents="none">
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
                      }}
                      dangerouslySetInnerHTML={{ __html: segment.richText }}
                    />
                  </foreignObject>
                </g>
              )}
            </g>
          );
        })}

        <circle
          cx={model.center}
          cy={model.center}
          r={model.centerRadius}
          fill={(rootData.radialFillColor as string | undefined) ?? model.scheme.rootFill}
          stroke={selectedId === d.rootId ? "#2563eb" : (rootData.radialBorderColor as string | undefined) ?? model.scheme.rootBorder}
          strokeWidth={selectedId === d.rootId ? Math.max(4, dimension(rootData.radialBorderWidth, 4)) : dimension(rootData.radialBorderWidth, 4)}
          strokeDasharray={selectedId === d.rootId ? undefined : dashArray((rootData.radialBorderStyle as SunburstSegment["borderStyle"] | undefined) ?? "solid")}
          className="cursor-text"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
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
            fill="rgba(236,72,153,0.08)"
            stroke="#db2777"
            strokeWidth="2"
            strokeDasharray="8 5"
            pointerEvents="none"
          />
        )}
        {(selectedId !== d.rootId || editingId !== d.rootId) && rootFit.lines.length > 0 && (
          <foreignObject
            x={rootFit.x - rootFit.width / 2}
            y={rootFit.y - rootFit.height / 2}
            width={rootFit.width}
            height={rootFit.height}
            clipPath={`url(#${rootClipId})`}
            pointerEvents="none"
            overflow="visible"
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
                color: (rootData.radialTextColor as string | undefined) ?? (rootData.textColor as string | undefined) ?? model.scheme.rootText,
                fontSize: rootFit.fontSize,
                lineHeight: isDevanagariText(rootLabel) ? DEVANAGARI_LINE_HEIGHT : 1.12,
                fontFamily: labelFontFamily(rootLabel, rootData.fontFamily as string | undefined),
                fontWeight: labelFontWeight(rootLabel, rootData.fontWeight === "bold" ? 700 : rootData.fontWeight === "normal" ? 400 : 800),
                fontStyle: rootData.fontStyle === "italic" ? "italic" : "normal",
                textAlign: (rootData.textAlign as CSSProperties["textAlign"] | undefined) ?? "center",
              }}
              dangerouslySetInnerHTML={{ __html: rootRichText }}
            />
          </foreignObject>
        )}

        {selectedId && editingId === selectedId && selectedNode && selectedGeometry && selectedTextStyle && selectedClipId && (
          <foreignObject
            x={selectedGeometry.x - selectedGeometry.width / 2}
            y={selectedGeometry.y - selectedGeometry.height / 2}
            width={selectedGeometry.width}
            height={selectedGeometry.height}
            transform={`rotate(${selectedGeometry.rotation} ${selectedGeometry.x} ${selectedGeometry.y})`}
            className="sunburst-inline-editor nodrag nopan overflow-visible"
            overflow="visible"
            style={{ pointerEvents: "all", overflow: "visible" }}
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

        {boundaryPairs.map(({ first, second, key }) => {
          const boundaryAngle = first.endAngle;
          const innerRadius = Math.min(first.innerRadius, second.innerRadius);
          const outerRadius = Math.max(first.outerRadius, second.outerRadius);
          const handleRadius = (innerRadius + outerRadius) / 2;
          return (
            <g key={key}>
              <line
                x1={pointOnCircle(model.center, model.center, innerRadius, boundaryAngle).x}
                y1={pointOnCircle(model.center, model.center, innerRadius, boundaryAngle).y}
                x2={pointOnCircle(model.center, model.center, outerRadius, boundaryAngle).x}
                y2={pointOnCircle(model.center, model.center, outerRadius, boundaryAngle).y}
                stroke="transparent"
                strokeWidth="20"
                className="cursor-grab"
                onPointerDown={(event) => beginBoundaryDrag(event, first, second)}
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
                cx={pointOnCircle(model.center, model.center, handleRadius, boundaryAngle).x}
                cy={pointOnCircle(model.center, model.center, handleRadius, boundaryAngle).y}
                r="7"
                fill="#ffffff"
                stroke="#2563eb"
                strokeWidth="3"
                className="cursor-grab"
                onPointerDown={(event) => beginBoundaryDrag(event, first, second)}
              >
                <title>Drag to resize adjacent sectors</title>
              </circle>
            </g>
          );
        })}

        {selectedId === d.rootId && model.tree.children.length > 0 && (
          <g>
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

      {selectedId && plusGeometry && (
        <button
          type="button"
          title="Add child sector"
          aria-label="Add child sector"
          className="nodrag nopan absolute z-30 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-110"
          style={{ left: plusGeometry.x, top: plusGeometry.y, transform: "translate(-50%, -50%)" }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            finishEditing();
            createChildNode(selectedId);
          }}
        >
          <Plus className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export const SunburstNode = memo(SunburstNodeComponent);
