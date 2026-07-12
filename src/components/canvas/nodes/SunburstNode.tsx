"use client";

import { memo, useCallback, useId, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import type { Node, NodeProps } from "@xyflow/react";
import { Plus } from "lucide-react";
import type { SunburstNodeData } from "@/lib/types";
import { buildHierarchy, type Hierarchy } from "@/lib/layout/hierarchy";
import { useCanvasStore } from "@/store/canvas-store";
import { RichTextEditor } from "../RichTextEditor";

type PolarPoint = { x: number; y: number };

type SunburstTreeNode = {
  id: string;
  parentId: string | null;
  depth: number;
  siblingIndex: number;
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

const ROOT_START_ANGLE = -90;
const ROOT_END_ANGLE = 270;
const CHART_PADDING = 22;
const MIN_SECTOR_ANGLE = 2.5;
const BRANCH_HUES = [348, 42, 62, 164, 198, 246, 286, 18, 122, 322, 94, 214];

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

function wrapLabel(label: string, maxChars: number): string[] {
  const safeChars = Math.max(1, Math.floor(maxChars));
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
      if (next.length > safeChars && current) {
        lines.push(current);
        current = "";
      }
      if (word.length > safeChars) {
        if (current) {
          lines.push(current);
          current = "";
        }
        for (let offset = 0; offset < word.length; offset += safeChars) {
          lines.push(word.slice(offset, offset + safeChars));
        }
      } else {
        current = current ? `${current} ${word}` : word;
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
  preferredFontSize: number
): LabelFit {
  const width = Math.max(8, availableWidth);
  const height = Math.max(8, availableHeight);
  if (!label.trim()) return { lines: [], fontSize: preferredFontSize, width, height };

  const maxFont = Math.max(3, preferredFontSize);
  for (let fontSize = maxFont; fontSize >= 0.5; fontSize -= Math.max(0.08, fontSize * 0.06)) {
    const maxChars = Math.max(1, Math.floor(width / Math.max(0.8, fontSize * 0.54)));
    const lines = wrapLabel(label, maxChars);
    const longest = Math.max(1, ...lines.map((line) => line.length));
    if (longest * fontSize * 0.54 <= width && lines.length * fontSize * 1.12 <= height) {
      return { lines, fontSize, width, height };
    }
  }

  const fallbackFont = 0.5;
  const maxChars = Math.max(1, Math.floor(width / (fallbackFont * 0.54)));
  const lines = wrapLabel(label, maxChars);
  const longest = Math.max(1, ...lines.map((line) => line.length));
  const guaranteedFont = Math.max(0.05, Math.min(
    fallbackFont,
    width / (longest * 0.54),
    height / (Math.max(1, lines.length) * 1.12)
  ));
  return { lines, fontSize: guaranteedFont, width, height };
}

function sectorLabelGeometry(segment: SunburstSegment, center: number): LabelGeometry {
  const midAngle = (segment.startAngle + segment.endAngle) / 2;
  const textRadius = (segment.innerRadius + segment.outerRadius) / 2;
  const point = pointOnCircle(center, center, textRadius, midAngle);
  const angleSpan = segment.endAngle - segment.startAngle;
  const arcLength = Math.max(8, (angleSpan * Math.PI * textRadius) / 180);
  const radialBand = Math.max(8, segment.outerRadius - segment.innerRadius);
  const width = Math.min(arcLength * 0.8, Math.max(72, radialBand * 3.1));
  const height = radialBand * 0.76;
  const defaultMax = segment.depth <= 1 ? 28 : 20;
  const preferred = clamp(segment.preferredFontSize ?? defaultMax, 4, 96);
  const fit = fitLabel(segment.label, width, height, preferred);
  const normalized = ((midAngle % 360) + 360) % 360;
  const rotation = normalized > 90 && normalized < 270 ? midAngle + 180 : midAngle;
  return { ...fit, x: point.x, y: point.y, rotation };
}

function circleLabelGeometry(label: string, radius: number, center: number, preferredFontSize?: number): LabelGeometry {
  const width = Math.max(24, radius * 1.55);
  const height = Math.max(24, radius * 1.5);
  const preferred = clamp(preferredFontSize ?? Math.min(32, radius * 0.34), 5, 96);
  return { ...fitLabel(label, width, height, preferred), x: center, y: center, rotation: 0 };
}

function textColorForDepth(depth: number): string {
  return depth <= 1 ? "#f8fafc" : "#0f172a";
}

function segmentFill(branchIndex: number, depth: number, siblingIndex: number): string {
  const hue = (BRANCH_HUES[branchIndex % BRANCH_HUES.length] + siblingIndex * 3) % 360;
  const saturation = Math.max(48, 76 - depth * 4);
  const lightness = Math.min(84, 48 + depth * 8);
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

function buildSunburstTree(rootId: string, hierarchy: Hierarchy, byId: Map<string, Node>): SunburstTreeNode {
  const build = (
    id: string,
    parentId: string | null,
    depth: number,
    siblingIndex: number,
    branchIndex: number
  ): SunburstTreeNode => {
    const childIds = hierarchy.get(id)?.childIds ?? [];
    const children = childIds.map((childId, index) =>
      build(childId, id, depth + 1, index, depth === 0 ? index : branchIndex)
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
      branchIndex,
      weight: Math.max(0.01, automaticWeight * manualWeight),
      startAngle: ROOT_START_ANGLE,
      endAngle: ROOT_END_ANGLE,
      innerRadius: 0,
      outerRadius: 0,
      children,
    };
  };
  return build(rootId, null, 0, 0, 0);
}

function maxDepthOf(node: SunburstTreeNode): number {
  return Math.max(node.depth, ...node.children.map(maxDepthOf));
}

function assignGeometry(node: SunburstTreeNode, centerRadius: number, ringWidth: number): void {
  if (node.depth === 0) {
    node.innerRadius = 0;
    node.outerRadius = centerRadius;
  } else {
    node.innerRadius = centerRadius + (node.depth - 1) * ringWidth;
    node.outerRadius = node.innerRadius + ringWidth;
  }

  const childWeight = node.children.reduce((sum, child) => sum + child.weight, 0);
  let currentAngle = node.startAngle;
  node.children.forEach((child, index) => {
    child.startAngle = currentAngle;
    child.endAngle = index === node.children.length - 1
      ? node.endAngle
      : currentAngle + (node.endAngle - node.startAngle) * (child.weight / Math.max(0.01, childWeight));
    assignGeometry(child, centerRadius, ringWidth);
    currentAngle = child.endAngle;
  });
}

function extendTerminalSectors(node: SunburstTreeNode, outerRadius: number): void {
  if (node.depth > 0 && !node.children.length) node.outerRadius = outerRadius;
  node.children.forEach((child) => extendTerminalSectors(child, outerRadius));
}

function collectSegments(node: SunburstTreeNode, byId: Map<string, Node>): SunburstSegment[] {
  const segments: SunburstSegment[] = [];
  const walk = (candidate: SunburstTreeNode) => {
    if (candidate.depth > 0) {
      const source = byId.get(candidate.id);
      const data = (source?.data ?? {}) as Record<string, unknown>;
      const label = nodeLabel(source);
      segments.push({
        ...candidate,
        label,
        richText: nodeRichText(source, label),
        fill: (data.radialFillColor as string | undefined) ?? segmentFill(candidate.branchIndex, candidate.depth, candidate.siblingIndex),
        textColor: (data.radialTextColor as string | undefined) ?? (data.textColor as string | undefined) ?? textColorForDepth(candidate.depth),
        borderColor: (data.radialBorderColor as string | undefined) ?? "rgba(255,255,255,0.92)",
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
  const clipPrefix = `sunburst-clip-${useId().replace(/:/g, "")}`;
  const svgRef = useRef<SVGSVGElement>(null);
  const boundaryDragRef = useRef<BoundaryDrag | null>(null);
  const editHistoryCaptured = useRef(false);

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
    const centerRadius = tree.children.length
      ? Math.max(96, Math.min(170, outerRadius * 0.26))
      : outerRadius;
    const ringWidth = Math.max(1, (outerRadius - centerRadius) / maxDepth);
    tree.startAngle = ROOT_START_ANGLE;
    tree.endAngle = ROOT_END_ANGLE;
    assignGeometry(tree, centerRadius, ringWidth);
    extendTerminalSectors(tree, outerRadius);

    return {
      root,
      byId,
      tree,
      size,
      center: size / 2,
      centerRadius,
      outerRadius,
      segments: collectSegments(tree, byId),
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
  const rootFit = circleLabelGeometry(rootLabel, model.centerRadius, model.center, typeof rootData.fontSize === "number" ? rootData.fontSize : undefined);
  const rootClipId = `${clipPrefix}-root`;

  const selectedGeometry = selectedId === d.rootId
    ? rootFit
    : selectedSegment
      ? sectorLabelGeometry(selectedSegment, model.center)
      : null;
  const selectedRichText = selectedId === d.rootId ? rootRichText : selectedSegment?.richText ?? "";
  const selectedClipId = selectedId === d.rootId
    ? rootClipId
    : selectedId
      ? `${clipPrefix}-${selectedId.replace(/[^a-zA-Z0-9_-]/g, "-")}`
      : null;
  const selectedTextStyle = selectedId === d.rootId
    ? {
        color: (rootData.radialTextColor as string | undefined) ?? (rootData.textColor as string | undefined) ?? "#f8fafc",
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
  const boundaryFirst = selectedSegment && nextSibling ? selectedSegment : previousSibling;
  const boundarySecond = selectedSegment && nextSibling ? nextSibling : selectedSegment;

  const beginBoundaryDrag = (event: ReactPointerEvent<SVGElement>) => {
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

  const moveBoundary = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = boundaryDragRef.current;
    const svg = svgRef.current;
    if (!drag || !svg || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = svg.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * model.size;
    const y = ((event.clientY - bounds.top) / Math.max(1, bounds.height)) * model.size;
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

  const endBoundaryDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = boundaryDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    boundaryDragRef.current = null;
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
        onPointerMove={moveBoundary}
        onPointerUp={endBoundaryDrag}
        onPointerCancel={endBoundaryDrag}
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
          const labelGeometry = sectorLabelGeometry(segment, model.center);

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
              {!selected && labelGeometry.lines.length > 0 && (
                <foreignObject
                  x={labelGeometry.x - labelGeometry.width / 2}
                  y={labelGeometry.y - labelGeometry.height / 2}
                  width={labelGeometry.width}
                  height={labelGeometry.height}
                  transform={`rotate(${labelGeometry.rotation} ${labelGeometry.x} ${labelGeometry.y})`}
                  clipPath={`url(#${segmentClipId})`}
                  pointerEvents="none"
                >
                  <div
                    className="sunburst-rich-label"
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                      color: segment.textColor,
                      fontSize: labelGeometry.fontSize,
                      lineHeight: 1.12,
                      fontFamily: segment.fontFamily,
                      fontWeight: segment.fontWeight,
                      fontStyle: segment.fontStyle,
                      textAlign: segment.textAlign,
                    }}
                    dangerouslySetInnerHTML={{ __html: segment.richText }}
                  />
                </foreignObject>
              )}
            </g>
          );
        })}

        <circle
          cx={model.center}
          cy={model.center}
          r={model.centerRadius}
          fill={(rootData.radialFillColor as string | undefined) ?? "hsl(28, 52%, 24%)"}
          stroke={selectedId === d.rootId ? "#2563eb" : (rootData.radialBorderColor as string | undefined) ?? "#a16207"}
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
        {selectedId !== d.rootId && rootFit.lines.length > 0 && (
          <foreignObject
            x={rootFit.x - rootFit.width / 2}
            y={rootFit.y - rootFit.height / 2}
            width={rootFit.width}
            height={rootFit.height}
            clipPath={`url(#${rootClipId})`}
            pointerEvents="none"
          >
            <div
              className="sunburst-rich-label"
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                color: (rootData.radialTextColor as string | undefined) ?? (rootData.textColor as string | undefined) ?? "#f8fafc",
                fontSize: rootFit.fontSize,
                lineHeight: 1.12,
                fontFamily: rootData.fontFamily as string | undefined,
                fontWeight: rootData.fontWeight === "bold" ? 700 : rootData.fontWeight === "normal" ? 400 : 800,
                fontStyle: rootData.fontStyle === "italic" ? "italic" : "normal",
                textAlign: (rootData.textAlign as CSSProperties["textAlign"] | undefined) ?? "center",
              }}
              dangerouslySetInnerHTML={{ __html: rootRichText }}
            />
          </foreignObject>
        )}

        {selectedId && selectedNode && selectedGeometry && selectedTextStyle && selectedClipId && (
          <foreignObject
            x={selectedGeometry.x - selectedGeometry.width / 2}
            y={selectedGeometry.y - selectedGeometry.height / 2}
            width={selectedGeometry.width}
            height={selectedGeometry.height}
            transform={`rotate(${selectedGeometry.rotation} ${selectedGeometry.x} ${selectedGeometry.y})`}
            clipPath={`url(#${selectedClipId})`}
            className="sunburst-inline-editor nodrag nopan overflow-hidden"
            style={{ pointerEvents: editingId === selectedId ? "all" : "none" }}
          >
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                color: selectedTextStyle.color,
                fontSize: selectedGeometry.fontSize,
                lineHeight: 1.12,
                fontFamily: selectedTextStyle.fontFamily,
                fontWeight: selectedTextStyle.fontWeight,
                fontStyle: selectedTextStyle.fontStyle,
                textAlign: selectedTextStyle.textAlign,
              }}
            >
              <RichTextEditor
                nodeId={selectedId}
                initialContent={selectedRichText}
                editable={editingId === selectedId}
                placeholder="Type here"
                className="h-full w-full [&_.ProseMirror]:flex [&_.ProseMirror]:h-full [&_.ProseMirror]:w-full [&_.ProseMirror]:flex-col [&_.ProseMirror]:items-center [&_.ProseMirror]:justify-center [&_.ProseMirror]:overflow-hidden"
                blockAlign={(selectedNode.data as Record<string, unknown>).textAlign as "left" | "center" | "right" | "justify" | undefined}
                onChange={(html) => updateText(selectedId, html)}
                onBlur={finishEditing}
              />
            </div>
          </foreignObject>
        )}

        {boundaryFirst && boundarySecond && (
          <g>
            <line
              x1={pointOnCircle(model.center, model.center, Math.min(boundaryFirst.innerRadius, boundarySecond.innerRadius), boundaryFirst.endAngle).x}
              y1={pointOnCircle(model.center, model.center, Math.min(boundaryFirst.innerRadius, boundarySecond.innerRadius), boundaryFirst.endAngle).y}
              x2={pointOnCircle(model.center, model.center, Math.max(boundaryFirst.outerRadius, boundarySecond.outerRadius), boundaryFirst.endAngle).x}
              y2={pointOnCircle(model.center, model.center, Math.max(boundaryFirst.outerRadius, boundarySecond.outerRadius), boundaryFirst.endAngle).y}
              stroke="transparent"
              strokeWidth="18"
              className="cursor-grab"
              onPointerDown={beginBoundaryDrag}
            />
            <line
              x1={pointOnCircle(model.center, model.center, Math.min(boundaryFirst.innerRadius, boundarySecond.innerRadius), boundaryFirst.endAngle).x}
              y1={pointOnCircle(model.center, model.center, Math.min(boundaryFirst.innerRadius, boundarySecond.innerRadius), boundaryFirst.endAngle).y}
              x2={pointOnCircle(model.center, model.center, Math.max(boundaryFirst.outerRadius, boundarySecond.outerRadius), boundaryFirst.endAngle).x}
              y2={pointOnCircle(model.center, model.center, Math.max(boundaryFirst.outerRadius, boundarySecond.outerRadius), boundaryFirst.endAngle).y}
              stroke="#2563eb"
              strokeWidth="2.5"
              pointerEvents="none"
            />
            <circle
              cx={pointOnCircle(model.center, model.center, (Math.min(boundaryFirst.innerRadius, boundarySecond.innerRadius) + Math.max(boundaryFirst.outerRadius, boundarySecond.outerRadius)) / 2, boundaryFirst.endAngle).x}
              cy={pointOnCircle(model.center, model.center, (Math.min(boundaryFirst.innerRadius, boundarySecond.innerRadius) + Math.max(boundaryFirst.outerRadius, boundarySecond.outerRadius)) / 2, boundaryFirst.endAngle).y}
              r="7"
              fill="#ffffff"
              stroke="#2563eb"
              strokeWidth="3"
              className="cursor-grab"
              onPointerDown={beginBoundaryDrag}
            />
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
