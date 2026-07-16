"use client";

import { useEffect, useState } from "react";
import {
  Trash2, ChevronDown, ChevronRight, Lock, Unlock,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Bold, Italic, Plus, Minus, Pencil, StopCircle, Copy, Rows3, ArrowDown, ArrowLeft, ArrowRight, Share2,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal,
  AlignVerticalDistributeCenter, AlignHorizontalDistributeCenter,
  FileImage, FileType2, Maximize2,
} from "lucide-react";
import { MarkerType } from "@xyflow/react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useCanvasStore } from "@/store/canvas-store";
import { useUIStore } from "@/store/ui-store";
import { DEFAULT_BOARD_SETTINGS, SANSKRIT_TAG_SUGGESTIONS } from "@/lib/types";
import { LAYOUT_OPTIONS, getNodeDimensions } from "@/lib/layout";
import { buildHierarchy, getSubtree } from "@/lib/layout/hierarchy";
import type {
  BorderLayer,
  ConcentricShapeLayer,
  InternalFillRegion,
  RadialChartData,
  RadialChartRing,
  RadialChartSegment,
  ShapeType,
  InlineTextFormatKey,
  RadialColorScheme,
  RelationshipDiagramSpec,
  RelationshipDiagramPalette,
  RelationshipDiagramItemStyle,
  AutoSizeMode,
  VidyaEdgeData,
} from "@/lib/types";
import type { Edge, Node } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { ColorSwatchPicker } from "./ColorSwatchPicker";
import { FONT_OPTIONS, groupFontsByCategory } from "@/lib/fonts";
import { generateId } from "@/lib/utils";
import { RADIAL_COLOR_SCHEMES, radialColorScheme } from "@/lib/radial-layout";
import { legacyRadiusToPercent } from "@/lib/canvas/shape-fitting";
import { resolveAutoSizeMode } from "@/lib/canvas/node-sizing";
import { relationshipDiagramSourceIds } from "@/lib/canvas/chart-selection";
import {
  buildRelationshipGroupsForSpec,
  MAX_FLOWER_LAYERS,
  normalizeRelationshipDiagramSpec,
} from "@/lib/relationship-diagram";
import {
  relationshipDiagramItemColor,
  relationshipDiagramItemStyle,
} from "@/lib/relationship-diagram-colors";
import {
  alignSelection,
  compactEqualSpacing,
  type SelectionAlignment,
} from "@/lib/canvas/selection-geometry";
import { ConnectorLabelPresets } from "./edges/ConnectorLabelPresets";
import { ConnectorPathStylePreview } from "./edges/ConnectorPathStylePicker";
import { smartRerouteBoardEdges } from "@/lib/canvas/smart-reroute";
import {
  CONNECTOR_PATH_STYLES,
  resolveConnectorPathStyle,
} from "@/lib/canvas/connector-path-style";
import { findLogicalConnectorEdgeIds } from "@/lib/canvas/connector-junction";

// ── Constants ──────────────────────────────────────────────────────────────

const SHAPE_TYPES = [
  { label: "Rounded",    value: "rounded"   },
  { label: "Rectangle",  value: "rectangle" },
  { label: "Circle",     value: "circle"    },
  { label: "Ellipse",    value: "ellipse"   },
  { label: "Diamond",    value: "diamond"   },
  { label: "Capsule",    value: "capsule"   },
  { label: "Data",       value: "parallelogram" },
  { label: "Manual",     value: "trapezoid" },
  { label: "Document",   value: "document" },
  { label: "Database",   value: "database" },
  { label: "Predef.",    value: "predefinedProcess" },
  { label: "Delay",      value: "delay" },
  { label: "Cloud",      value: "cloud" },
  { label: "Off-page",   value: "offPageConnector" },
  { label: "Triangle",   value: "triangle"  },
  { label: "Hexagon",    value: "hexagon"   },
  { label: "Star",       value: "star"      },
  { label: "Arrow",      value: "arrow"     },
  { label: "Flower",     value: "flower"    },
  { label: "Leaf",       value: "leaf"      },
  { label: "Callout",    value: "callout"   },
];

const CONCENTRIC_INSET_STEP = 6;
const RADIAL_SEGMENT_COLORS = [
  "#c7d2fe", "#bfdbfe", "#a7f3d0", "#fde68a", "#fecaca", "#fbcfe8",
  "#ddd6fe", "#bae6fd", "#d9f99d", "#fed7aa", "#ccfbf1", "#e9d5ff",
];
const RADIAL_CHART_MIN_SIZE = 420;

function concentricInset(index: number, total: number): number {
  const step = Math.min(CONCENTRIC_INSET_STEP, 48 / Math.max(1, total + 1));
  return step * (index + 1);
}

function hexInputColor(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function normalizeRadialSegments(ring: RadialChartRing, count = ring.segmentCount): RadialChartSegment[] {
  const safeCount = Math.max(0, Math.min(360, Math.round(count ?? 1)));
  const existing = ring.segments ?? [];
  return Array.from({ length: safeCount }, (_, index) => existing[index] ?? {
    id: generateId(),
    text: "",
    fillColor: RADIAL_SEGMENT_COLORS[index % RADIAL_SEGMENT_COLORS.length],
    textColor: "#111827",
  });
}

function radialSegmentAllocationCount(segment: RadialChartSegment): number {
  const count = segment.childCount === 0 ? segment.mergedChildCount ?? 1 : segment.childCount ?? 1;
  return Math.max(1, Math.round(count));
}

type RadialParentAssignment = {
  parentIndex: number;
  parent: RadialChartSegment;
  childIndex: number;
  childCount: number;
};

function radialParentAssignments(rings: RadialChartRing[], ringIndex: number): RadialParentAssignment[] {
  if (ringIndex <= 0) return [];
  const parents = normalizeRadialSegments(rings[ringIndex - 1]);
  return parents.flatMap((parent, parentIndex) => {
    const childCount = radialSegmentAllocationCount(parent);
    return Array.from({ length: childCount }, (_, childIndex) => ({
      parentIndex,
      parent,
      childIndex,
      childCount,
    }));
  });
}

function normalizeRadialRelationships(rings: RadialChartRing[]): RadialChartRing[] {
  const normalized = rings.map((ring) => ({ ...ring, segments: normalizeRadialSegments(ring) }));
  for (let ringIndex = 0; ringIndex < normalized.length - 1; ringIndex += 1) {
    const parents = normalizeRadialSegments(normalized[ringIndex]);
    if (!parents.some((segment) => segment.childCount != null)) continue;
    const childCount = parents.reduce(
      (sum, segment) => sum + radialSegmentAllocationCount(segment),
      0
    );
    const nextRing = normalized[ringIndex + 1];
    normalized[ringIndex + 1] = {
      ...nextRing,
      segmentCount: childCount,
      segments: normalizeRadialSegments(nextRing, childCount),
    };
  }
  return normalized;
}

function ChildCountInput({
  value,
  ariaLabel,
  name,
  onCommit,
  minValue = 0,
}: {
  value: number;
  ariaLabel: string;
  name: string;
  onCommit: (value: number) => void;
  minValue?: number;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    const frame = requestAnimationFrame(() => setDraft(String(value)));
    return () => cancelAnimationFrame(frame);
  }, [value]);

  const commit = () => {
    const parsed = Number.parseInt(draft, 10);
    const nextValue = Number.isFinite(parsed) ? Math.max(minValue, Math.min(360, parsed)) : value;
    setDraft(String(nextValue));
    if (nextValue !== value) onCommit(nextValue);
  };

  return (
    <Input
      aria-label={ariaLabel}
      name={name}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={draft}
      className="h-7 text-xs"
      onChange={(event) => {
        const nextDraft = event.target.value;
        if (!/^\d*$/.test(nextDraft)) return;
        setDraft(nextDraft);
        if (minValue === 0 && nextDraft === "0" && value !== 0) onCommit(0);
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") setDraft(String(value));
      }}
    />
  );
}

function createDefaultRadialChart(centerText = ""): RadialChartData {
  const innerRing: RadialChartRing = { id: generateId(), segmentCount: 4 };
  const outerRing: RadialChartRing = { id: generateId(), segmentCount: 12 };
  return {
    enabled: true,
    rotation: 0,
    segmentBorderColor: "#ffffff",
    segmentBorderWidth: 0.8,
    centerText,
    centerColor: "#ffffff",
    centerTextColor: "#111827",
    centerRadius: 14,
    rings: [
      { ...innerRing, segments: normalizeRadialSegments(innerRing) },
      { ...outerRing, segments: normalizeRadialSegments(outerRing) },
    ],
  };
}

function normalizeRadialChart(chart: RadialChartData | undefined, centerText = ""): RadialChartData {
  if (!chart?.rings?.length) return createDefaultRadialChart(centerText);
  return {
    ...chart,
    enabled: chart.enabled ?? true,
    rotation: chart.rotation ?? 0,
    segmentBorderColor: chart.segmentBorderColor ?? "#ffffff",
    segmentBorderWidth: chart.segmentBorderWidth ?? 0.8,
    centerRadius: chart.centerRadius ?? 14,
    centerText: chart.centerText ?? centerText,
    centerColor: chart.centerColor ?? "#ffffff",
    centerTextColor: chart.centerTextColor ?? "#111827",
    centerFontSize: chart.centerFontSize && chart.centerFontSize > 0 ? chart.centerFontSize : undefined,
    rings: normalizeRadialRelationships(chart.rings.map((ring) => ({
      ...ring,
      segmentCount: Math.max(0, Math.min(360, Math.round(ring.segmentCount ?? 1))),
      segments: normalizeRadialSegments(ring),
    }))),
  };
}

const CONVERT_TYPES = [
  { label: "Mind-map",  value: "mindmap" },
  { label: "Text box",  value: "text"    },
  { label: "Sticky",    value: "sticky"  },
  { label: "Shape",     value: "shape"   },
];

// ── Section wrapper ────────────────────────────────────────────────────────

function Section({ label, children, defaultOpen = false, visible = true }: {
  label: string; children: React.ReactNode; defaultOpen?: boolean; visible?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (!visible) return null;
  return (
    <div>
      <button onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground">
        {label}
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </button>
      {open && <div className="space-y-2.5 px-3 pb-3">{children}</div>}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">{children}</div>
    </div>
  );
}

function IconBtn({ active, onClick, title, children }: {
  active?: boolean; onClick: () => void; title: string; children: React.ReactNode;
}) {
  return (
    <button title={title} onClick={onClick}
      className={cn("flex h-7 w-7 items-center justify-center rounded-md border text-xs transition-colors",
        active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted text-foreground")}>
      {children}
    </button>
  );
}

function clampControlValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function SliderControl({
  value,
  onChange,
  onChangeStart,
  onChangeEnd,
  min = 0,
  max = 100,
  step = 1,
  suffix = "",
}: {
  value: number;
  onChange: (v: number) => void;
  onChangeStart?: () => void;
  onChangeEnd?: () => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  const apply = (next: number) => onChange(clampControlValue(next, min, max));
  const displayPrecision = step >= 1 ? 0 : Math.min(3, Math.ceil(-Math.log10(step)));
  const displayValue = Number(value.toFixed(displayPrecision));
  const applyStep = (next: number) => {
    onChangeStart?.();
    apply(next);
    onChangeEnd?.();
  };
  return (
    <div className="flex items-center gap-1.5">
      <button onClick={() => applyStep(value - step)}
        className="flex h-6 w-6 items-center justify-center rounded border border-border hover:bg-muted text-xs"><Minus className="h-3 w-3" /></button>
      <input
        aria-label="Adjust value"
        name="slider-control"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => apply(Number(e.target.value))}
        onPointerDown={onChangeStart}
        onPointerUp={onChangeEnd}
        onPointerCancel={onChangeEnd}
        onKeyDown={(event) => {
          if (!event.repeat) onChangeStart?.();
        }}
        onKeyUp={onChangeEnd}
        className="flex-1 h-1.5 accent-primary"
      />
      <button onClick={() => applyStep(value + step)}
        className="flex h-6 w-6 items-center justify-center rounded border border-border hover:bg-muted text-xs"><Plus className="h-3 w-3" /></button>
      <span className="w-9 text-center text-[10px] text-muted-foreground">{displayValue}{suffix}</span>
    </div>
  );
}

/** Thickness control: slider + −/+ buttons */
function ThicknessControl({
  value,
  onChange,
  onChangeStart,
  onChangeEnd,
  min = 0,
  max = 20,
  step = 1,
  mixed = false,
}: {
  value: number;
  onChange: (v: number) => void;
  onChangeStart?: () => void;
  onChangeEnd?: () => void;
  min?: number;
  max?: number;
  step?: number;
  mixed?: boolean;
}) {
  const precision = step >= 1 ? 0 : Math.min(3, Math.ceil(-Math.log10(step)));
  const apply = (next: number) => onChange(Number(clampControlValue(next, min, max).toFixed(precision)));
  const applyStep = (next: number) => {
    onChangeStart?.();
    apply(next);
    onChangeEnd?.();
  };
  return (
    <div className="flex items-center gap-1.5">
      <button onClick={() => applyStep(value - step)}
        className="flex h-6 w-6 items-center justify-center rounded border border-border hover:bg-muted text-xs"><Minus className="h-3 w-3" /></button>
      <input type="range" min={min} max={max} step={step} value={value}
        aria-label="Adjust thickness"
        name="thickness-control"
        onChange={(e) => apply(Number(e.target.value))}
        onPointerDown={onChangeStart}
        onPointerUp={onChangeEnd}
        onPointerCancel={onChangeEnd}
        onKeyDown={(event) => { if (!event.repeat) onChangeStart?.(); }}
        onKeyUp={onChangeEnd}
        className="flex-1 h-1.5 accent-primary" />
      <button onClick={() => applyStep(value + step)}
        className="flex h-6 w-6 items-center justify-center rounded border border-border hover:bg-muted text-xs"><Plus className="h-3 w-3" /></button>
      <span className="w-10 text-center text-[10px] text-muted-foreground">
        {mixed ? "Mixed" : `${Number(value.toFixed(precision))}px`}
      </span>
    </div>
  );
}

function supportsCornerRadius(node: Node): boolean {
  const nodeType = node.type ?? "";
  if (["mindmap", "sticky", "text"].includes(nodeType)) return true;
  if (nodeType !== "shape") return false;
  const shapeType = ((node.data as Record<string, unknown>).shapeType as string | undefined) ?? "";
  return ["rounded", "rectangle"].includes(shapeType);
}

function cornerRadiusPercentForNode(node: Node, fallback?: number): number {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const shapeType = data.shapeType as string | undefined;
  const defaultPercent = fallback ?? (
    node.type === "sticky" ? 20
      : node.type === "text" ? 32
        : node.type === "shape" && shapeType === "rectangle" ? 0
          : 40
  );
  if (typeof data.cornerRadiusPercent === "number" && Number.isFinite(data.cornerRadiusPercent)) {
    return clampControlValue(data.cornerRadiusPercent, 0, 100);
  }
  return legacyRadiusToPercent(data.borderRadius, getNodeDimensions(node), defaultPercent);
}

function inspectorNodeTitle(node: Node | undefined | null): string {
  if (!node) return "None";
  const data = (node.data ?? {}) as Record<string, unknown>;
  const fields = ["text", "title", "topic", "label", "devanagari", "iast", "translation", "rule"];
  const title = fields
    .map((field) => data[field])
    .find((value): value is string => typeof value === "string" && value.trim().length > 0);
  return title?.replace(/\s+/g, " ").trim().slice(0, 44) || node.id.slice(0, 8);
}

function inspectorLayoutLabel(value: unknown): string {
  if (typeof value !== "string") return "Free Form";
  if (value === "topDown") return "Vertical";
  return LAYOUT_OPTIONS.find((option) => option.mode === value)?.label ?? "Free Form";
}

function normalizeWholeBoxFontSize(data: Record<string, unknown>, value: unknown): Record<string, unknown> {
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

function normalizeWholeTextFormat(
  data: Record<string, unknown>,
  key: "fontFamily" | "fontWeight" | "fontStyle" | "textColor" | "textAlign",
  value: unknown
): Record<string, unknown> {
  const patch: Record<string, unknown> = { [key]: value };
  if (typeof data.richText !== "string") return patch;
  const cssProperty = {
    fontFamily: "font-family",
    fontWeight: "font-weight",
    fontStyle: "font-style",
    textColor: "color",
    textAlign: "text-align",
  }[key];
  const fallback = data.richText.replace(new RegExp(`${cssProperty}\\s*:\\s*[^;\"']+;?`, "gi"), "");
  if (typeof document === "undefined") {
    patch.richText = fallback;
    return patch;
  }

  const container = document.createElement("div");
  container.innerHTML = data.richText;
  container.querySelectorAll<HTMLElement>("[style]").forEach((element) => {
    element.style.removeProperty(cssProperty);
    if (!element.getAttribute("style")?.trim()) element.removeAttribute("style");
  });
  if (key === "textColor") {
    container.querySelectorAll<HTMLElement>("[color]").forEach((element) => element.removeAttribute("color"));
  }
  if (key === "fontFamily") {
    container.querySelectorAll<HTMLElement>("[face]").forEach((element) => element.removeAttribute("face"));
  }
  if (key === "textAlign") {
    container.querySelectorAll<HTMLElement>("[align]").forEach((element) => element.removeAttribute("align"));
  }
  if (key === "fontWeight" && value !== "bold") {
    container.querySelectorAll("strong, b").forEach((element) => element.replaceWith(...Array.from(element.childNodes)));
  }
  if (key === "fontStyle" && value !== "italic") {
    container.querySelectorAll("em, i").forEach((element) => element.replaceWith(...Array.from(element.childNodes)));
  }
  container.normalize();
  patch.richText = container.innerHTML || fallback;
  return patch;
}

function normalizeWholeTextHighlight(data: Record<string, unknown>, value: unknown): Record<string, unknown> {
  const color = typeof value === "string" && value ? value : undefined;
  const patch: Record<string, unknown> = { textHighlightColor: color };
  if (typeof document === "undefined") return patch;

  const container = document.createElement("div");
  if (typeof data.richText === "string" && data.richText.trim()) {
    container.innerHTML = data.richText;
  } else {
    const fallbackText = ["text", "title", "topic", "label", "devanagari", "iast", "translation", "rule"]
      .map((field) => data[field])
      .find((candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0) ?? "";
    const lines = fallbackText.split(/\r?\n/);
    for (const line of lines) {
      const paragraph = document.createElement("p");
      paragraph.textContent = line;
      container.appendChild(paragraph);
    }
  }

  container.querySelectorAll("mark").forEach((mark) => mark.replaceWith(...Array.from(mark.childNodes)));
  container.normalize();
  if (color) {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    while (walker.nextNode()) {
      const textNode = walker.currentNode as Text;
      if (textNode.data.trim()) textNodes.push(textNode);
    }
    for (const textNode of textNodes) {
      const mark = document.createElement("mark");
      mark.dataset.vidyaWholeHighlight = "true";
      mark.style.backgroundColor = color;
      textNode.parentNode?.replaceChild(mark, textNode);
      mark.appendChild(textNode);
    }
  }
  patch.richText = container.innerHTML;
  return patch;
}

function fieldPatch(data: Record<string, unknown>, key: string, value: unknown): Record<string, unknown> {
  let patch: Record<string, unknown>;
  if (key === "fontSize") patch = normalizeWholeBoxFontSize(data, value);
  else if (key === "textHighlightColor") patch = normalizeWholeTextHighlight(data, value);
  else if (["fontFamily", "fontWeight", "fontStyle", "textColor", "textAlign"].includes(key)) {
    patch = normalizeWholeTextFormat(
      data,
      key as "fontFamily" | "fontWeight" | "fontStyle" | "textColor" | "textAlign",
      value
    );
  } else patch = { [key]: value };

  if (!data.layoutVisualStyle) return patch;
  if (["fillColor", "fillOpacity", "color"].includes(key)) patch.layoutAutoFill = false;
  if (["borderColor", "borderWidth", "borderStyle", "color"].includes(key)) patch.layoutAutoBorder = false;
  if (key === "textColor") patch.layoutAutoText = false;
  if (key === "fontSize") patch.layoutAutoTypography = false;
  return patch;
}

const INLINE_TEXT_FIELDS = new Set<InlineTextFormatKey>([
  "fontWeight",
  "fontStyle",
  "fontSize",
  "fontFamily",
  "textColor",
  "textHighlightColor",
  "textAlign",
]);

type InspectorTab = "style" | "text" | "shape" | "layout" | "data";

const INSPECTOR_TABS: Array<{ id: InspectorTab; label: string }> = [
  { id: "style", label: "Style" },
  { id: "text", label: "Text" },
  { id: "shape", label: "Shape" },
  { id: "layout", label: "Layout" },
  { id: "data", label: "Data" },
];

/** Border style selector: Solid | Dashed | Dotted */
function BorderStylePicker({ value, onChange }: {
  value?: string; onChange: (v: "solid" | "dashed" | "dotted") => void;
}) {
  return (
    <div className="flex gap-1">
      {(["solid", "dashed", "dotted"] as const).map((s) => (
        <button key={s} onClick={() => onChange(s)}
          className={cn("rounded border px-2 py-0.5 text-[10px] capitalize flex-1 hover:bg-muted",
            (value ?? "solid") === s ? "border-primary bg-primary/10 text-primary" : "border-border")}>
          {s}
        </button>
      ))}
    </div>
  );
}

function ConnectionInspectorSections({
  connectionEdges,
  commonValue,
  onChange,
  onWidthChange,
  onWidthChangeStart,
  onDelete,
  defaultOpen = false,
}: {
  connectionEdges: Edge[];
  commonValue: (key: string) => unknown;
  onChange: (key: string, value: unknown, captureHistory?: boolean) => void;
  onWidthChange?: (value: number) => void;
  onWidthChangeStart?: () => void;
  onDelete: () => void;
  defaultOpen?: boolean;
}) {
  const edgeData = (connectionEdges[0]?.data ?? {}) as Record<string, unknown>;
  const widths = connectionEdges.map((edge) => {
    const width = ((edge.data ?? {}) as Record<string, unknown>).width;
    return typeof width === "number" && Number.isFinite(width) ? width : 2;
  });
  const widthMixed = widths.some((width) => Math.abs(width - widths[0]) > 0.001);
  const allListEdges = connectionEdges.every((edge) => (
    ((edge.data ?? {}) as Record<string, unknown>).layoutMode === "list"
  ));
  const arrowStarts = connectionEdges.map((edge) => {
    const configured = ((edge.data ?? {}) as Record<string, unknown>).arrowStart;
    return typeof configured === "boolean" ? configured : edge.markerStart !== undefined;
  });
  const arrowEnds = connectionEdges.map((edge) => {
    const configured = ((edge.data ?? {}) as Record<string, unknown>).arrowEnd;
    return typeof configured === "boolean" ? configured : allListEdges ? false : edge.markerEnd !== undefined;
  });
  const endpointMode = arrowStarts.every((value) => value === arrowStarts[0])
    && arrowEnds.every((value) => value === arrowEnds[0])
    ? arrowStarts[0]
      ? arrowEnds[0] ? "both" : "start"
      : arrowEnds[0] ? "end" : "none"
    : "mixed";
  const pathStyles = connectionEdges.map((edge) => (
    resolveConnectorPathStyle((edge.data ?? {}) as VidyaEdgeData)
  ));
  const pathStyle = pathStyles.every((value) => value === pathStyles[0])
    ? pathStyles[0]
    : undefined;
  return (
    <>
      <Section label={`Connection path (${connectionEdges.length})`} defaultOpen={defaultOpen}>
        <div className="grid grid-cols-3 gap-1">
          {([
            ["step", "Elbow"],
            ["smooth", "Curved"],
            ["straight", "Straight"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => onChange("curveStyle", value)}
              className={cn(
                "rounded-md border px-2 py-1.5 text-[10px] transition-colors",
                (commonValue("curveStyle") ?? "step") === value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border hover:bg-muted"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div>
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Line style</p>
          <div className="grid grid-cols-4 gap-1">
            {CONNECTOR_PATH_STYLES.map((option) => (
              <button
                key={option.value}
                type="button"
                title={option.label}
                aria-label={`${option.label} connection path`}
                aria-pressed={pathStyle === option.value}
                onClick={() => onChange("pathStyle", option.value)}
                className={cn(
                  "flex h-11 flex-col items-center justify-center gap-1 rounded-md border text-[9px] transition-colors",
                  pathStyle === option.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:bg-muted"
                )}
              >
                <ConnectorPathStylePreview style={option.value} />
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Endpoints</p>
          <div className="grid grid-cols-4 gap-1">
            {([[
              "none", "Line",
            ], [
              "start", "Start",
            ], [
              "end", "End",
            ], [
              "both", "Both",
            ]] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => onChange("arrowMode", value)}
                className={cn(
                  "rounded-md border px-1 py-1.5 text-[9px] transition-colors",
                  endpointMode === value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:bg-muted"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </Section>
      <Section label="Connection appearance" defaultOpen={defaultOpen}>
        <div>
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Color</p>
          <ColorSwatchPicker value={(commonValue("color") as string) ?? "#94a3b8"} onChange={(value) => onChange("color", value)} size="sm" />
        </div>
        <div>
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Thickness</p>
          <ThicknessControl
            value={widthMixed ? 2 : widths[0]}
            onChange={(value) => (onWidthChange ?? ((next) => onChange("width", next)))(value)}
            onChangeStart={onWidthChangeStart}
            min={0.5}
            max={12}
            step={0.5}
            mixed={widthMixed}
          />
        </div>
        {connectionEdges.length === 1 && (
          <div>
            <Label htmlFor="connection-label" className="text-xs">Label</Label>
            <Input
              id="connection-label"
              name="connection-label"
              value={(edgeData.label as string) ?? ""}
              placeholder="e.g. Yes, No, Approved"
              onFocus={onWidthChangeStart}
              onChange={(event) => onChange("label", event.target.value, false)}
              className="mt-1 h-8 text-xs"
            />
            <div className="mt-1.5 grid grid-cols-4 gap-1">
              <ConnectorLabelPresets
                variant="grid"
                maxVisible={7}
                currentLabel={(edgeData.label as string) ?? ""}
                onSelect={(label) => onChange("label", label)}
              />
            </div>
          </div>
        )}
        <Button type="button" variant="outline" size="sm" className="h-7 w-full text-[10px] text-destructive hover:text-destructive" onClick={onDelete}>
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          Delete {connectionEdges.length === 1 ? "connection" : `${connectionEdges.length} connections`}
        </Button>
      </Section>
    </>
  );
}

// ── Main inspector ─────────────────────────────────────────────────────────

export function CanvasInspector({ compact = false }: { compact?: boolean }) {
  const [singleNodeTab, setSingleNodeTab] = useState<InspectorTab>("style");
  const [openRadialParentGroups, setOpenRadialParentGroups] = useState<Set<string>>(() => new Set());
  const [bulkChildCount, setBulkChildCount] = useState(3);
  const [resetManualRoutes, setResetManualRoutes] = useState(false);
  const nodes           = useCanvasStore((s) => s.nodes);
  const edges           = useCanvasStore((s) => s.edges);
  const relationships   = useCanvasStore((s) => s.relationships);
  const selectedNodeIds = useCanvasStore((s) => s.selectedNodeIds);
  const selectedEdgeIds = useCanvasStore((s) => s.selectedEdgeIds);
  const settings        = useCanvasStore((s) => s.settings);
  const setSettings     = useCanvasStore((s) => s.setSettings);
  const updateNodeData  = useCanvasStore((s) => s.updateNodeData);
  const updateRelationshipDiagramSpec = useCanvasStore((s) => s.updateRelationshipDiagramSpec);
  const setNodeLocked = useCanvasStore((s) => s.setNodeLocked);
  const resizeNodeToFitBounds = useCanvasStore((s) => s.resizeNodeToFitBounds);
  const fitNodeToStoredContent = useCanvasStore((s) => s.fitNodeToStoredContent);
  const setNodeAutoSizeMode = useCanvasStore((s) => s.setNodeAutoSizeMode);
  const setNodeSize = useCanvasStore((s) => s.setNodeSize);
  const deleteSelected  = useCanvasStore((s) => s.deleteSelected);
  const deleteEdges     = useCanvasStore((s) => s.deleteEdges);
  const clearConnectorJunction = useCanvasStore((s) => s.clearConnectorJunction);
  const duplicateSelected = useCanvasStore((s) => s.duplicateSelected);
  const createChildNode = useCanvasStore((s) => s.createChildNode);
  const createChildNodes = useCanvasStore((s) => s.createChildNodes);
  const createSiblingNode = useCanvasStore((s) => s.createSiblingNode);
  const moveSiblingNode = useCanvasStore((s) => s.moveSiblingNode);
  const pushHistory     = useCanvasStore((s) => s.pushHistory);
  const convertNode     = useCanvasStore((s) => s.convertNode);
  const setBoardSettings = (patch: Parameters<typeof setSettings>[0]) => {
    pushHistory();
    setSettings(patch);
  };

  const drawingModeNodeId  = useUIStore((s) => s.drawingModeNodeId);
  const setDrawingModeNodeId = useUIStore((s) => s.setDrawingModeNodeId);
  const drawingRegionColor = useUIStore((s) => s.drawingRegionColor);
  const setDrawingRegionColor = useUIStore((s) => s.setDrawingRegionColor);
  const drawingRegionOpacity = useUIStore((s) => s.drawingRegionOpacity);
  const setDrawingRegionOpacity = useUIStore((s) => s.setDrawingRegionOpacity);
  const setLayoutPanelOpen = useUIStore((s) => s.setLayoutPanelOpen);
  const activeTextSelection = useUIStore((s) => s.activeTextSelection);
  const openRelationshipDiagram = useUIStore((s) => s.openRelationshipDiagram);
  const openBoardExport = useUIStore((s) => s.openBoardExport);

  const selectedNodes = selectedNodeIds.length
    ? nodes.filter((n) => selectedNodeIds.includes(n.id))
    : [];
  const selectedNode = selectedNodes.length === 1 ? selectedNodes[0] : null;
  const selectedRelationshipSourceIds = relationshipDiagramSourceIds(
    selectedNodes
      .filter((node) => !["sunburst", "frame", "relationshipDiagram", "junction"].includes(node.type ?? ""))
      .map((node) => node.id),
    relationships
  );
  const radialSelectionKeys = new Set(selectedNodes.map((node) =>
    ((node.data ?? {}) as Record<string, unknown>).sunburstHiddenFor
  ).filter((value): value is string => typeof value === "string"));
  const isRadialMultiSelection = selectedNodes.length > 1
    && radialSelectionKeys.size === 1
    && selectedNodes.every((node) => typeof ((node.data ?? {}) as Record<string, unknown>).sunburstHiddenFor === "string");
  const multiRadialChartRootId = isRadialMultiSelection
    ? (() => {
        const chartKey = Array.from(radialSelectionKeys)[0];
        const chart = nodes.find((node) =>
          node.type === "sunburst"
          && (node.data as Record<string, unknown>).sunburstFor === chartKey
        );
        const rootId = (chart?.data as Record<string, unknown> | undefined)?.rootId;
        return typeof rootId === "string" ? rootId : undefined;
      })()
    : undefined;
  const selectedEdges = edges.filter((edge) => selectedEdgeIds.includes(edge.id));
  const selectedNodeIdSet = new Set(selectedNodes.map((node) => node.id));
  const enclosedSelectionEdges = selectedNodes.length > 1
    ? edges.filter((edge) => !edge.hidden && selectedNodeIdSet.has(edge.source) && selectedNodeIdSet.has(edge.target))
    : [];
  const editableSelectionEdges = selectedEdges.length ? selectedEdges : enclosedSelectionEdges;
  const hierarchy = buildHierarchy(nodes, edges);
  const selectedHierarchy = selectedNode ? hierarchy.get(selectedNode.id) : null;
  const parentNode = selectedHierarchy?.parentId
    ? nodes.find((node) => node.id === selectedHierarchy.parentId)
    : null;
  const siblingIds = selectedHierarchy?.parentId
    ? hierarchy.get(selectedHierarchy.parentId)?.childIds ?? []
    : [];
  const selectedSiblingIndex = selectedNode ? siblingIds.indexOf(selectedNode.id) : -1;
  const canMoveSiblingEarlier = selectedSiblingIndex > 0;
  const canMoveSiblingLater = selectedSiblingIndex >= 0 && selectedSiblingIndex < siblingIds.length - 1;
  const childIds = selectedHierarchy?.childIds ?? [];
  const descendantIds = selectedNode ? getSubtree(selectedNode.id, hierarchy).filter((id) => id !== selectedNode.id) : [];

  // ALL hooks before any early return
  const d = (selectedNode?.data ?? {}) as Record<string, unknown>;
  const matrixRootId = d.layoutMode === "matrix"
    ? selectedNode?.id ?? null
    : typeof d.matrixRootId === "string" ? d.matrixRootId : null;
  const matrixRootNode = matrixRootId
    ? nodes.find((node) => node.id === matrixRootId) ?? null
    : null;
  const matrixBranchIds = matrixRootNode ? getSubtree(matrixRootNode.id, hierarchy) : [];
  const explicitMatrixOrientation = d.matrixOrientation === "horizontal" || d.matrixOrientation === "vertical"
    ? d.matrixOrientation
    : null;
  let effectiveMatrixOrientation: "horizontal" | "vertical" = "horizontal";
  if (selectedNode && matrixRootNode) {
    const lineage: string[] = [];
    let cursor: string | null = selectedNode.id;
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor)) {
      seen.add(cursor);
      lineage.unshift(cursor);
      if (cursor === matrixRootNode.id) break;
      cursor = hierarchy.get(cursor)?.parentId ?? null;
    }
    for (const nodeId of lineage) {
      const orientation = (nodes.find((node) => node.id === nodeId)?.data as Record<string, unknown> | undefined)?.matrixOrientation;
      if (orientation === "horizontal" || orientation === "vertical") effectiveMatrixOrientation = orientation;
    }
  }
  const isRadialLayoutSector = typeof d.sunburstHiddenFor === "string";
  const radialChartNode = isRadialLayoutSector
    ? nodes.find((node) => node.type === "sunburst" && (node.data as Record<string, unknown>).sunburstFor === d.sunburstHiddenFor)
    : null;
  const radialRootId = typeof (radialChartNode?.data as Record<string, unknown> | undefined)?.rootId === "string"
    ? (radialChartNode?.data as Record<string, unknown>).rootId as string
    : null;
  const radialRootNode = radialRootId ? nodes.find((node) => node.id === radialRootId) ?? null : null;
  const radialRootData = (radialRootNode?.data ?? {}) as Record<string, unknown>;
  const radialChartData = (radialChartNode?.data ?? {}) as Record<string, unknown>;
  const selectedIsRadialRoot = !!radialRootId && selectedNode?.id === radialRootId;
  const selectedRadialDepth = (() => {
    if (!radialRootId || !selectedNode) return 0;
    let depth = 0;
    let currentId: string | null | undefined = selectedNode.id;
    const visited = new Set<string>();
    while (currentId && currentId !== radialRootId && !visited.has(currentId)) {
      visited.add(currentId);
      depth += 1;
      currentId = hierarchy.get(currentId)?.parentId;
    }
    return currentId === radialRootId ? depth : 0;
  })();
  const radialDepthCount = (() => {
    if (!radialRootId) return 0;
    let maximum = 0;
    const visited = new Set<string>();
    const walk = (nodeId: string, depth: number) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      maximum = Math.max(maximum, depth);
      for (const childId of hierarchy.get(nodeId)?.childIds ?? []) walk(childId, depth + 1);
    };
    walk(radialRootId, 0);
    return maximum;
  })();
  const radialRingWeights = Array.from({ length: Math.max(1, radialDepthCount) }, (_, index) => {
    const source = Array.isArray(radialRootData.radialRingWidths)
      ? Number(radialRootData.radialRingWidths[index] ?? 1)
      : 1;
    return clampControlValue(Number.isFinite(source) ? source : 1, 0.000001, 1000000);
  });
  const selectedRingWeight = selectedRadialDepth > 0 ? radialRingWeights[selectedRadialDepth - 1] ?? 1 : 1;
  const radialRingWeightTotal = radialRingWeights.reduce((sum, weight) => sum + weight, 0);
  const radialChartSize = typeof radialChartData.chartSize === "number" ? radialChartData.chartSize : 1000;
  const resizeHierarchyRadialChart = (diameter: number) => {
    if (!radialChartNode || !Number.isFinite(diameter)) return;
    const nextDiameter = Math.max(RADIAL_CHART_MIN_SIZE, Math.min(4096, Math.round(diameter)));
    if (Math.abs(nextDiameter - radialChartSize) < 1) return;
    setNodeSize(radialChartNode.id, { width: nextDiameter, height: nextDiameter });
  };
  const radialOuterRadius = Math.max(1, radialChartSize / 2 - 22);
  const radialCenterRatio = clampControlValue(
    typeof radialRootData.radialCenterRatio === "number" ? radialRootData.radialCenterRatio : 28,
    14,
    58
  ) / 100;
  const radialAvailableRadius = Math.max(1, radialOuterRadius * (1 - radialCenterRatio));
  const radialMinimumBand = Math.min(28, radialAvailableRadius / (2 * Math.max(1, radialDepthCount)));
  const radialFlexibleRadius = Math.max(0, radialAvailableRadius - radialMinimumBand * Math.max(1, radialDepthCount));
  const selectedBandWidth = radialMinimumBand
    + radialFlexibleRadius * (selectedRingWeight / Math.max(0.01, radialRingWeightTotal));
  const selectedRingMinShare = Math.max(5, Math.ceil((radialMinimumBand / radialAvailableRadius) * 100));
  const selectedRingMaxShare = Math.min(
    80,
    Math.floor(((radialMinimumBand + radialFlexibleRadius) / radialAvailableRadius) * 100)
  );
  const selectedRingShare = clampControlValue(
    Math.round((selectedBandWidth / radialAvailableRadius) * 100),
    selectedRingMinShare,
    selectedRingMaxShare
  );
  const activeRadialColorScheme = radialColorScheme(radialRootData.radialColorScheme);
  const selectedTextRange = selectedNode && activeTextSelection?.nodeId === selectedNode.id && activeTextSelection.hasSelection
    ? activeTextSelection
    : null;

  useEffect(() => {
    if (!isRadialLayoutSector || singleNodeTab !== "shape") return;
    const frame = requestAnimationFrame(() => setSingleNodeTab("style"));
    return () => cancelAnimationFrame(frame);
  }, [isRadialLayoutSector, singleNodeTab]);

  const setField = (key: string, value: unknown) => {
    if (!selectedNode) return;
    if (key === "locked") {
      setNodeLocked(selectedNode.id, value === true);
      return;
    }
    pushHistory();
    if (selectedTextRange && INLINE_TEXT_FIELDS.has(key as InlineTextFormatKey)) {
      window.dispatchEvent(new CustomEvent("vidya:apply-inline-text-format", {
        detail: { nodeId: selectedNode.id, key, value },
      }));
      return;
    }
    if (isRadialLayoutSector && key === "textColor") {
      updateNodeData(selectedNode.id, { radialTextColor: value });
      return;
    }
    updateNodeData(selectedNode.id, fieldPatch(d, key, value));
  };

  const commonValue = (key: string) => {
    if (!selectedNodes.length) return undefined;
    const selectionValue = (node: Node): unknown => {
      const data = (node.data ?? {}) as Record<string, unknown>;
      if (!isRadialMultiSelection) return data[key];
      if (key === "textColor") return data.radialTextColor ?? data.textColor;
      if (key === "fillColor") return data.radialFillColor;
      if (key === "borderColor") return data.radialBorderColor;
      if (key === "borderWidth") return data.radialBorderWidth;
      if (key === "borderStyle") return data.radialBorderStyle;
      return data[key];
    };
    const first = selectionValue(selectedNodes[0]);
    return selectedNodes.every((node) => selectionValue(node) === first)
      ? first
      : undefined;
  };

  const setSelectedField = (key: string, value: unknown) => {
    if (!selectedNodes.length) return;
    pushHistory();
    for (const node of selectedNodes) {
      const data = (node.data ?? {}) as Record<string, unknown>;
      const patch = fieldPatch(data, key, value);
      if (isRadialMultiSelection && key === "textColor") {
        delete patch.textColor;
        patch.radialTextColor = value;
      } else if (isRadialMultiSelection && key === "fillColor") {
        delete patch.fillColor;
        patch.radialFillColor = value;
      } else if (isRadialMultiSelection && key === "borderColor") {
        delete patch.borderColor;
        patch.radialBorderColor = value;
      } else if (isRadialMultiSelection && key === "borderWidth") {
        delete patch.borderWidth;
        patch.radialBorderWidth = value;
      } else if (isRadialMultiSelection && key === "borderStyle") {
        delete patch.borderStyle;
        patch.radialBorderStyle = value;
      }
      updateNodeData(node.id, patch);
    }
  };

  const applyRadialColorScheme = (scheme: RadialColorScheme) => {
    if (!radialRootId) return;
    pushHistory();
    updateNodeData(radialRootId, { radialColorScheme: scheme });
  };

  const selectNodesById = (ids: string[]) => {
    const idSet = new Set(ids);
    useCanvasStore.setState((state) => ({
      nodes: state.nodes.map((node) => ({ ...node, selected: idSet.has(node.id) })),
      edges: state.edges.map((edge) => (edge.selected ? { ...edge, selected: false } : edge)),
      selectedNodeIds: ids,
      selectedEdgeIds: [],
    }));
  };

  const repairHierarchyFromArrows = () => {
    if (!nodes.length) return;
    pushHistory();
    const repaired = buildHierarchy(nodes, edges);
    useCanvasStore.setState({
      nodes: nodes.map((node) => {
        const info = repaired.get(node.id);
        if (!info) return node;
        return {
          ...node,
          data: {
            ...(node.data as Record<string, unknown>),
            parentId: info.parentId,
            childOrder: info.childIds,
          },
        };
      }),
      saveStatus: "unsaved",
    });
    toast.success("Repaired hierarchy from arrows.", {
      action: { label: "Undo", onClick: () => useCanvasStore.getState().undo() },
    });
  };

  const rerouteAllArrows = () => {
    if (!edges.length) return;
    const result = smartRerouteBoardEdges(nodes, edges, {
      resetManualAdjustments: resetManualRoutes,
    });
    if (result.changedCount > 0) {
      pushHistory();
      useCanvasStore.setState({ edges: result.edges, saveStatus: "unsaved" });
    } else {
      // Refresh render-time obstacle routes even when metadata was already clean.
      useCanvasStore.setState({ edges: [...result.edges] });
    }
    const detail = [
      !resetManualRoutes && result.preservedManualCount
        ? `Kept ${result.preservedManualCount} manually adjusted connector${result.preservedManualCount === 1 ? "" : "s"}.`
        : null,
      result.unresolvedCount
        ? `Skipped ${result.unresolvedCount} connector${result.unresolvedCount === 1 ? "" : "s"} with a missing endpoint.`
        : null,
      result.changedCount === 0 ? "Routes were already optimized." : null,
    ].filter(Boolean).join(" ");
    toast.success(
      `${resetManualRoutes ? "Reset and smart-routed" : "Smart-routed"} ${result.reroutedCount} connector${result.reroutedCount === 1 ? "" : "s"}.`,
      {
        description: detail || undefined,
        ...(result.changedCount > 0
          ? { action: { label: "Undo", onClick: () => useCanvasStore.getState().undo() } }
          : {}),
      }
    );
  };

  const setSelectedEdgeField = (key: string, value: unknown, captureHistory = true) => {
    if (!editableSelectionEdges.length) return;
    if (captureHistory) pushHistory();
    const selectedIds = new Set(key === "pathStyle"
      ? editableSelectionEdges.flatMap((edge) => findLogicalConnectorEdgeIds(edges, edge.id))
      : editableSelectionEdges.map((edge) => edge.id));
    useCanvasStore.setState((state) => ({
      edges: state.edges.map((edge) => {
        if (!selectedIds.has(edge.id)) return edge;
        const markerColor = ((((edge.data ?? {}) as Record<string, unknown>).color as string | undefined) ?? "#6366f1");
        if (key === "arrowMode") {
          const start = value === "start" || value === "both";
          const end = value === "end" || value === "both";
          return {
            ...edge,
            markerStart: start ? { type: MarkerType.ArrowClosed, color: markerColor } : undefined,
            markerEnd: end ? { type: MarkerType.ArrowClosed, color: markerColor } : undefined,
            data: { ...(edge.data ?? {}), arrowStart: start, arrowEnd: end },
          };
        }
        if (key === "arrowStart") {
          return {
            ...edge,
            markerStart: value ? { type: MarkerType.ArrowClosed, color: markerColor } : undefined,
            data: { ...(edge.data ?? {}), arrowStart: value },
          };
        }
        if (key === "arrowEnd") {
          return {
            ...edge,
            markerEnd: value ? {
              type: MarkerType.ArrowClosed,
              color: markerColor,
            } : undefined,
            data: { ...(edge.data ?? {}), arrowEnd: value },
          };
        }
        if (key === "color" && (edge.markerStart || edge.markerEnd)) {
          return {
            ...edge,
            markerStart: edge.markerStart ? { type: MarkerType.ArrowClosed, color: String(value) } : undefined,
            markerEnd: edge.markerEnd ? { type: MarkerType.ArrowClosed, color: String(value) } : undefined,
            data: { ...(edge.data ?? {}), color: value },
          };
        }
        if (key === "pathStyle") {
          const data = { ...(edge.data ?? {}), pathStyle: value } as Record<string, unknown>;
          delete data.dashed;
          return { ...edge, data };
        }
        return { ...edge, data: { ...(edge.data ?? {}), [key]: value } };
      }),
      saveStatus: "unsaved",
    }));
  };

  const commonEdgeValue = (key: string) => {
    const first = ((editableSelectionEdges[0]?.data ?? {}) as Record<string, unknown>)[key];
    return editableSelectionEdges.every((edge) => ((edge.data ?? {}) as Record<string, unknown>)[key] === first)
      ? first
      : undefined;
  };

  const deleteEditableConnections = () => {
    deleteEdges(editableSelectionEdges.map((edge) => edge.id));
  };

  if (selectedNodes.length > 1 || (selectedNodes.length > 0 && selectedEdges.length > 0)) {
    const commonFontSize = typeof commonValue("fontSize") === "number" ? commonValue("fontSize") as number : 14;
    const commonFontFamily = typeof commonValue("fontFamily") === "string" ? commonValue("fontFamily") as string : "";
    const commonFillOpacity = typeof commonValue("fillOpacity") === "number" ? commonValue("fillOpacity") as number : 0.18;
    const commonBorderWidth = typeof commonValue("borderWidth") === "number"
      ? commonValue("borderWidth") as number
      : isRadialMultiSelection ? 1 : 2;
    const commonBorderStyle = typeof commonValue("borderStyle") === "string" ? commonValue("borderStyle") as string : "solid";
    const multiFontGroups = groupFontsByCategory(FONT_OPTIONS);
    const radiusNodes = selectedNodes.filter(supportsCornerRadius);
    const firstRadius = radiusNodes.length ? cornerRadiusPercentForNode(radiusNodes[0]) : undefined;
    const commonBorderRadius = typeof firstRadius === "number" && radiusNodes.every((node) =>
      Math.abs(cornerRadiusPercentForNode(node) - firstRadius) < 0.5
    ) ? firstRadius : 40;
    const setSelectedRadius = (value: number) => {
      if (!radiusNodes.length) return;
      for (const node of radiusNodes) updateNodeData(node.id, { cornerRadiusPercent: value, borderRadius: undefined });
    };
    const clearSelectedRadialColors = () => {
      if (!isRadialMultiSelection) return;
      pushHistory();
      for (const node of selectedNodes) {
        updateNodeData(node.id, {
          radialFillColor: undefined,
          radialTextColor: undefined,
          radialBorderColor: undefined,
          radialBorderWidth: undefined,
          radialBorderStyle: undefined,
        });
      }
    };
    const updateSelectedGeometry = (positions: Map<string, { x: number; y: number }>) => {
      if (!positions.size) return;
      pushHistory();
      useCanvasStore.setState((state) => ({
        nodes: state.nodes.map((node) => {
          const position = positions.get(node.id);
          return position ? { ...node, position } : node;
        }),
        saveStatus: "unsaved",
      }));
    };
    const alignSelectedNodes = (mode: SelectionAlignment) => {
      updateSelectedGeometry(alignSelection(selectedNodes, mode));
    };
    const spaceSelectedNodes = (axis: "x" | "y") => {
      updateSelectedGeometry(compactEqualSpacing(selectedNodes, axis));
    };

    return (
      <aside className="vidya-float-panel canvas-inspector-panel flex w-72 max-w-[calc(100vw-1rem)] flex-col">
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {isRadialMultiSelection ? "Radial sectors" : "Selection"}
            </h3>
            <p className="text-[10px] text-muted-foreground">
              {selectedNodes.length} {isRadialMultiSelection ? "sections" : "objects"}
              {editableSelectionEdges.length > 0 ? ` · ${editableSelectionEdges.length} connection${editableSelectionEdges.length === 1 ? "" : "s"}` : ""}
            </p>
          </div>
          <div className="flex gap-1">
            {!isRadialMultiSelection && (
              <Button variant="ghost" size="icon" className="h-7 w-7" title="Duplicate" onClick={duplicateSelected}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" title="Delete" onClick={deleteSelected}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div className="flex-1 divide-y overflow-y-auto">
          {selectedRelationshipSourceIds.length > 0 && <div className="p-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-full justify-start gap-2 text-xs"
              onClick={() => openRelationshipDiagram({
                mode: "create",
                sourceNodeIds: selectedRelationshipSourceIds,
                ...(multiRadialChartRootId ? { chartRootNodeId: multiRadialChartRootId } : {}),
              })}
            >
              <Share2 className="h-3.5 w-3.5" />
              Generate relationship diagram
            </Button>
          </div>}
          {!isRadialMultiSelection && selectedNodes.length > 1 && (
            <Section label="Arrange" defaultOpen>
              <div>
                <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Align bounds</p>
                <div className="grid grid-cols-6 gap-1">
                  <IconBtn onClick={() => alignSelectedNodes("left")} title="Align left"><AlignStartVertical className="h-3.5 w-3.5" /></IconBtn>
                  <IconBtn onClick={() => alignSelectedNodes("centerX")} title="Align horizontal centers"><AlignCenterVertical className="h-3.5 w-3.5" /></IconBtn>
                  <IconBtn onClick={() => alignSelectedNodes("right")} title="Align right"><AlignEndVertical className="h-3.5 w-3.5" /></IconBtn>
                  <IconBtn onClick={() => alignSelectedNodes("top")} title="Align top"><AlignStartHorizontal className="h-3.5 w-3.5" /></IconBtn>
                  <IconBtn onClick={() => alignSelectedNodes("centerY")} title="Align vertical centers"><AlignCenterHorizontal className="h-3.5 w-3.5" /></IconBtn>
                  <IconBtn onClick={() => alignSelectedNodes("bottom")} title="Align bottom"><AlignEndHorizontal className="h-3.5 w-3.5" /></IconBtn>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <Button type="button" variant="outline" size="sm" className="h-auto min-h-9 gap-1 px-2 py-1.5 text-[9px] leading-tight" onClick={() => spaceSelectedNodes("x")}>
                  <AlignVerticalDistributeCenter className="h-3.5 w-3.5 shrink-0" />
                  Equal horizontal spacing
                </Button>
                <Button type="button" variant="outline" size="sm" className="h-auto min-h-9 gap-1 px-2 py-1.5 text-[9px] leading-tight" onClick={() => spaceSelectedNodes("y")}>
                  <AlignHorizontalDistributeCenter className="h-3.5 w-3.5 shrink-0" />
                  Equal vertical spacing
                </Button>
              </div>
              <p className="text-[9px] leading-snug text-muted-foreground">
                Works on any selected boxes; connectors and hierarchy are not required.
              </p>
            </Section>
          )}
          <Section label="Text">
            <Row label="Align">
              {([
                ["left",    <AlignLeft    key="l" className="h-3.5 w-3.5" />, "Left"],
                ["center",  <AlignCenter  key="c" className="h-3.5 w-3.5" />, "Center"],
                ["right",   <AlignRight   key="r" className="h-3.5 w-3.5" />, "Right"],
                ["justify", <AlignJustify key="j" className="h-3.5 w-3.5" />, "Justify"],
              ] as [string, React.ReactNode, string][]).map(([val, icon, title]) => (
                <IconBtn key={val} active={commonValue("textAlign") === val} onClick={() => setSelectedField("textAlign", val)} title={title}>{icon}</IconBtn>
              ))}
            </Row>
            <Row label="Style">
              <IconBtn
                active={commonValue("fontWeight") === "bold"}
                onClick={() => setSelectedField("fontWeight", commonValue("fontWeight") === "bold" ? "normal" : "bold")}
                title="Bold"
              >
                <Bold className="h-3.5 w-3.5" />
              </IconBtn>
              <IconBtn
                active={commonValue("fontStyle") === "italic"}
                onClick={() => setSelectedField("fontStyle", commonValue("fontStyle") === "italic" ? "normal" : "italic")}
                title="Italic"
              >
                <Italic className="h-3.5 w-3.5" />
              </IconBtn>
            </Row>
            <div>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Size</p>
              <ThicknessControl value={commonFontSize} onChange={(v) => setSelectedField("fontSize", v)} max={96} />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/25 p-2">
              <div>
                <p className="text-[10px] font-medium text-foreground">Fill available text space</p>
                <p className="text-[9px] leading-relaxed text-muted-foreground">
                  Maximizes text inside every selected node&apos;s safe shape area.
                </p>
              </div>
              <Switch
                checked={commonValue("maximizeText") === true}
                onCheckedChange={(value) => setSelectedField("maximizeText", value)}
                aria-label="Fill available text space for selected nodes"
              />
            </div>
            {isRadialMultiSelection && (
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Label angle</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[9px]"
                    onClick={() => setSelectedField("radialTextRotation", undefined)}
                  >
                    Auto
                  </Button>
                </div>
                <SliderControl
                  value={typeof commonValue("radialTextRotation") === "number"
                    ? commonValue("radialTextRotation") as number
                    : 0}
                  min={-180}
                  max={180}
                  step={1}
                  suffix="deg"
                  onChangeStart={pushHistory}
                  onChangeEnd={() => useCanvasStore.getState().setSaveStatus("unsaved")}
                  onChange={(value) => {
                    for (const node of selectedNodes) {
                      updateNodeData(node.id, { radialTextRotation: value });
                    }
                  }}
                />
                <p className="mt-1 text-[9px] leading-snug text-muted-foreground">
                  Relative to each label&apos;s automatic sector angle.
                </p>
              </div>
            )}
            <div>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Font family</p>
              <Select
                value={commonFontFamily || "__default_font__"}
                onValueChange={(value) => setSelectedField("fontFamily", value === "__default_font__" ? undefined : value)}
              >
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Mixed / default" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="__default_font__">Default</SelectItem>
                  {[...multiFontGroups.entries()].map(([category, fonts]) => (
                    <div key={category}>
                      <div className="bg-muted px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{category}</div>
                      {fonts.map((font) => (
                        <SelectItem key={font.value} value={font.value}>
                          <span style={{ fontFamily: font.value }}>{font.label}</span>
                        </SelectItem>
                      ))}
                    </div>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Text color</p>
              <ColorSwatchPicker value={(commonValue("textColor") as string) ?? ""} onChange={(v) => setSelectedField("textColor", v || undefined)} size="sm" />
            </div>
          </Section>

          <Section label="Fill">
            {isRadialMultiSelection && (
              <p className="text-[9px] leading-snug text-muted-foreground">
                Band-1 colors coordinate the gradient shades of their descendants.
              </p>
            )}
            <ColorSwatchPicker
              value={(commonValue("fillColor") as string) ?? ""}
              onChange={(v) => setSelectedField("fillColor", v || undefined)}
            />
            {!isRadialMultiSelection && <div>
              <div className="mb-1 flex items-center justify-between">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Opacity</p>
              </div>
              <SliderControl
                value={Math.round(commonFillOpacity * 100)}
                onChange={(value) => setSelectedField("fillOpacity", value / 100)}
                suffix="%"
              />
            </div>}
            {isRadialMultiSelection && (
              <Button type="button" variant="outline" size="sm" className="h-7 w-full text-[10px]" onClick={clearSelectedRadialColors}>
                Use automatic colors
              </Button>
            )}
          </Section>

          <Section label="Border">
            <div>
              <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Color</p>
              <ColorSwatchPicker value={(commonValue("borderColor") as string) ?? ""} onChange={(v) => setSelectedField("borderColor", v || undefined)} />
            </div>
            <div>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Thickness</p>
              <ThicknessControl value={commonBorderWidth} onChange={(v) => setSelectedField("borderWidth", v)} />
            </div>
            <div>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Style</p>
              <BorderStylePicker value={commonBorderStyle} onChange={(v) => setSelectedField("borderStyle", v)} />
            </div>
            {radiusNodes.length > 0 && (
              <div>
                <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Corner radius</p>
                <SliderControl value={commonBorderRadius} onChange={setSelectedRadius} onChangeStart={pushHistory} suffix="%" />
              </div>
            )}
          </Section>
          {editableSelectionEdges.length > 0 ? (
            <ConnectionInspectorSections
              connectionEdges={editableSelectionEdges}
              commonValue={commonEdgeValue}
              onChange={setSelectedEdgeField}
              onWidthChange={(value) => setSelectedEdgeField("width", value, false)}
              onWidthChangeStart={pushHistory}
              onDelete={deleteEditableConnections}
              defaultOpen
            />
          ) : (
            <Section label="Connections">
              <p className="text-[10px] leading-snug text-muted-foreground">
                No visible connectors are selected or run between the selected boxes.
              </p>
            </Section>
          )}
        </div>
      </aside>
    );
  }

  // ── No selection ──────────────────────────────────────────────────────────
  if (!selectedNode) {
    if (selectedEdges.length) {
      return (
        <aside className="vidya-float-panel canvas-inspector-panel flex w-72 max-w-[calc(100vw-1rem)] flex-col">
          <div className="flex items-center justify-between border-b px-3 py-2.5">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Connection</h3>
              <p className="text-[10px] text-muted-foreground">
                {selectedEdges.length === 1 ? selectedEdges[0].id.slice(0, 8) : `${selectedEdges.length} selected`}
              </p>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={deleteSelected}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="flex-1 divide-y overflow-y-auto">
            <ConnectionInspectorSections
              connectionEdges={selectedEdges}
              commonValue={commonEdgeValue}
              onChange={setSelectedEdgeField}
              onWidthChange={(value) => setSelectedEdgeField("width", value, false)}
              onWidthChangeStart={pushHistory}
              onDelete={deleteEditableConnections}
              defaultOpen
            />
          </div>
        </aside>
      );
    }

    if (compact) return null;

    return (
      <aside className="vidya-float-panel canvas-inspector-panel flex w-72 max-w-[calc(100vw-1rem)] flex-col">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">Canvas</h3>
          <p className="text-xs text-muted-foreground">{nodes.length} nodes · {edges.length} edges</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          <Section label="Background">
            <Select value={settings.background} onValueChange={(v) => setBoardSettings({ background: v as "dots" | "grid" | "plain" })}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="dots">Dots</SelectItem>
                <SelectItem value="grid">Grid</SelectItem>
                <SelectItem value="plain">Plain</SelectItem>
              </SelectContent>
            </Select>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Canvas color</p>
                <button
                  type="button"
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                  onClick={() => setBoardSettings({ canvasBackgroundColor: DEFAULT_BOARD_SETTINGS.canvasBackgroundColor })}
                >
                  Reset
                </button>
              </div>
              <ColorSwatchPicker
                value={settings.canvasBackgroundColor ?? DEFAULT_BOARD_SETTINGS.canvasBackgroundColor}
                onChange={(value) => setBoardSettings({ canvasBackgroundColor: value })}
              />
            </div>
            {settings.background !== "plain" && (
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {settings.background === "dots" ? "Dot color" : "Grid color"}
                  </p>
                  <button
                    type="button"
                    className="text-[10px] text-muted-foreground hover:text-foreground"
                    onClick={() => setBoardSettings({ gridColor: DEFAULT_BOARD_SETTINGS.gridColor })}
                  >
                    Reset
                  </button>
                </div>
                <ColorSwatchPicker
                  value={settings.gridColor ?? DEFAULT_BOARD_SETTINGS.gridColor}
                  onChange={(value) => setBoardSettings({ gridColor: value })}
                  size="sm"
                />
              </div>
            )}
            {settings.background !== "plain" && (
              <div>
                <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Spacing</p>
                <SliderControl
                  value={settings.gridSpacing ?? settings.gridSize ?? DEFAULT_BOARD_SETTINGS.gridSpacing ?? 32}
                  onChange={(value) => setSettings({ gridSpacing: value })}
                  onChangeStart={pushHistory}
                  min={8}
                  max={160}
                  step={4}
                  suffix="px"
                />
                <div className="mt-1.5 grid grid-cols-2 gap-1">
                  {([['Fine', 16], ['Medium', 32], ['Large', 64], ['Extra large', 96]] as const).map(([label, value]) => (
                    <button
                      key={label}
                      type="button"
                      className={cn(
                        "rounded border px-1.5 py-1 text-[10px] transition-colors hover:bg-muted",
                        (settings.gridSpacing ?? settings.gridSize ?? 32) === value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground"
                      )}
                      onClick={() => setBoardSettings({ gridSpacing: value })}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Section>
          <Separator />
          <Section label="Behavior">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Snap to grid</Label>
              <Switch checked={settings.snapToGrid} onCheckedChange={(v) => setBoardSettings({ snapToGrid: v })} />
            </div>
          </Section>
          <Separator />
          <Section label="Connector routing" defaultOpen>
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              Recalculates attachment sides and refreshes obstacle-aware paths across the board.
            </p>
            <div className="flex items-center justify-between gap-3 rounded-md border p-2">
              <div>
                <Label className="text-xs">Reset manual adjustments</Label>
                <p className="mt-0.5 text-[9px] leading-snug text-muted-foreground">
                  Clears bend points and custom attachment sides.
                </p>
              </div>
              <Switch checked={resetManualRoutes} onCheckedChange={setResetManualRoutes} />
            </div>
            <Button
              variant={resetManualRoutes ? "destructive" : "outline"}
              size="sm"
              className="h-8 w-full justify-start text-xs"
              disabled={!edges.length}
              onClick={rerouteAllArrows}
            >
              {resetManualRoutes ? "Reset and reroute all connectors" : "Smart reroute all connectors"}
            </Button>
            {!resetManualRoutes && (
              <p className="text-[9px] leading-relaxed text-muted-foreground">
                Manual bends, custom ports, labels, line styles, and junctions are preserved.
              </p>
            )}
          </Section>
          <Separator />
          <Section label="Repair tools" defaultOpen={false}>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-full justify-start text-xs"
              disabled={!edges.length}
              onClick={repairHierarchyFromArrows}
            >
              Repair hierarchy from arrows
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-full justify-start text-xs"
              onClick={() => window.dispatchEvent(new CustomEvent("vidya:fitview"))}
            >
              Fit board to view
            </Button>
          </Section>
          <Separator />
          <Section label="Script">
            <Select value={settings.defaultScriptMode} onValueChange={(v) => setBoardSettings({ defaultScriptMode: v as typeof settings.defaultScriptMode })}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="plain">Plain</SelectItem>
                <SelectItem value="devanagari">Devanāgarī</SelectItem>
                <SelectItem value="iast">IAST</SelectItem>
                <SelectItem value="mixed">Mixed</SelectItem>
              </SelectContent>
            </Select>
          </Section>
        </div>
      </aside>
    );
  }

  // ── Node selected ──────────────────────────────────────────────────────────
  if (selectedNode.type === "junction") {
    return (
      <aside className="vidya-float-panel canvas-inspector-panel flex w-72 max-w-[calc(100vw-1rem)] flex-col">
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Connector junction</h3>
            <p className="text-[10px] text-muted-foreground">A movable branch point between connectors</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            title="Clear junction and restore the main connector"
            className="h-7 w-7 text-destructive hover:bg-destructive/10"
            onClick={() => clearConnectorJunction(selectedNode.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="space-y-2 p-3 text-[11px] leading-relaxed text-muted-foreground">
          <p>Drag the center of the dot anywhere to reroute the connected lines.</p>
          <p>Select the Connector tool, then drag from any junction handle to a shape or another junction.</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-full text-[10px] text-destructive hover:text-destructive"
            onClick={() => clearConnectorJunction(selectedNode.id)}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Clear junction
          </Button>
          <p className="text-[10px]">This rejoins the original through-line and removes branches connected through this junction.</p>
        </div>
      </aside>
    );
  }

  if (selectedNode.type === "sunburst") {
    const chartData = (selectedNode.data ?? {}) as Record<string, unknown>;
    const chartDimensions = getNodeDimensions(selectedNode);
    const chartDiameter = Math.round(Math.max(chartDimensions.width, chartDimensions.height));
    const chartTitle = typeof chartData.title === "string" && chartData.title.trim()
      ? chartData.title
      : "Radial chart";
    const chartRootId = typeof chartData.rootId === "string" ? chartData.rootId : null;
    const resizeChart = (diameter: number) => {
      const nextDiameter = Math.max(RADIAL_CHART_MIN_SIZE, Math.min(4096, Math.round(diameter)));
      if (Math.abs(nextDiameter - chartDiameter) < 1) return;
      setNodeSize(selectedNode.id, { width: nextDiameter, height: nextDiameter });
    };

    return (
      <aside className="vidya-float-panel canvas-inspector-panel flex w-72 max-w-[calc(100vw-1rem)] flex-col">
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-foreground">Radial chart</h3>
            <p className="truncate text-[10px] text-muted-foreground">{chartTitle}</p>
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title={chartData.locked ? "Unlock chart" : "Lock chart"}
              onClick={() => setNodeLocked(selectedNode.id, chartData.locked !== true)}
            >
              {chartData.locked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:bg-destructive/10"
              title="Delete chart"
              onClick={deleteSelected}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div className="flex-1 divide-y overflow-y-auto">
          <div className="space-y-2 p-3">
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              Drag the chart to move it. Drag any corner handle to resize it; the saved diameter stays the same after refresh.
            </p>
            <div className="grid grid-cols-3 gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1 px-2 text-[10px]"
                disabled={!chartRootId}
                onClick={() => chartRootId && selectNodesById([chartRootId])}
              >
                <Pencil className="h-3.5 w-3.5" /> Sectors
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1 px-2 text-[10px]"
                onClick={() => openBoardExport({
                  scope: "node",
                  nodeIds: [selectedNode.id],
                  format: "png",
                  title: chartTitle,
                })}
              >
                <FileImage className="h-3.5 w-3.5" /> PNG
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1 px-2 text-[10px]"
                onClick={() => openBoardExport({
                  scope: "node",
                  nodeIds: [selectedNode.id],
                  format: "svg",
                  title: chartTitle,
                })}
              >
                <FileType2 className="h-3.5 w-3.5" /> SVG
              </Button>
            </div>
          </div>

          <Section label="Size" defaultOpen>
            <label htmlFor={`sunburst-diameter-${selectedNode.id}`} className="space-y-1">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Diameter</span>
              <div className="flex items-center gap-1.5">
                <Input
                  key={`${selectedNode.id}-diameter-${chartDiameter}`}
                  id={`sunburst-diameter-${selectedNode.id}`}
                  name="sunburst-diameter"
                  type="number"
                  min={RADIAL_CHART_MIN_SIZE}
                  max={4096}
                  step={10}
                  defaultValue={chartDiameter}
                  className="h-8 text-xs"
                  onBlur={(event) => {
                    const diameter = Number(event.currentTarget.value);
                    if (Number.isFinite(diameter)) resizeChart(diameter);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                  }}
                />
                <span className="text-[10px] text-muted-foreground">px</span>
              </div>
            </label>
            <div className="grid grid-cols-3 gap-1">
              <Button type="button" variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => resizeChart(chartDiameter * 0.9)}>
                Smaller
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => resizeChart(chartDiameter * 1.1)}>
                Larger
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-[10px]"
                onClick={() => window.dispatchEvent(new CustomEvent("vidya:fitview", {
                  detail: { nodeIds: [selectedNode.id] },
                }))}
              >
                Fit view
              </Button>
            </div>
            <p className="text-[9px] leading-relaxed text-muted-foreground">
              Radial charts stay square. Use the exact value here or the corner handles on the canvas.
            </p>
            <div className="flex items-center justify-between gap-3 rounded-md border border-border px-2 py-1.5">
              <div>
                <p className="text-[10px] font-medium">Equal outermost segments</p>
                <p className="text-[9px] leading-snug text-muted-foreground">
                  Give every terminal segment the same angle, at any depth. Custom sector areas return when switched off.
                </p>
              </div>
              <Switch
                aria-label="Equal outermost segments"
                checked={chartData.radialEqualOutermostSegments === true}
                onCheckedChange={(checked) => {
                  pushHistory();
                  updateNodeData(selectedNode.id, { radialEqualOutermostSegments: checked });
                }}
              />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border border-border px-2 py-1.5">
              <div>
                <p className="text-[10px] font-medium">Smart equal label sizes</p>
                <p className="text-[9px] leading-snug text-muted-foreground">
                  Use one readable size for all terminal labels. Font size is the maximum.
                </p>
              </div>
              <Switch
                aria-label="Smart equal outermost label sizes"
                checked={chartData.radialEqualOutermostLabelSizes === true}
                onCheckedChange={(checked) => {
                  pushHistory();
                  updateNodeData(selectedNode.id, { radialEqualOutermostLabelSizes: checked });
                }}
              />
            </div>
          </Section>

          <Section label="Transform" defaultOpen>
            <div>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Rotation</p>
              <SliderControl
                value={typeof chartData.rotation === "number" ? chartData.rotation : 0}
                min={-180}
                max={180}
                step={1}
                suffix="deg"
                onChange={(value) => updateNodeData(selectedNode.id, { rotation: value })}
              />
            </div>
          </Section>

          <Section label="Typography">
            <div>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Font size</p>
              <SliderControl
                value={typeof chartData.fontSize === "number" ? chartData.fontSize : 18}
                min={8}
                max={72}
                step={1}
                suffix="px"
                onChange={(value) => updateNodeData(selectedNode.id, { fontSize: value })}
              />
            </div>
            <Select
              value={typeof chartData.fontFamily === "string" ? chartData.fontFamily : "__default_font__"}
              onValueChange={(value) => updateNodeData(selectedNode.id, {
                fontFamily: value === "__default_font__" ? undefined : value,
              })}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Default font" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__default_font__">Default font</SelectItem>
                {[...groupFontsByCategory(FONT_OPTIONS).entries()].map(([category, fonts]) => (
                  <div key={category}>
                    <div className="px-2 py-1 text-[10px] font-medium text-muted-foreground">{category}</div>
                    {fonts.map((font) => (
                      <SelectItem key={font.value} value={font.value}>
                        <span style={{ fontFamily: font.value }}>{font.label}</span>
                      </SelectItem>
                    ))}
                  </div>
                ))}
              </SelectContent>
            </Select>
            <div className="grid grid-cols-2 gap-1">
              <Button
                type="button"
                variant={chartData.fontWeight === "bold" ? "default" : "outline"}
                size="sm"
                className="h-7 text-[10px]"
                onClick={() => updateNodeData(selectedNode.id, { fontWeight: chartData.fontWeight === "bold" ? "normal" : "bold" })}
              >
                <Bold className="mr-1 h-3.5 w-3.5" /> Bold
              </Button>
              <Button
                type="button"
                variant={chartData.fontStyle === "italic" ? "default" : "outline"}
                size="sm"
                className="h-7 text-[10px]"
                onClick={() => updateNodeData(selectedNode.id, { fontStyle: chartData.fontStyle === "italic" ? "normal" : "italic" })}
              >
                <Italic className="mr-1 h-3.5 w-3.5" /> Italic
              </Button>
            </div>
            <div>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Text color</p>
              <ColorSwatchPicker
                value={typeof chartData.textColor === "string" ? chartData.textColor : ""}
                onChange={(value) => updateNodeData(selectedNode.id, { textColor: value || undefined })}
                size="sm"
              />
            </div>
          </Section>

          <Section label="Appearance">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <p className="mb-1 text-[9px] uppercase text-muted-foreground">Fill</p>
                <ColorSwatchPicker value={typeof chartData.fillColor === "string" ? chartData.fillColor : ""} onChange={(value) => updateNodeData(selectedNode.id, { fillColor: value || undefined })} size="sm" />
              </div>
              <div>
                <p className="mb-1 text-[9px] uppercase text-muted-foreground">Border</p>
                <ColorSwatchPicker value={typeof chartData.borderColor === "string" ? chartData.borderColor : ""} onChange={(value) => updateNodeData(selectedNode.id, { borderColor: value || undefined })} size="sm" />
              </div>
              <div>
                <p className="mb-1 text-[9px] uppercase text-muted-foreground">Width</p>
                <Input
                  type="number"
                  min={0}
                  max={16}
                  step={0.5}
                  value={typeof chartData.borderWidth === "number" ? chartData.borderWidth : 2}
                  className="h-8 text-xs"
                  onChange={(event) => updateNodeData(selectedNode.id, { borderWidth: Number(event.target.value) })}
                />
              </div>
            </div>
            <p className="text-[9px] leading-relaxed text-muted-foreground">
              These chart-level choices override every sector. Select Sectors to style or rearrange individual sections.
            </p>
          </Section>
        </div>
      </aside>
    );
  }

  if (selectedNode.type === "relationshipDiagram") {
    const diagramSpec = normalizeRelationshipDiagramSpec(d.relationshipDiagramSpec);
    const diagramTitle = diagramSpec.title || "Relationship Diagram";
    const diagramSubtitle = diagramSpec.subtitle;
    const diagramBackground = diagramSpec.background || "transparent";
    const transparentBackground = ["", "transparent", "none", "rgba(0,0,0,0)", "#00000000"]
      .includes(diagramBackground.trim().toLowerCase());
    const frameDimensions = getNodeDimensions(selectedNode);
    const frameWidth = Math.round(frameDimensions.width);
    const frameHeight = Math.round(frameDimensions.height);
    const updateDiagram = (patch: Partial<RelationshipDiagramSpec>) => {
      updateRelationshipDiagramSpec(selectedNode.id, patch);
    };
    const diagramGroups = buildRelationshipGroupsForSpec({
      spec: diagramSpec,
      nodes,
      relationships,
      hierarchy,
    });
    const legacyAutomaticFlowerLayerCount = Math.ceil(
      diagramGroups.length / diagramSpec.flowerPetalsPerLayer
    );
    const preferredFlowerLayerCount = Math.max(
      0,
      ...Object.values(diagramSpec.itemStyles ?? {}).map((style) => style.flowerLayer ?? 0)
    );
    const flowerLayerCount = Math.min(
      MAX_FLOWER_LAYERS,
      Math.max(
        diagramSpec.flowerLayerCount > 0
          ? diagramSpec.flowerLayerCount
          : legacyAutomaticFlowerLayerCount,
        preferredFlowerLayerCount
      )
    );
    const updateItemStyle = (itemId: string, patch: Partial<RelationshipDiagramItemStyle>) => {
      const current = diagramSpec.itemStyles?.[itemId] ?? {};
      const nextItem = { ...current, ...patch };
      const nextStyles = { ...(diagramSpec.itemStyles ?? {}) };
      if (Object.values(nextItem).every((value) => value === undefined)) delete nextStyles[itemId];
      else nextStyles[itemId] = nextItem;
      updateDiagram({ itemStyles: nextStyles });
    };
    const moveDiagramItem = (index: number, direction: -1 | 1) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= diagramGroups.length) return;
      const order = diagramGroups.map((group) => group.itemId);
      [order[index], order[nextIndex]] = [order[nextIndex], order[index]];
      updateDiagram({ itemOrder: order, sortSources: "natural" });
    };
    return (
      <aside className="vidya-float-panel canvas-inspector-panel flex w-72 max-w-[calc(100vw-1rem)] flex-col">
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-foreground">Relationship diagram</h3>
            <p className="truncate text-[10px] capitalize text-muted-foreground">
              {String(diagramSpec.layout ?? "arc-fan").replace(/-/g, " ")}
            </p>
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title={d.locked ? "Unlock" : "Lock"}
              onClick={() => setNodeLocked(selectedNode.id, d.locked !== true)}
            >
              {d.locked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" title="Duplicate" onClick={duplicateSelected}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" title="Delete" onClick={deleteSelected}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <div className="flex-1 divide-y overflow-y-auto">
          <div className="space-y-2 p-3">
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              This live relationship view can be moved, resized, styled, and exported like any other canvas object.
            </p>
            <Button
              type="button"
              className="h-8 w-full justify-start gap-2 text-xs"
              onClick={() => openRelationshipDiagram({ mode: "edit", diagramNodeId: selectedNode.id })}
            >
              <Share2 className="h-3.5 w-3.5" />
              Change layout and options
            </Button>
            <div className="grid grid-cols-3 gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1 px-2 text-[10px]"
                onClick={() => window.dispatchEvent(new CustomEvent(
                  "vidya:fit-relationship-diagram",
                  { detail: { nodeId: selectedNode.id } }
                ))}
              >
                <Maximize2 className="h-3.5 w-3.5" /> Fit
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1 px-2 text-[10px]"
                onClick={() => openBoardExport({
                  scope: "node",
                  nodeIds: [selectedNode.id],
                  format: "png",
                  title: diagramTitle,
                })}
              >
                <FileImage className="h-3.5 w-3.5" /> PNG
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1 px-2 text-[10px]"
                onClick={() => openBoardExport({
                  scope: "node",
                  nodeIds: [selectedNode.id],
                  format: "svg",
                  title: diagramTitle,
                })}
              >
                <FileType2 className="h-3.5 w-3.5" /> SVG
              </Button>
            </div>
          </div>

          <Section label="Size" defaultOpen>
            <div className="grid grid-cols-2 gap-2">
              <label htmlFor={`relationship-width-${selectedNode.id}`} className="space-y-1">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Width</span>
                <Input
                  key={`${selectedNode.id}-relationship-width-${frameWidth}`}
                  id={`relationship-width-${selectedNode.id}`}
                  name="relationship-width"
                  type="number"
                  min={420}
                  max={4096}
                  step={10}
                  defaultValue={frameWidth}
                  className="h-8 text-xs"
                  onBlur={(event) => {
                    const width = Number(event.currentTarget.value);
                    if (Number.isFinite(width) && Math.abs(width - frameWidth) >= 1) {
                      setNodeSize(selectedNode.id, { width, height: frameHeight });
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                  }}
                />
              </label>
              <label htmlFor={`relationship-height-${selectedNode.id}`} className="space-y-1">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Height</span>
                <Input
                  key={`${selectedNode.id}-relationship-height-${frameHeight}`}
                  id={`relationship-height-${selectedNode.id}`}
                  name="relationship-height"
                  type="number"
                  min={360}
                  max={4096}
                  step={10}
                  defaultValue={frameHeight}
                  className="h-8 text-xs"
                  onBlur={(event) => {
                    const height = Number(event.currentTarget.value);
                    if (Number.isFinite(height) && Math.abs(height - frameHeight) >= 1) {
                      setNodeSize(selectedNode.id, { width: frameWidth, height });
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                  }}
                />
              </label>
            </div>
            <p className="text-[9px] leading-relaxed text-muted-foreground">
              Drag a corner or edge handle on the canvas, or enter the exact frame size here.
            </p>
          </Section>

          <Section label="Transform" defaultOpen>
            <div>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Rotation</p>
              <SliderControl
                value={typeof d.rotation === "number" ? d.rotation : 0}
                min={-180}
                max={180}
                step={1}
                suffix="deg"
                onChange={(value) => updateNodeData(selectedNode.id, { rotation: value })}
              />
            </div>
          </Section>

          {diagramSpec.layout === "flower" && (
            <Section label="Flower layout" defaultOpen>
              <div>
                <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Layer count
                </p>
                <Select
                  value={String(Math.max(1, flowerLayerCount))}
                  onValueChange={(value) => updateDiagram({ flowerLayerCount: Number(value) })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: MAX_FLOWER_LAYERS }, (_, index) => {
                      const layer = index + 1;
                      return (
                        <SelectItem key={layer} value={String(layer)}>
                          {layer} {layer === 1 ? "layer" : "layers"}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-[9px] leading-relaxed text-muted-foreground">
                Relationships are balanced into equal petal slots. Blank petals complete the outer layer when needed.
              </p>
            </Section>
          )}

          <Section label="Text">
            <div>
              <Label htmlFor="relationship-diagram-inspector-title" className="text-xs">Title</Label>
              <Input
                id="relationship-diagram-inspector-title"
                value={diagramTitle}
                onChange={(event) => updateDiagram({ title: event.target.value })}
                className="mt-1 h-8 text-xs"
              />
            </div>
            <div>
              <Label htmlFor="relationship-diagram-inspector-subtitle" className="text-xs">Subtitle</Label>
              <Input
                id="relationship-diagram-inspector-subtitle"
                value={diagramSubtitle}
                onChange={(event) => updateDiagram({ subtitle: event.target.value })}
                className="mt-1 h-8 text-xs"
              />
            </div>
            <div>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Text size</p>
              <SliderControl
                value={diagramSpec.textSize}
                min={8}
                max={72}
                step={1}
                suffix="px"
                onChange={(value) => updateDiagram({ textSize: value })}
              />
              {diagramSpec.maximizeLabelText && (
                <p className="mt-1 text-[9px] leading-relaxed text-muted-foreground">
                  Used as the preferred minimum; labels grow to fill their safe region and still shrink when required.
                </p>
              )}
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label className="text-xs">Fill available text space</Label>
                <p className="text-[9px] leading-relaxed text-muted-foreground">
                  Applies intelligently to every relationship layout.
                </p>
              </div>
              <Switch
                checked={diagramSpec.maximizeLabelText}
                onCheckedChange={(value) => updateDiagram({ maximizeLabelText: value })}
              />
            </div>
            <Select
              value={diagramSpec.fontFamily ?? "__default_font__"}
              onValueChange={(value) => updateDiagram({
                fontFamily: value === "__default_font__" ? undefined : value,
              })}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Default font" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__default_font__">Default font</SelectItem>
                {[...groupFontsByCategory(FONT_OPTIONS).entries()].map(([category, fonts]) => (
                  <div key={category}>
                    <div className="px-2 py-1 text-[10px] font-medium text-muted-foreground">{category}</div>
                    {fonts.map((font) => (
                      <SelectItem key={font.value} value={font.value}>
                        <span style={{ fontFamily: font.value }}>{font.label}</span>
                      </SelectItem>
                    ))}
                  </div>
                ))}
              </SelectContent>
            </Select>
            <div className="grid grid-cols-2 gap-1">
              <Button
                type="button"
                variant={diagramSpec.fontWeight === "bold" ? "default" : "outline"}
                size="sm"
                className="h-7 text-[10px]"
                onClick={() => updateDiagram({ fontWeight: diagramSpec.fontWeight === "bold" ? "normal" : "bold" })}
              >
                <Bold className="mr-1 h-3.5 w-3.5" /> Bold
              </Button>
              <Button
                type="button"
                variant={diagramSpec.fontStyle === "italic" ? "default" : "outline"}
                size="sm"
                className="h-7 text-[10px]"
                onClick={() => updateDiagram({ fontStyle: diagramSpec.fontStyle === "italic" ? "normal" : "italic" })}
              >
                <Italic className="mr-1 h-3.5 w-3.5" /> Italic
              </Button>
            </div>
            <div>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Text color</p>
              <ColorSwatchPicker
                value={diagramSpec.textColor ?? ""}
                onChange={(value) => updateDiagram({ textColor: value || undefined })}
                size="sm"
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label className="text-xs">Show counts</Label>
              <Switch
                checked={diagramSpec.showCounts !== false}
                onCheckedChange={(value) => updateDiagram({ showCounts: value })}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label className="text-xs">Show markers</Label>
              <Switch
                checked={diagramSpec.showIcons !== false}
                onCheckedChange={(value) => updateDiagram({ showIcons: value })}
              />
            </div>
          </Section>

          <Section label="Appearance">
            <div>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Palette</p>
              <Select
                value={typeof diagramSpec.palette === "string" ? diagramSpec.palette : "source"}
                onValueChange={(value) => updateDiagram({ palette: value as RelationshipDiagramPalette })}
              >
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="source">Source colors</SelectItem>
                  <SelectItem value="spectrum">Spectrum</SelectItem>
                  <SelectItem value="warm">Warm</SelectItem>
                  <SelectItem value="cool">Cool</SelectItem>
                  <SelectItem value="pastel">Pastel</SelectItem>
                  <SelectItem value="monochrome">Monochrome</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="mb-1 text-[9px] uppercase tracking-wider text-muted-foreground">Border</p>
                <ColorSwatchPicker
                  value={diagramSpec.borderColor ?? ""}
                  onChange={(value) => updateDiagram({ borderColor: value || undefined })}
                  size="sm"
                />
              </div>
              <div>
                <p className="mb-1 text-[9px] uppercase tracking-wider text-muted-foreground">Border width</p>
                <Input
                  type="number"
                  min={0}
                  max={16}
                  step={0.5}
                  value={diagramSpec.borderWidth ?? 2}
                  className="h-8 text-xs"
                  onChange={(event) => updateDiagram({ borderWidth: Number(event.target.value) })}
                />
              </div>
            </div>
            {["flower", "arc-fan", "radial-hub"].includes(diagramSpec.layout) && (
              <div className="space-y-2 rounded-lg border border-border p-2">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Center
                </p>
                <div className="grid grid-cols-3 gap-1.5">
                  <label className="space-y-1 text-[9px] uppercase tracking-wider text-muted-foreground">
                    Fill
                    <input
                      type="color"
                      value={hexInputColor(diagramSpec.centerFillColor, "#0f172a")}
                      className="h-7 w-full rounded border border-border bg-background"
                      onChange={(event) => updateDiagram({ centerFillColor: event.target.value })}
                    />
                  </label>
                  <label className="space-y-1 text-[9px] uppercase tracking-wider text-muted-foreground">
                    Border
                    <input
                      type="color"
                      value={hexInputColor(diagramSpec.centerBorderColor, "#ffffff")}
                      className="h-7 w-full rounded border border-border bg-background"
                      onChange={(event) => updateDiagram({ centerBorderColor: event.target.value })}
                    />
                  </label>
                  <label className="space-y-1 text-[9px] uppercase tracking-wider text-muted-foreground">
                    Text
                    <input
                      type="color"
                      value={hexInputColor(diagramSpec.centerTextColor, "#ffffff")}
                      className="h-7 w-full rounded border border-border bg-background"
                      onChange={(event) => updateDiagram({ centerTextColor: event.target.value })}
                    />
                  </label>
                </div>
                <label className="space-y-1 text-[9px] uppercase tracking-wider text-muted-foreground">
                  Center border width
                  <Input
                    type="number"
                    min={0}
                    max={16}
                    step={0.5}
                    value={diagramSpec.centerBorderWidth ?? 4}
                    className="h-7 text-xs"
                    onChange={(event) => updateDiagram({ centerBorderWidth: Number(event.target.value) })}
                  />
                </label>
              </div>
            )}
            <div>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Item opacity</p>
              <SliderControl
                value={Math.round((diagramSpec.fillOpacity ?? 1) * 100)}
                min={10}
                max={100}
                step={5}
                suffix="%"
                onChange={(value) => updateDiagram({ fillOpacity: value / 100 })}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label className="text-xs">Transparent background</Label>
                <p className="text-[9px] text-muted-foreground">Show the board behind the diagram.</p>
              </div>
              <Switch
                checked={transparentBackground}
                onCheckedChange={(checked) => updateDiagram({
                  background: checked ? "transparent" : "#ffffff",
                })}
              />
            </div>
            {!transparentBackground && (
              <div className="flex gap-2">
                <input
                  type="color"
                  aria-label="Relationship diagram background color"
                  value={/^#[0-9a-f]{6}$/i.test(diagramBackground) ? diagramBackground : "#ffffff"}
                  onChange={(event) => updateDiagram({ background: event.target.value })}
                  className="h-8 w-10 rounded border border-border bg-background p-1"
                />
                <Input
                  value={diagramBackground}
                  onChange={(event) => updateDiagram({ background: event.target.value })}
                  className="h-8 text-xs"
                  aria-label="Relationship diagram background"
                />
              </div>
            )}
          </Section>

          <Section label={`Arrange & style items (${diagramGroups.length})`} defaultOpen>
            <p className="text-[9px] leading-relaxed text-muted-foreground">
              The order and overrides below follow each item across flower, cards, matrix, hub, and fan layouts.
            </p>
            <div className="space-y-2">
              {diagramGroups.map((group, index) => {
                const style = relationshipDiagramItemStyle(group, diagramSpec);
                const sourceColor = hexInputColor(
                  relationshipDiagramItemColor(group, index, diagramSpec),
                  "#6366f1"
                );
                return (
                  <div key={group.itemId} className="space-y-2 rounded-lg border border-border p-2">
                    <div className="flex items-center gap-1">
                      <span className="min-w-0 flex-1 truncate text-[10px] font-medium" title={group.itemLabel ?? group.sourceLabel}>
                        {index + 1}. {group.itemLabel ?? group.sourceLabel}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        title="Move earlier"
                        disabled={index === 0}
                        onClick={() => moveDiagramItem(index, -1)}
                      >
                        <ArrowLeft className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        title="Move later"
                        disabled={index === diagramGroups.length - 1}
                        onClick={() => moveDiagramItem(index, 1)}
                      >
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      <label className="space-y-1 text-[9px] uppercase tracking-wider text-muted-foreground">
                        Fill
                        <input
                          type="color"
                          value={sourceColor}
                          className="h-7 w-full rounded border border-border bg-background"
                          onChange={(event) => updateItemStyle(group.itemId, { fillColor: event.target.value })}
                        />
                      </label>
                      <label className="space-y-1 text-[9px] uppercase tracking-wider text-muted-foreground">
                        Border
                        <input
                          type="color"
                          value={hexInputColor(style.borderColor ?? diagramSpec.borderColor, sourceColor)}
                          className="h-7 w-full rounded border border-border bg-background"
                          onChange={(event) => updateItemStyle(group.itemId, { borderColor: event.target.value })}
                        />
                      </label>
                      <label className="space-y-1 text-[9px] uppercase tracking-wider text-muted-foreground">
                        Text
                        <input
                          type="color"
                          value={hexInputColor(style.textColor ?? diagramSpec.textColor, "#0f172a")}
                          className="h-7 w-full rounded border border-border bg-background"
                          onChange={(event) => updateItemStyle(group.itemId, { textColor: event.target.value })}
                        />
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="space-y-1 text-[9px] uppercase tracking-wider text-muted-foreground">
                        Font size
                        <Input
                          type="number"
                          min={8}
                          max={72}
                          value={style.fontSize ?? diagramSpec.textSize}
                          className="h-7 text-xs"
                          onChange={(event) => updateItemStyle(group.itemId, { fontSize: Number(event.target.value) })}
                        />
                      </label>
                      <label className="space-y-1 text-[9px] uppercase tracking-wider text-muted-foreground">
                        Rotation
                        <Input
                          type="number"
                          min={-180}
                          max={180}
                          value={style.rotation ?? 0}
                          className="h-7 text-xs"
                          onChange={(event) => updateItemStyle(group.itemId, { rotation: Number(event.target.value) })}
                        />
                      </label>
                    </div>
                    {diagramSpec.layout === "flower" && (
                      <div className="space-y-1">
                        <p className="text-[9px] uppercase tracking-wider text-muted-foreground">
                          Preferred flower layer
                        </p>
                        <Select
                          value={style.flowerLayer ? String(style.flowerLayer) : "0"}
                          onValueChange={(value) => updateItemStyle(group.itemId, {
                            flowerLayer: value === "0" ? undefined : Number(value),
                          })}
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0">Auto</SelectItem>
                            {Array.from({ length: MAX_FLOWER_LAYERS }, (_, layerIndex) => {
                              const layer = layerIndex + 1;
                              return (
                                <SelectItem key={layer} value={String(layer)}>
                                  Layer {layer}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                        <p className="text-[9px] leading-relaxed text-muted-foreground">
                          Auto follows the item order. A chosen layer can expand the flower when needed.
                        </p>
                      </div>
                    )}
                    <button
                      type="button"
                      className="text-[9px] text-muted-foreground hover:text-foreground hover:underline"
                      onClick={() => updateItemStyle(group.itemId, {
                        fillColor: undefined,
                        borderColor: undefined,
                        textColor: undefined,
                        fontSize: undefined,
                        rotation: undefined,
                        flowerLayer: undefined,
                      })}
                    >
                      Reset item styling
                    </button>
                  </div>
                );
              })}
            </div>
          </Section>
        </div>
      </aside>
    );
  }

  const nodeType      = selectedNode.type ?? "";
  const isTextNode    = ["mindmap", "sticky", "text"].includes(nodeType);
  const isShapeNode   = nodeType === "shape";
  const isContentNode = isTextNode || isShapeNode;
  const isSanskrit    = ["sanskrit", "shloka", "grammar"].includes(nodeType);
  const currentNodeSize = getNodeDimensions(selectedNode);
  const autoSizeMode = resolveAutoSizeMode(d);

  const borderWidth   = typeof d.borderWidth   === "number" ? d.borderWidth   : 2;
  const borderRadius  = cornerRadiusPercentForNode(selectedNode);
  // Corner-radius only makes sense for rectangular-ish shapes.
  const shapeType     = (d.shapeType as string) ?? "";
  const supportsRadius = isTextNode || (isShapeNode && ["rounded", "rectangle"].includes(shapeType));
  const borderLayers  = (d.borderLayers as BorderLayer[]) ?? [];
  const fillRegions   = (d.internalFillRegions as InternalFillRegion[]) ?? [];
  const concentricLayers = (d.concentricLayers as ConcentricShapeLayer[]) ?? [];
  const radialChart = d.radialChart as RadialChartData | undefined;
  const activeRadialChart = normalizeRadialChart(radialChart, (d.text as string | undefined) ?? "");
  const isDrawing     = drawingModeNodeId === selectedNode.id;
  const fontGroups    = groupFontsByCategory(FONT_OPTIONS);
  const activeTextAlign = selectedTextRange?.textAlign ?? d.textAlign;
  const activeFontSize = selectedTextRange?.fontSize ?? ((d.fontSize as number) || 14);
  const activeFontFamily = selectedTextRange?.fontFamily ?? ((d.fontFamily as string) || "");
  const activeTextColor = selectedTextRange?.textColor
    ?? ((isRadialLayoutSector ? d.radialTextColor : d.textColor) as string | undefined)
    ?? "";
  const activeHighlightColor = selectedTextRange?.highlightColor ?? ((d.textHighlightColor as string) || "");
  const setRadialChart = (chart: RadialChartData) => setField("radialChart", chart);
  const enableRadialChart = (chart: RadialChartData) => {
    setRadialChart({ ...chart, enabled: true });
    resizeNodeToFitBounds(selectedNode.id, {
      width: RADIAL_CHART_MIN_SIZE,
      height: RADIAL_CHART_MIN_SIZE,
    });
  };
  const updateRadialRing = (ringIndex: number, patch: Partial<RadialChartRing>) => {
    const rings = activeRadialChart.rings ?? [];
    const nextRings = rings.map((ring, idx) => {
      if (idx !== ringIndex) return ring;
      const nextCount = patch.segmentCount ?? ring.segmentCount;
      const nextRing = { ...ring, ...patch, segmentCount: nextCount };
      return { ...nextRing, segments: normalizeRadialSegments(nextRing, nextCount) };
    });
    setRadialChart({ ...activeRadialChart, rings: nextRings, enabled: true });
  };
  const updateRadialSegment = (ringIndex: number, segmentIndex: number, patch: Partial<RadialChartSegment>) => {
    const rings = activeRadialChart.rings ?? [];
    const nextRings = rings.map((ring, idx) => {
      if (idx !== ringIndex) return ring;
      const segments = normalizeRadialSegments(ring).map((segment, sIdx) =>
        sIdx === segmentIndex ? { ...segment, ...patch } : segment
      );
      return { ...ring, segments };
    });
    setRadialChart({ ...activeRadialChart, rings: nextRings, enabled: true });
  };
  const updateRadialChildCount = (ringIndex: number, segmentIndex: number, value: number) => {
    const rings = [...(activeRadialChart.rings ?? [])];
    const ring = rings[ringIndex];
    const nextRing = rings[ringIndex + 1];
    if (!ring || !nextRing) return;

    const segments = normalizeRadialSegments(ring).map((segment, index) => {
      if (index !== segmentIndex) return segment;
      const childCount = Math.max(0, Math.min(360, Math.round(value)));
      return childCount === 0
        ? { ...segment, childCount: 0, mergedChildCount: radialSegmentAllocationCount(segment) }
        : { ...segment, childCount, mergedChildCount: undefined };
    });
    const childTotal = segments.reduce((sum, segment) => sum + radialSegmentAllocationCount(segment), 0);
    rings[ringIndex] = { ...ring, segments };
    rings[ringIndex + 1] = {
      ...nextRing,
      segmentCount: childTotal,
      segments: normalizeRadialSegments(nextRing, childTotal),
    };
    for (let parentIndex = ringIndex + 1; parentIndex < rings.length - 1; parentIndex += 1) {
      const parent = rings[parentIndex];
      const child = rings[parentIndex + 1];
      const parentSegments = normalizeRadialSegments(parent);
      if (!parentSegments.some((segment) => segment.childCount != null)) break;
      const descendantTotal = parentSegments.reduce(
        (sum, segment) => sum + radialSegmentAllocationCount(segment),
        0
      );
      rings[parentIndex + 1] = {
        ...child,
        segmentCount: descendantTotal,
        segments: normalizeRadialSegments(child, descendantTotal),
      };
    }
    setRadialChart({ ...activeRadialChart, rings, enabled: true });
  };

  return (
    <aside className="vidya-float-panel canvas-inspector-panel flex w-72 max-w-[calc(100vw-1rem)] flex-col">
      {/* ── Header ── */}
      <div className="flex items-center justify-between border-b px-3 py-2.5">
        <div>
          <h3 className="text-sm font-semibold capitalize">{isRadialLayoutSector ? "Radial sector" : nodeType}</h3>
          <p className="text-[10px] text-muted-foreground">{selectedNode.id.slice(0, 8)}…</p>
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title={d.locked ? "Unlock element" : "Lock element"}
            aria-label={d.locked ? "Unlock element" : "Lock element"}
            aria-pressed={d.locked === true}
            onClick={() => setField("locked", !d.locked)}>
            {d.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={deleteSelected}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className={cn("grid gap-1 border-b bg-background/95 p-2", isRadialLayoutSector ? "grid-cols-4" : "grid-cols-5")}>
        {INSPECTOR_TABS.filter((tab) => !isRadialLayoutSector || tab.id !== "shape").map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSingleNodeTab(tab.id)}
            className={cn(
              "rounded-md px-1.5 py-1.5 text-[10px] font-medium transition-colors",
              singleNodeTab === tab.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className={cn("grid gap-1 border-b bg-muted/25 p-2", isRadialLayoutSector ? "grid-cols-5" : "grid-cols-4")}>
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-1 text-[10px]"
          onClick={() => createChildNode(selectedNode.id)}
        >
          <Plus className="mr-1 h-3 w-3" /> Child
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-1 text-[10px]"
          disabled={!parentNode}
          onClick={() => createSiblingNode(selectedNode.id)}
        >
          <Rows3 className="mr-1 h-3 w-3" /> Sibling
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-1 text-[10px]"
          onClick={duplicateSelected}
        >
          <Copy className="mr-1 h-3 w-3" /> Copy
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-1 text-[10px]"
          onClick={() => {
            selectNodesById([selectedNode.id]);
            setSingleNodeTab("layout");
            setLayoutPanelOpen(true);
          }}
        >
          Layout
        </Button>
        {isRadialLayoutSector && radialChartNode && (
          <Button
            variant="default"
            size="sm"
            className="h-7 px-1 text-[10px]"
            title="Select and resize the whole radial chart"
            onClick={() => selectNodesById([radialChartNode.id])}
          >
            <Maximize2 className="mr-1 h-3 w-3" /> Chart
          </Button>
        )}
      </div>

      {isRadialLayoutSector && selectedRelationshipSourceIds.length > 0 && (
        <div className="border-b bg-muted/25 p-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-full justify-start gap-2 text-xs"
            onClick={() => openRelationshipDiagram({
              mode: "create",
              sourceNodeIds: selectedRelationshipSourceIds,
              ...(radialRootId ? { chartRootNodeId: radialRootId } : {}),
            })}
          >
            <Share2 className="h-3.5 w-3.5" />
            Generate relationship diagram
          </Button>
        </div>
      )}

      <div className="flex-1 divide-y overflow-y-auto">

        {isRadialLayoutSector && (
          <Section label="Children" visible={singleNodeTab === "layout"}>
            <div className="rounded-md border border-border bg-muted/25 p-2">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-medium text-foreground">Add several children</p>
                  <p className="text-[9px] text-muted-foreground">This parent currently has {childIds.length}.</p>
                </div>
                <span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold tabular-nums text-primary">
                  {bulkChildCount}
                </span>
              </div>
              <SliderControl
                value={bulkChildCount}
                min={1}
                max={24}
                step={1}
                onChange={(value) => setBulkChildCount(Math.round(value))}
              />
              <div className="mt-2 grid grid-cols-[1fr_auto] gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  className="h-7 text-[10px]"
                  onClick={() => {
                    createChildNodes(selectedNode.id, bulkChildCount, true);
                    toast.success(`Added ${bulkChildCount} child sector${bulkChildCount === 1 ? "" : "s"}.`);
                  }}
                >
                  <Plus className="mr-1 h-3 w-3" /> Add {bulkChildCount}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-[10px]"
                  onClick={() => createChildNode(selectedNode.id)}
                >
                  Add one
                </Button>
              </div>
            </div>
          </Section>
        )}

        <Section label="Hierarchy" visible={singleNodeTab === "layout"}>
          <div className="space-y-1.5 rounded-lg border border-border bg-muted/30 p-2 text-[10px]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Parent</span>
              <span className="truncate text-right text-foreground">{inspectorNodeTitle(parentNode)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Children</span>
              <span className="text-foreground">{childIds.length}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Descendants</span>
              <span className="text-foreground">{descendantIds.length}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Layout</span>
              <span className="truncate text-right text-foreground">{inspectorLayoutLabel(matrixRootNode ? "matrix" : d.layoutMode)}</span>
            </div>
          </div>
          {isRadialLayoutSector && parentNode && (
            <div className="grid grid-cols-2 gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-[10px]"
                disabled={!canMoveSiblingEarlier}
                title="Move backward (counter-clockwise)"
                onClick={() => moveSiblingNode(selectedNode.id, -1)}
              >
                <ArrowLeft className="mr-1 h-3 w-3" /> Back
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-[10px]"
                disabled={!canMoveSiblingLater}
                title="Move forward (clockwise)"
                onClick={() => moveSiblingNode(selectedNode.id, 1)}
              >
                Forward <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[10px]"
              disabled={!parentNode}
              onClick={() => {
                if (!parentNode) return;
                selectNodesById([parentNode.id]);
              }}
            >
              Select parent
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[10px]"
              disabled={!childIds.length}
              onClick={() => {
                selectNodesById(childIds);
              }}
            >
              Select children
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[10px]"
              onClick={() => {
                selectNodesById([selectedNode.id, ...descendantIds]);
              }}
            >
              Select branch
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[10px]"
              onClick={() => window.dispatchEvent(new CustomEvent("vidya:fitview", {
                detail: { nodeIds: [selectedNode.id, ...descendantIds] },
              }))}
            >
              Fit view
            </Button>
            <Button
              variant="default"
              size="sm"
              className="col-span-2 h-7 text-[10px]"
              onClick={() => {
                selectNodesById([selectedNode.id]);
                setLayoutPanelOpen(true);
              }}
            >
              Apply branch layout
            </Button>
          </div>
        </Section>

        {isContentNode && !isRadialLayoutSector && (
          <Section label="Presets" visible={singleNodeTab === "style"}>
            <div className="grid grid-cols-2 gap-1.5">
              {([
                ["Clean card", { fillColor: "#ffffff", fillOpacity: 1, borderColor: "#d1d5db", borderWidth: 1, cornerRadiusPercent: 25, textColor: "#111827", fontSize: 15 }],
                ["Outline", { fillColor: "#ffffff", fillOpacity: 0, borderColor: "#4262ff", borderWidth: 2, cornerRadiusPercent: 15, textColor: "#1f2937" }],
                ["Diagram", { fillColor: "#eef2ff", fillOpacity: 1, borderColor: "#4262ff", borderWidth: 2, cornerRadiusPercent: 20, textColor: "#1e1b4b", fontSize: 14 }],
                ["Sanskrit table", { fillColor: "#fff7ed", fillOpacity: 1, borderColor: "#9a3412", borderWidth: 1, cornerRadiusPercent: 5, textColor: "#431407", fontFamily: "var(--font-noto-devanagari), 'Noto Sans Devanagari', sans-serif", fontSize: 16 }],
              ] as Array<[string, Record<string, unknown>]>).map(([label, patch]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => {
                    pushHistory();
                    updateNodeData(selectedNode.id, patch);
                  }}
                  className="rounded-md border border-border px-2 py-2 text-left text-[10px] font-medium hover:border-primary/50 hover:bg-muted"
                >
                  {label}
                </button>
              ))}
            </div>
          </Section>
        )}

        {/* ── Text ── */}
        {(isContentNode || isRadialLayoutSector) && (
          <Section label="Text" visible={singleNodeTab === "text"}>
            <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-2 py-1.5">
              <span className="text-[10px] font-medium text-foreground">
                {selectedTextRange ? "Selected text" : isRadialLayoutSector ? "Whole sector" : "Whole object"}
              </span>
              <span className="text-[9px] text-muted-foreground">
                {selectedTextRange ? "Inline" : "All text"}
              </span>
            </div>
            {/* Alignment */}
            <Row label="Align">
              {([
                ["left",    <AlignLeft    key="l" className="h-3.5 w-3.5" />, "Left"],
                ["center",  <AlignCenter  key="c" className="h-3.5 w-3.5" />, "Center"],
                ["right",   <AlignRight   key="r" className="h-3.5 w-3.5" />, "Right"],
                ["justify", <AlignJustify key="j" className="h-3.5 w-3.5" />, "Justify"],
              ] as [string, React.ReactNode, string][]).map(([val, icon, title]) => (
                <IconBtn key={val} active={activeTextAlign === val} onClick={() => setField("textAlign", val)} title={title}>{icon}</IconBtn>
              ))}
            </Row>

            {/* Bold / Italic */}
            <Row label="Style">
              <IconBtn active={selectedTextRange ? selectedTextRange.bold : d.fontWeight === "bold"}
                onClick={() => setField("fontWeight", (selectedTextRange ? selectedTextRange.bold : d.fontWeight === "bold") ? "normal" : "bold")} title="Bold">
                <Bold className="h-3.5 w-3.5" />
              </IconBtn>
              <IconBtn active={selectedTextRange ? selectedTextRange.italic : d.fontStyle === "italic"}
                onClick={() => setField("fontStyle", (selectedTextRange ? selectedTextRange.italic : d.fontStyle === "italic") ? "normal" : "italic")} title="Italic">
                <Italic className="h-3.5 w-3.5" />
              </IconBtn>
            </Row>

            {/* Font size */}
            <div>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Size</p>
              <ThicknessControl
                value={activeFontSize}
                onChange={(v) => setField("fontSize", v)}
                max={96}
              />
            </div>

            {!selectedTextRange && (
              <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/25 p-2">
                <div>
                  <p className="text-[10px] font-medium text-foreground">Fill available text space</p>
                  <p className="text-[9px] leading-relaxed text-muted-foreground">
                    Uses this size as a preference, then fills the node or radial sector safely.
                  </p>
                </div>
                <Switch
                  checked={d.maximizeText === true}
                  onCheckedChange={(value) => setField("maximizeText", value)}
                  aria-label="Fill available text space"
                />
              </div>
            )}

            {isRadialLayoutSector && (
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Label angle</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[9px]"
                    onClick={() => setField("radialTextRotation", undefined)}
                  >
                    Auto
                  </Button>
                </div>
                <SliderControl
                  value={typeof d.radialTextRotation === "number" ? d.radialTextRotation : 0}
                  min={-180}
                  max={180}
                  step={1}
                  suffix="deg"
                  onChangeStart={pushHistory}
                  onChangeEnd={() => useCanvasStore.getState().setSaveStatus("unsaved")}
                  onChange={(value) => updateNodeData(selectedNode.id, { radialTextRotation: value })}
                />
                <p className="mt-1 text-[9px] leading-snug text-muted-foreground">
                  Drag the round handle on the label for direct rotation.
                </p>
              </div>
            )}

            {/* Font family */}
            <div>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Font family</p>
              <Select
                value={activeFontFamily || "__default_font__"}
                onValueChange={(value) => setField("fontFamily", value === "__default_font__" ? undefined : value)}
              >
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Default" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="__default_font__">Default</SelectItem>
                  {[...fontGroups.entries()].map(([cat, fonts]) => (
                    <div key={cat}>
                      <div className="px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted">{cat}</div>
                      {fonts.map((f) => (
                        <SelectItem key={f.value} value={f.value}>
                          <span style={{ fontFamily: f.value }}>{f.label}</span>
                        </SelectItem>
                      ))}
                    </div>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Text color */}
            <div>
              <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Text color</p>
              <ColorSwatchPicker value={activeTextColor} onChange={(v) => setField("textColor", v || undefined)} size="sm" />
            </div>

            <div>
              <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Highlight</p>
              <ColorSwatchPicker value={activeHighlightColor} onChange={(v) => setField("textHighlightColor", v || undefined)} size="sm" />
              {activeHighlightColor && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-1 h-6 px-2 text-[9px] text-muted-foreground"
                  onClick={() => setField("textHighlightColor", undefined)}
                >
                  Remove highlight
                </Button>
              )}
            </div>
          </Section>
        )}

        {matrixRootNode && selectedNode && (
          <Section label="Matrix table" visible={singleNodeTab === "layout"}>
            <div>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Branch orientation
              </p>
              <p className="mb-1.5 text-[9px] leading-snug text-muted-foreground">
                {selectedNode.id === matrixRootNode.id
                  ? "Sets the Matrix direction; children inherit it until overridden."
                  : "Sets how this cell's descendants grow inside the Matrix."}
              </p>
              <div className={cn("grid gap-1", selectedNode.id === matrixRootNode.id ? "grid-cols-2" : "grid-cols-3")}>
                <button
                  type="button"
                  onClick={() => {
                    pushHistory();
                    updateNodeData(selectedNode.id, { matrixOrientation: "horizontal" });
                    requestAnimationFrame(() => window.dispatchEvent(new CustomEvent("vidya:apply-measured-layout", {
                      detail: { mode: "matrix", rootId: matrixRootNode.id, nodeIds: matrixBranchIds },
                    })));
                  }}
                  className={cn(
                    "flex items-center justify-center gap-1 rounded-md border px-1 py-1.5 text-[9px]",
                    effectiveMatrixOrientation === "horizontal" && (selectedNode.id === matrixRootNode.id || explicitMatrixOrientation === "horizontal")
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted"
                  )}
                >
                  <ArrowRight className="h-3 w-3" /> Across
                </button>
                <button
                  type="button"
                  onClick={() => {
                    pushHistory();
                    updateNodeData(selectedNode.id, { matrixOrientation: "vertical" });
                    requestAnimationFrame(() => window.dispatchEvent(new CustomEvent("vidya:apply-measured-layout", {
                      detail: { mode: "matrix", rootId: matrixRootNode.id, nodeIds: matrixBranchIds },
                    })));
                  }}
                  className={cn(
                    "flex items-center justify-center gap-1 rounded-md border px-1 py-1.5 text-[9px]",
                    effectiveMatrixOrientation === "vertical" && (selectedNode.id === matrixRootNode.id || explicitMatrixOrientation === "vertical")
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted"
                  )}
                >
                  <ArrowDown className="h-3 w-3" /> Down
                </button>
                {selectedNode.id !== matrixRootNode.id && (
                  <button
                    type="button"
                    onClick={() => {
                      pushHistory();
                      updateNodeData(selectedNode.id, { matrixOrientation: undefined });
                      requestAnimationFrame(() => window.dispatchEvent(new CustomEvent("vidya:apply-measured-layout", {
                        detail: { mode: "matrix", rootId: matrixRootNode.id, nodeIds: matrixBranchIds },
                      })));
                    }}
                    className={cn(
                      "rounded-md border px-1 py-1.5 text-[9px]",
                      explicitMatrixOrientation === null
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:bg-muted"
                    )}
                  >
                    Inherit
                  </button>
                )}
              </div>
            </div>

            {selectedNode.id === matrixRootNode.id && (
              <div>
                <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Density</p>
                <div className="grid grid-cols-3 gap-1">
                  {(["compact", "comfortable", "presentation"] as const).map((density) => (
                    <button
                      key={density}
                      type="button"
                      onClick={() => {
                        updateNodeData(matrixRootNode.id, { matrixDensity: density, matrixDensityUserSet: true });
                        requestAnimationFrame(() => window.dispatchEvent(new CustomEvent("vidya:apply-measured-layout", {
                          detail: { mode: "matrix", rootId: matrixRootNode.id, nodeIds: matrixBranchIds },
                        })));
                      }}
                      className={cn(
                        "rounded-md border px-1 py-1.5 text-[9px] capitalize",
                        ((((matrixRootNode.data ?? {}) as Record<string, unknown>).matrixDensity as string) ?? "comfortable") === density
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:bg-muted"
                      )}
                    >
                      {density}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Section>
        )}

        {d.layoutMode === "list" && (
          <Section label="List density" visible={singleNodeTab === "layout"}>
            <div className="grid grid-cols-2 gap-1">
              {(["compact", "comfortable"] as const).map((density) => (
                <button
                  key={density}
                  type="button"
                  onClick={() => {
                    updateNodeData(selectedNode.id, { listDensity: density });
                    requestAnimationFrame(() => window.dispatchEvent(new CustomEvent("vidya:apply-measured-layout", {
                      detail: {
                        mode: "list",
                        rootId: selectedNode.id,
                        nodeIds: [selectedNode.id, ...descendantIds],
                      },
                    })));
                  }}
                  className={cn(
                    "rounded-md border px-1 py-1.5 text-[9px] capitalize",
                    ((d.listDensity as string) ?? "compact") === density
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted"
                  )}
                >
                  {density}
                </button>
              ))}
            </div>
          </Section>
        )}

        {isRadialLayoutSector && (
          <Section label="Color scheme" visible={singleNodeTab === "style"}>
            <div className="grid grid-cols-2 gap-1.5">
              {RADIAL_COLOR_SCHEMES.map((scheme) => (
                <button
                  key={scheme.id}
                  type="button"
                  title={`Apply ${scheme.label} to the full radial layout`}
                  onClick={() => applyRadialColorScheme(scheme.id)}
                  className={cn(
                    "overflow-hidden rounded-md border bg-background text-left transition-colors hover:border-primary/60",
                    activeRadialColorScheme.id === scheme.id ? "border-primary ring-1 ring-primary/30" : "border-border"
                  )}
                >
                  <span className="flex h-4 w-full">
                    {scheme.swatches.map((color) => (
                      <span key={color} className="h-full flex-1" style={{ backgroundColor: color }} />
                    ))}
                  </span>
                  <span className="block px-2 py-1.5 text-[9px] font-medium text-foreground">{scheme.label}</span>
                </button>
              ))}
            </div>
          </Section>
        )}

        {isRadialLayoutSector && (
          <Section label="Radial sector" visible={singleNodeTab === "style"}>
            <p className="text-[9px] leading-snug text-muted-foreground">
              Shift/Ctrl/Command-click sections in the chart to format them together.
            </p>
            <div>
              <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {selectedRadialDepth === 1 ? "Branch color" : selectedRadialDepth > 1 ? "Sector color override" : "Center color"}
              </p>
              <ColorSwatchPicker
                value={(d.radialFillColor as string) ?? ""}
                onChange={(value) => setField("radialFillColor", value || undefined)}
              />
              {selectedRadialDepth === 1 && (
                <p className="mt-1 text-[9px] leading-snug text-muted-foreground">
                  Descendants automatically receive coordinated gradient shades.
                </p>
              )}
            </div>
            <div>
              <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Border color</p>
              <ColorSwatchPicker
                value={(d.radialBorderColor as string) ?? "#ffffff"}
                onChange={(value) => setField("radialBorderColor", value || undefined)}
                size="sm"
              />
            </div>
            <div>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Border thickness</p>
              <ThicknessControl
                value={typeof d.radialBorderWidth === "number" ? d.radialBorderWidth : 1}
                onChange={(value) => setField("radialBorderWidth", value)}
                max={16}
              />
            </div>
            <div>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Border style</p>
              <BorderStylePicker
                value={(d.radialBorderStyle as string) ?? "solid"}
                onChange={(value) => setField("radialBorderStyle", value)}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 w-full text-[10px]"
              onClick={() => {
                pushHistory();
                updateNodeData(selectedNode.id, {
                  radialFillColor: undefined,
                  radialTextColor: undefined,
                  radialBorderColor: undefined,
                  radialBorderWidth: undefined,
                  radialBorderStyle: undefined,
                });
              }}
            >
              Use automatic colors
            </Button>
          </Section>
        )}

        {isRadialLayoutSector && (
          <Section label="Radial sizing" visible={singleNodeTab === "layout"}>
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Chart diameter</p>
                <span className="text-[9px] text-muted-foreground">Whole chart</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Input
                  key={`${radialChartNode?.id ?? "radial"}-diameter-${Math.round(radialChartSize)}`}
                  name="radial-chart-diameter"
                  type="number"
                  min={RADIAL_CHART_MIN_SIZE}
                  max={4096}
                  step={10}
                  defaultValue={Math.round(radialChartSize)}
                  className="h-8 text-xs"
                  onBlur={(event) => resizeHierarchyRadialChart(Number(event.currentTarget.value))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                  }}
                />
                <span className="text-[10px] text-muted-foreground">px</span>
              </div>
              <div className="mt-1.5 grid grid-cols-2 gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-[10px]"
                  onClick={() => resizeHierarchyRadialChart(radialChartSize * 0.9)}
                >
                  Smaller
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-[10px]"
                  onClick={() => resizeHierarchyRadialChart(radialChartSize * 1.1)}
                >
                  Larger
                </Button>
              </div>
              <p className="mt-1 text-[9px] leading-snug text-muted-foreground">
                Canvas corner handles remain available while this sector is selected.
              </p>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Center size</p>
                <span className="text-[9px] text-muted-foreground">Fixed chart share</span>
              </div>
              <SliderControl
                value={typeof radialRootData.radialCenterRatio === "number" ? radialRootData.radialCenterRatio : 28}
                min={14}
                max={58}
                step={1}
                suffix="%"
                onChangeStart={pushHistory}
                onChangeEnd={() => useCanvasStore.getState().setSaveStatus("unsaved")}
                onChange={(value) => {
                  if (radialRootId) updateNodeData(radialRootId, { radialCenterRatio: value });
                }}
              />
            </div>

            <div className="rounded-md border border-border bg-muted/30 px-2 py-1.5">
              <p className="text-[10px] font-medium">Compact one-page sizing</p>
              <p className="text-[9px] leading-snug text-muted-foreground">
                Depth controls redistribute the chart radius without changing the diameter above.
              </p>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-md border border-border px-2 py-1.5">
              <div>
                <p className="text-[10px] font-medium">Equal outermost segments</p>
                <p className="text-[9px] leading-snug text-muted-foreground">
                  Give every terminal segment the same angle, at any depth. Custom sector areas return when switched off.
                </p>
              </div>
              <Switch
                aria-label="Equal outermost segments"
                checked={radialChartData.radialEqualOutermostSegments === true}
                onCheckedChange={(checked) => {
                  if (!radialChartNode) return;
                  pushHistory();
                  updateNodeData(radialChartNode.id, { radialEqualOutermostSegments: checked });
                }}
              />
            </div>

            <div className="flex items-center justify-between gap-3 rounded-md border border-border px-2 py-1.5">
              <div>
                <p className="text-[10px] font-medium">Smart equal label sizes</p>
                <p className="text-[9px] leading-snug text-muted-foreground">
                  Use one readable size for all terminal labels. Chart font size is the maximum.
                </p>
              </div>
              <Switch
                aria-label="Smart equal outermost label sizes"
                checked={radialChartData.radialEqualOutermostLabelSizes === true}
                onCheckedChange={(checked) => {
                  if (!radialChartNode) return;
                  pushHistory();
                  updateNodeData(radialChartNode.id, { radialEqualOutermostLabelSizes: checked });
                }}
              />
            </div>

            <div className="flex items-center justify-between rounded-md border border-border px-2 py-1.5">
              <div>
                <p className="text-[10px] font-medium">Debug label boxes</p>
                <p className="text-[9px] text-muted-foreground">Show the actual fitted rectangles</p>
              </div>
              <Switch
                checked={!!radialRootData.radialDebugLabelBoxes}
                onCheckedChange={(checked) => {
                  if (!radialRootId) return;
                  pushHistory();
                  updateNodeData(radialRootId, { radialDebugLabelBoxes: checked });
                }}
              />
            </div>

            {!selectedIsRadialRoot && (
              <div className="space-y-2.5">
                {selectedRadialDepth > 0 && radialDepthCount > 1 && (
                  <div>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Depth {selectedRadialDepth} band</p>
                      <span className="text-[9px] text-muted-foreground">Redistributes fixed chart</span>
                    </div>
                    <SliderControl
                      value={selectedRingShare}
                      min={selectedRingMinShare}
                      max={selectedRingMaxShare}
                      step={1}
                      suffix="%"
                      onChangeStart={pushHistory}
                      onChangeEnd={() => useCanvasStore.getState().setSaveStatus("unsaved")}
                      onChange={(value) => {
                        if (!radialRootId) return;
                        const widths = [...radialRingWeights];
                        const index = selectedRadialDepth - 1;
                        const otherTotal = widths.reduce((sum, weight, weightIndex) =>
                          weightIndex === index ? sum : sum + weight, 0);
                        const targetShare = clampControlValue(
                          value / 100,
                          selectedRingMinShare / 100,
                          selectedRingMaxShare / 100
                        );
                        const flexibleShare = radialFlexibleRadius > 0
                          ? clampControlValue(
                              (targetShare * radialAvailableRadius - radialMinimumBand) / radialFlexibleRadius,
                              0.001,
                              0.999
                            )
                          : 1 / Math.max(1, radialDepthCount);
                        widths[index] = Math.max(
                          0.000001,
                          (flexibleShare * Math.max(0.000001, otherTotal)) / Math.max(0.001, 1 - flexibleShare)
                        );
                        const scale = Math.max(...widths, 0.000001);
                        updateNodeData(radialRootId, {
                          radialRingWidths: widths.map((weight) => Math.max(0.000001, weight / scale)),
                        });
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-1.5 h-7 w-full text-[10px]"
                      onClick={() => {
                        if (!radialRootId) return;
                        pushHistory();
                        updateNodeData(radialRootId, { radialRingWidths: undefined });
                      }}
                    >
                      Balance all depth bands
                    </Button>
                  </div>
                )}
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Sector area</p>
                  <span className="text-[9px] text-muted-foreground">Relative to siblings</span>
                </div>
                <SliderControl
                  value={typeof d.radialWeight === "number" ? d.radialWeight : 1}
                  min={0.2}
                  max={8}
                  step={0.1}
                  suffix="×"
                  onChangeStart={pushHistory}
                  onChangeEnd={() => useCanvasStore.getState().setSaveStatus("unsaved")}
                  onChange={(value) => updateNodeData(selectedNode.id, { radialWeight: value })}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-1.5 h-7 w-full text-[10px]"
                  onClick={() => setField("radialWeight", undefined)}
                >
                  Use automatic sector size
                </Button>
              </div>
            )}
          </Section>
        )}

        {/* ── Fill ── */}
        {isContentNode && !isRadialLayoutSector && (
          <Section label="Fill" visible={singleNodeTab === "style"}>
            <ColorSwatchPicker
              value={(d.fillColor as string) ?? ""}
              onChange={(v) => setField("fillColor", v || undefined)}
            />
            <div>
              <div className="mb-1 flex items-center justify-between">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Opacity</p>
              </div>
              <SliderControl
                value={Math.round((typeof d.fillOpacity === "number" ? d.fillOpacity : 0.18) * 100)}
                onChange={(value) => setField("fillOpacity", value / 100)}
                suffix="%"
              />
            </div>
          </Section>
        )}

        {isContentNode && !isRadialLayoutSector && (
          <Section label="Size" visible={singleNodeTab === "shape"}>
            <div>
              <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Fit</p>
              <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label="Text sizing mode">
                {([
                  ["smart", "Smart"],
                  ["height-only", "Keep width"],
                  ["fixed", "Fixed"],
                ] as Array<[AutoSizeMode, string]>).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={autoSizeMode === mode}
                    onClick={() => {
                      if (mode === "smart") fitNodeToStoredContent(selectedNode.id);
                      else setNodeAutoSizeMode(selectedNode.id, mode);
                    }}
                    className={cn(
                      "min-h-8 rounded-md border px-1.5 py-1 text-[10px] font-medium transition-colors",
                      autoSizeMode === mode
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[9px] leading-relaxed text-muted-foreground">
                Smart grows with content. Keep width grows vertically. Fixed fits text inside your chosen box.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label htmlFor={`node-width-${selectedNode.id}`} className="space-y-1">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Width</span>
                <Input
                  key={`${selectedNode.id}-width-${Math.round(currentNodeSize.width)}`}
                  id={`node-width-${selectedNode.id}`}
                  name="node-width"
                  type="number"
                  min={60}
                  defaultValue={Math.round(currentNodeSize.width)}
                  className="h-8 text-xs"
                  onBlur={(event) => {
                    const width = Number(event.currentTarget.value);
                    if (Number.isFinite(width) && width > 0 && Math.abs(width - currentNodeSize.width) > 1) {
                      setNodeSize(selectedNode.id, {
                        width,
                        height: ["circle", "diamond", "star", "flower"].includes(shapeType)
                          ? width
                          : currentNodeSize.height,
                      });
                    }
                  }}
                />
              </label>
              <label htmlFor={`node-height-${selectedNode.id}`} className="space-y-1">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Height</span>
                <Input
                  key={`${selectedNode.id}-height-${Math.round(currentNodeSize.height)}`}
                  id={`node-height-${selectedNode.id}`}
                  name="node-height"
                  type="number"
                  min={40}
                  defaultValue={Math.round(currentNodeSize.height)}
                  className="h-8 text-xs"
                  onBlur={(event) => {
                    const height = Number(event.currentTarget.value);
                    if (Number.isFinite(height) && height > 0 && Math.abs(height - currentNodeSize.height) > 1) {
                      setNodeSize(selectedNode.id, {
                        width: ["circle", "diamond", "star", "flower"].includes(shapeType)
                          ? height
                          : currentNodeSize.width,
                        height,
                      });
                    }
                  }}
                />
              </label>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-full gap-1.5 text-xs"
              onClick={() => {
                fitNodeToStoredContent(selectedNode.id);
                toast.success("Fitted to content.", {
                  action: { label: "Undo", onClick: () => useCanvasStore.getState().undo() },
                });
              }}
            >
              <Maximize2 className="h-3.5 w-3.5" /> Fit to content
            </Button>
          </Section>
        )}

        {/* ── Shape type (only for shape nodes) ── */}
        {isShapeNode && !isRadialLayoutSector && (
          <Section label="Shape type" visible={singleNodeTab === "shape"}>
            <div className="grid grid-cols-3 gap-1">
              {SHAPE_TYPES.map(({ label, value }) => (
                <button key={value}
                  onClick={() => {
                    convertNode(selectedNode.id, "shape", {
                      shapeType: value,
                      borderRadius: undefined,
                      ...(value === "rectangle" ? { cornerRadiusPercent: 0 } : {}),
                      ...(value === "rounded" ? { cornerRadiusPercent: Math.max(40, Number(d.cornerRadiusPercent) || 0) } : {}),
                      ...(value === "flower" && { petalCount: (d.petalCount as number | undefined) ?? 8 }),
                    });
                  }}
                  className={cn("rounded-lg border px-1 py-1.5 text-[10px] text-center hover:bg-muted",
                    d.shapeType === value ? "border-primary bg-primary/10 text-primary font-medium" : "border-border")}>
                  {label}
                </button>
              ))}
            </div>
            {shapeType === "flower" && (
              <div>
                <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Petals</p>
                <SliderControl
                  value={typeof d.petalCount === "number" ? d.petalCount : 8}
                  min={4}
                  max={16}
                  step={1}
                  onChange={(value) => setField("petalCount", value)}
                />
              </div>
            )}
          </Section>
        )}

        {isShapeNode && !isRadialLayoutSector && (
          <Section label="Transform" defaultOpen={false} visible={singleNodeTab === "shape"}>
            <div>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Rotation</p>
              <SliderControl
                value={typeof d.rotation === "number" ? d.rotation : 0}
                min={-180}
                max={180}
                step={1}
                suffix="deg"
                onChange={(value) => setField("rotation", value)}
              />
            </div>
          </Section>
        )}

        {isShapeNode && !isRadialLayoutSector && (
          <Section label="Concentric" defaultOpen={false} visible={singleNodeTab === "shape"}>
            <div className="flex items-center justify-between rounded-lg border border-border px-2 py-1.5">
              <span className="text-[10px] text-muted-foreground">{concentricLayers.length} inner shapes</span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => {
                  const nextLayer: ConcentricShapeLayer = {
                    id: generateId(),
                    shapeType: ((shapeType || "rounded") as ShapeType),
                    fillColor: "transparent",
                    fillOpacity: 0.16,
                    borderColor: (d.borderColor as string) ?? (d.color as string) ?? "#4262ff",
                    borderWidth: borderWidth || 2,
                    borderStyle: (d.borderStyle as ConcentricShapeLayer["borderStyle"]) ?? "solid",
                    text: "",
                    textColor: (d.textColor as string) ?? "#111827",
                    fontSize: (d.fontSize as number) ?? 14,
                  };
                  setField("concentricLayers", [...concentricLayers, nextLayer]);
                }}
              >
                <Plus className="mr-1 h-3 w-3" /> Add
              </Button>
            </div>
            {concentricLayers.length > 0 && (
              <div className="space-y-2">
                {concentricLayers.map((layer, index) => (
                  <div key={layer.id} className="rounded-lg border border-border p-2 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground">
                        Ring {index + 1} · inset {Math.round(concentricInset(index, concentricLayers.length) * 10) / 10}%
                      </span>
                      <button
                        className="text-[10px] text-destructive hover:underline"
                        onClick={() => setField("concentricLayers", concentricLayers.filter((_, idx) => idx !== index))}
                      >
                        Remove
                      </button>
                    </div>
                    <Input
                      aria-label={`Concentric ring ${index + 1} text`}
                      name={`concentric-ring-${index + 1}-text`}
                      value={layer.text ?? ""}
                      placeholder="Ring text..."
                      className="h-8 text-xs"
                      onChange={(event) => setField("concentricLayers", concentricLayers.map((item, idx) =>
                        idx === index ? { ...item, text: event.target.value } : item
                      ))}
                    />
                    <div className="grid grid-cols-3 gap-1.5">
                      <label className="space-y-1 text-[9px] uppercase tracking-wider text-muted-foreground">
                        Fill
                        <input
                          aria-label={`Concentric ring ${index + 1} fill color`}
                          name={`concentric-ring-${index + 1}-fill`}
                          type="color"
                          value={hexInputColor(layer.fillColor, "#ffffff")}
                          onChange={(event) => setField("concentricLayers", concentricLayers.map((item, idx) =>
                            idx === index ? { ...item, fillColor: event.target.value } : item
                          ))}
                          className="h-7 w-full rounded border border-border bg-background"
                        />
                      </label>
                      <label className="space-y-1 text-[9px] uppercase tracking-wider text-muted-foreground">
                        Border
                        <input
                          aria-label={`Concentric ring ${index + 1} border color`}
                          name={`concentric-ring-${index + 1}-border`}
                          type="color"
                          value={hexInputColor(layer.borderColor, "#4262ff")}
                          onChange={(event) => setField("concentricLayers", concentricLayers.map((item, idx) =>
                            idx === index ? { ...item, borderColor: event.target.value } : item
                          ))}
                          className="h-7 w-full rounded border border-border bg-background"
                        />
                      </label>
                      <label className="space-y-1 text-[9px] uppercase tracking-wider text-muted-foreground">
                        Text
                        <input
                          aria-label={`Concentric ring ${index + 1} text color`}
                          name={`concentric-ring-${index + 1}-text-color`}
                          type="color"
                          value={hexInputColor(layer.textColor, "#111827")}
                          onChange={(event) => setField("concentricLayers", concentricLayers.map((item, idx) =>
                            idx === index ? { ...item, textColor: event.target.value } : item
                          ))}
                          className="h-7 w-full rounded border border-border bg-background"
                        />
                      </label>
                    </div>
                    <div>
                      <p className="mb-1 text-[9px] text-muted-foreground">Text size</p>
                      <SliderControl
                        value={layer.fontSize ?? 14}
                        min={8}
                        max={48}
                        step={1}
                        suffix="px"
                        onChange={(value) => setField("concentricLayers", concentricLayers.map((item, idx) =>
                          idx === index ? { ...item, fontSize: value } : item
                        ))}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>
        )}

        {isShapeNode && !isRadialLayoutSector && (
          <Section label="Split chart" defaultOpen={false} visible={singleNodeTab === "shape"}>
            <div className="flex items-center justify-between rounded-lg border border-border px-2 py-1.5">
              <Label className="text-xs">Radial split</Label>
              <Switch
                checked={!!radialChart?.enabled}
                onCheckedChange={(checked) => {
                  if (checked) enableRadialChart(activeRadialChart);
                  else setRadialChart({ ...(radialChart ?? activeRadialChart), enabled: false });
                }}
              />
            </div>

            {radialChart?.enabled && (
              <div className="space-y-2">
                <div className="rounded-lg border border-border p-2 space-y-2">
                  <Input
                    aria-label="Radial chart center text"
                    name="radial-chart-center-text"
                    value={activeRadialChart.centerText ?? ""}
                    placeholder="Center text..."
                    className="h-8 text-xs"
                    onChange={(event) => setRadialChart({ ...activeRadialChart, centerText: event.target.value, enabled: true })}
                  />
                  <div className="grid grid-cols-2 gap-1.5">
                    <label className="space-y-1 text-[9px] uppercase tracking-wider text-muted-foreground">
                      Center fill
                      <input
                        aria-label="Radial chart center fill color"
                        name="radial-chart-center-fill"
                        type="color"
                        value={hexInputColor(activeRadialChart.centerColor, "#ffffff")}
                        onChange={(event) => setRadialChart({ ...activeRadialChart, centerColor: event.target.value, enabled: true })}
                        className="h-7 w-full rounded border border-border bg-background"
                      />
                    </label>
                    <label className="space-y-1 text-[9px] uppercase tracking-wider text-muted-foreground">
                      Text
                      <input
                        aria-label="Radial chart center text color"
                        name="radial-chart-center-text-color"
                        type="color"
                        value={hexInputColor(activeRadialChart.centerTextColor, "#111827")}
                        onChange={(event) => setRadialChart({ ...activeRadialChart, centerTextColor: event.target.value, enabled: true })}
                        className="h-7 w-full rounded border border-border bg-background"
                      />
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <label className="space-y-1 text-[9px] uppercase tracking-wider text-muted-foreground">
                      Split border
                      <input
                        aria-label="Radial chart split border color"
                        name="radial-chart-split-border-color"
                        type="color"
                        value={hexInputColor(activeRadialChart.segmentBorderColor, "#ffffff")}
                        onChange={(event) => setRadialChart({ ...activeRadialChart, segmentBorderColor: event.target.value, enabled: true })}
                        className="h-7 w-full rounded border border-border bg-background"
                      />
                    </label>
                    <div>
                      <p className="mb-1 text-[9px] uppercase tracking-wider text-muted-foreground">Border size</p>
                      <SliderControl
                        value={activeRadialChart.segmentBorderWidth ?? 0.8}
                        min={0}
                        max={20}
                        step={0.2}
                        onChange={(value) => setRadialChart({ ...activeRadialChart, segmentBorderWidth: value, enabled: true })}
                      />
                    </div>
                  </div>
                  <div>
                    <p className="mb-1 text-[9px] text-muted-foreground">Center size</p>
                    <SliderControl
                      value={activeRadialChart.centerRadius ?? 14}
                      min={0}
                      max={42}
                      step={1}
                      onChange={(value) => setRadialChart({ ...activeRadialChart, centerRadius: value, enabled: true })}
                    />
                  </div>
                  <div>
                    <p className="mb-1 text-[9px] text-muted-foreground">Center text size</p>
                    <SliderControl
                      value={activeRadialChart.centerFontSize ?? Math.round(Math.max(5, Math.min(36, (activeRadialChart.centerRadius ?? 14) * 0.38)) * 4)}
                      min={2}
                      max={64}
                      step={1}
                      suffix="px"
                      onChange={(value) => setRadialChart({ ...activeRadialChart, centerFontSize: value, enabled: true })}
                    />
                  </div>
                  <div>
                    <p className="mb-1 text-[9px] text-muted-foreground">Sector rotation</p>
                    <SliderControl
                      value={activeRadialChart.rotation ?? 0}
                      min={-180}
                      max={180}
                      step={1}
                      suffix="deg"
                      onChange={(value) => setRadialChart({ ...activeRadialChart, rotation: value, enabled: true })}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-border px-2 py-1.5">
                    <div>
                      <p className="text-[10px] font-medium">Debug label boxes</p>
                      <p className="text-[9px] text-muted-foreground">Show the computed long-axis label bounds</p>
                    </div>
                    <Switch
                      checked={!!activeRadialChart.debugLabelBoxes}
                      onCheckedChange={(checked) => setRadialChart({ ...activeRadialChart, debugLabelBoxes: checked, enabled: true })}
                    />
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-full text-xs"
                  onClick={() => {
                    const rings = activeRadialChart.rings ?? [];
                    const previous = rings.at(-1);
                    const ring: RadialChartRing = {
                      id: generateId(),
                      segmentCount: previous?.segmentCount ?? 8,
                    };
                    setRadialChart({
                      ...activeRadialChart,
                      enabled: true,
                      rings: [...rings, { ...ring, segments: normalizeRadialSegments(ring) }],
                    });
                  }}
                >
                  <Plus className="mr-1 h-3 w-3" /> Add ring
                </Button>

                <div className="space-y-2">
                  {(activeRadialChart.rings ?? []).map((ring, ringIndex) => {
                    const segments = normalizeRadialSegments(ring);
                    const parentAssignments = radialParentAssignments(activeRadialChart.rings ?? [], ringIndex);
                    return (
                      <details key={ring.id} className="group rounded-lg border border-border">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2 py-2 marker:content-none">
                          <span className="flex min-w-0 items-center gap-1.5 text-[10px] font-medium">
                            <ChevronRight className="h-3 w-3 shrink-0 transition-transform group-open:rotate-90" />
                            Chart ring {ringIndex + 1}
                            <span className="font-normal text-muted-foreground">{ring.segmentCount} sections · {ring.thickness ?? 1}×</span>
                          </span>
                          <button
                            className="text-[10px] text-destructive hover:underline"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              setRadialChart({
                                ...activeRadialChart,
                                enabled: true,
                                rings: (activeRadialChart.rings ?? []).filter((_, idx) => idx !== ringIndex),
                              });
                            }}
                          >
                            Remove
                          </button>
                        </summary>
                        <div className="space-y-2 border-t border-border/70 p-2">
                        <div>
                          <p className="mb-1 text-[9px] text-muted-foreground">Segments</p>
                          <ChildCountInput
                            ariaLabel={`Ring ${ringIndex + 1} segment count`}
                            name={`radial-ring-${ringIndex + 1}-segment-count`}
                            value={ring.segmentCount}
                            minValue={1}
                            onCommit={(value) => updateRadialRing(ringIndex, { segmentCount: value })}
                          />
                        </div>
                        <div>
                          <p className="mb-1 text-[9px] text-muted-foreground">Ring width</p>
                          <SliderControl
                            value={ring.thickness ?? 1}
                            min={0.1}
                            max={10}
                            step={0.1}
                            suffix="×"
                            onChange={(value) => updateRadialRing(ringIndex, { thickness: value })}
                          />
                        </div>
                        <div data-ring-segments className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
                          {segments.map((segment, segmentIndex) => {
                            const assignment = parentAssignments[segmentIndex];
                            const startsParentGroup = !!assignment && (
                              segmentIndex === 0 || parentAssignments[segmentIndex - 1]?.parentIndex !== assignment.parentIndex
                            );
                            const parentGroupKey = assignment ? `${ring.id}:${assignment.parentIndex}` : "";
                            const parentGroupOpen = !assignment || openRadialParentGroups.has(parentGroupKey);
                            return (
                            <div
                              key={segment.id}
                              className="space-y-1"
                              data-parent-group={assignment?.parentIndex}
                              data-child-index={assignment?.childIndex}
                              hidden={!!assignment && assignment.childIndex > 0 && !parentGroupOpen}
                            >
                              {startsParentGroup && (
                                <button
                                  type="button"
                                  className="sticky top-0 z-10 flex w-full items-center gap-1.5 rounded bg-muted px-1.5 py-1 text-left text-[9px] font-medium shadow-sm"
                                  onClick={() => {
                                    setOpenRadialParentGroups((current) => {
                                      const next = new Set(current);
                                      if (next.has(parentGroupKey)) next.delete(parentGroupKey);
                                      else next.add(parentGroupKey);
                                      return next;
                                    });
                                  }}
                                >
                                  <ChevronRight className={cn("h-3 w-3 shrink-0 transition-transform", parentGroupOpen && "rotate-90")} />
                                  <span
                                    className="h-2.5 w-2.5 shrink-0 rounded-sm border border-border"
                                    style={{ backgroundColor: assignment.parent.fillColor ?? "transparent" }}
                                  />
                                  <span className="min-w-0 flex-1 truncate">
                                    Ring {ringIndex} section {assignment.parentIndex + 1}: {assignment.parent.text?.trim() || "Untitled"}
                                  </span>
                                  <span className="shrink-0 text-muted-foreground">
                                    {assignment.childCount} {assignment.childCount === 1 ? "child" : "children"}
                                  </span>
                                </button>
                              )}
                            <div
                              data-child-editor
                              hidden={!!assignment && !parentGroupOpen}
                              className="space-y-1.5 rounded-md border border-border/70 p-1.5"
                            >
                              {assignment && (
                                <p className="text-[9px] text-muted-foreground">
                                  Child {assignment.childIndex + 1} of {assignment.childCount}
                                </p>
                              )}
                              <div className="grid grid-cols-[1fr_28px_28px] items-center gap-1.5">
                                <Input
                                  aria-label={`Ring ${ringIndex + 1} segment ${segmentIndex + 1} text`}
                                  name={`radial-ring-${ringIndex + 1}-segment-${segmentIndex + 1}-text`}
                                  value={segment.text ?? ""}
                                  placeholder="Enter label (blank is hidden)"
                                  className="h-7 text-xs"
                                  onChange={(event) => updateRadialSegment(ringIndex, segmentIndex, { text: event.target.value })}
                                />
                                <input
                                  aria-label={`Ring ${ringIndex + 1} segment ${segmentIndex + 1} fill color`}
                                  name={`radial-ring-${ringIndex + 1}-segment-${segmentIndex + 1}-fill`}
                                  type="color"
                                  value={hexInputColor(segment.fillColor, RADIAL_SEGMENT_COLORS[segmentIndex % RADIAL_SEGMENT_COLORS.length])}
                                  onChange={(event) => updateRadialSegment(ringIndex, segmentIndex, { fillColor: event.target.value })}
                                  className="h-7 w-7 rounded border border-border bg-background"
                                />
                                <input
                                  aria-label={`Ring ${ringIndex + 1} segment ${segmentIndex + 1} text color`}
                                  name={`radial-ring-${ringIndex + 1}-segment-${segmentIndex + 1}-text-color`}
                                  type="color"
                                  value={hexInputColor(segment.textColor, "#111827")}
                                  onChange={(event) => updateRadialSegment(ringIndex, segmentIndex, { textColor: event.target.value })}
                                  className="h-7 w-7 rounded border border-border bg-background"
                                />
                              </div>
                              {ringIndex < (activeRadialChart.rings ?? []).length - 1 && (
                                <div>
                                  <p className="mb-1 text-[9px] text-muted-foreground">
                                    Sections in ring {ringIndex + 2}
                                  </p>
                                  <div className="flex items-center gap-1.5">
                                    <div className="min-w-0 flex-1">
                                      <ChildCountInput
                                        ariaLabel={`Ring ${ringIndex + 1} segment ${segmentIndex + 1} child section count`}
                                        name={`radial-ring-${ringIndex + 1}-segment-${segmentIndex + 1}-children`}
                                        value={segment.childCount ?? 1}
                                        onCommit={(value) => updateRadialChildCount(ringIndex, segmentIndex, value)}
                                      />
                                    </div>
                                    <Button
                                      type="button"
                                      variant={segment.childCount === 0 ? "default" : "outline"}
                                      size="sm"
                                      className="h-7 px-2 text-[10px]"
                                      onClick={() => updateRadialChildCount(ringIndex, segmentIndex, 0)}
                                    >
                                      {segment.childCount === 0 ? "Merged" : "Merge"}
                                    </Button>
                                  </div>
                                  <p className="mt-1 text-[9px] text-muted-foreground">
                                    Set to 0 to merge through ring {ringIndex + 2}
                                  </p>
                                </div>
                              )}
                              <div>
                                <p className="mb-1 text-[9px] text-muted-foreground">Text size</p>
                                <SliderControl
                                  value={segment.fontSize ?? 16}
                                  min={1}
                                  max={64}
                                  step={1}
                                  suffix="px"
                                  onChange={(value) => updateRadialSegment(ringIndex, segmentIndex, { fontSize: value })}
                                />
                              </div>
                              <div>
                                <p className="mb-1 text-[9px] text-muted-foreground">Text angle</p>
                                <SliderControl
                                  value={segment.textRotation ?? 0}
                                  min={-180}
                                  max={180}
                                  step={5}
                                  suffix="deg"
                                  onChange={(value) => updateRadialSegment(ringIndex, segmentIndex, { textRotation: value })}
                                />
                              </div>
                            </div>
                            </div>
                          );})}
                        </div>
                        </div>
                      </details>
                    );
                  })}
                </div>
              </div>
            )}
          </Section>
        )}

        {/* ── Border ── */}
        {isContentNode && !isRadialLayoutSector && (
          <Section label="Border" visible={singleNodeTab === "style"}>
            <div>
              <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Color</p>
              <ColorSwatchPicker value={(d.borderColor as string) ?? ""} onChange={(v) => setField("borderColor", v || undefined)} />
            </div>

            <div>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Thickness</p>
              <ThicknessControl value={borderWidth} onChange={(v) => setField("borderWidth", v)} />
            </div>

            <div>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Style</p>
              <BorderStylePicker value={(d.borderStyle as string)} onChange={(v) => setField("borderStyle", v)} />
            </div>

            {supportsRadius && (
              <div>
                <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Corner radius</p>
                <SliderControl
                  value={borderRadius}
                  onChange={(value) => updateNodeData(selectedNode.id, { cornerRadiusPercent: value, borderRadius: undefined })}
                  onChangeStart={pushHistory}
                  suffix="%"
                />
                <div className="flex justify-between text-[9px] text-muted-foreground mt-0.5">
                  <span>Sharp</span><span>Pill</span>
                </div>
              </div>
            )}
          </Section>
        )}

        {/* ── Extra border layers ── */}
        {isContentNode && !isRadialLayoutSector && (
          <Section label="Extra borders" defaultOpen={false} visible={singleNodeTab === "style"}>
            {borderLayers.map((layer, i) => (
              <div key={layer.id} className="rounded-lg border border-border p-2 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">Layer {i + 1}</span>
                  <button onClick={() => setField("borderLayers", borderLayers.filter((_, idx) => idx !== i))}
                    className="text-[10px] text-destructive hover:underline">Remove</button>
                </div>
                <ColorSwatchPicker value={layer.color} onChange={(c) => setField("borderLayers", borderLayers.map((l, idx) => idx === i ? { ...l, color: c } : l))} size="sm" />
                <div>
                  <p className="mb-1 text-[10px] text-muted-foreground">Thickness</p>
                  <ThicknessControl value={layer.width}
                    onChange={(v) => setField("borderLayers", borderLayers.map((l, idx) => idx === i ? { ...l, width: v } : l))} />
                </div>
                <div>
                  <p className="mb-1 text-[10px] text-muted-foreground">Style</p>
                  <BorderStylePicker value={layer.style}
                    onChange={(s) => setField("borderLayers", borderLayers.map((l, idx) => idx === i ? { ...l, style: s } : l))} />
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-full h-7 text-xs"
              onClick={() => setField("borderLayers", [...borderLayers, { id: generateId(), color: "#6366f1", width: 2, style: "solid" } as BorderLayer])}>
              <Plus className="h-3 w-3 mr-1" /> Add border layer
            </Button>
          </Section>
        )}

        {/* ── Internal fill regions ── */}
        {isContentNode && !isRadialLayoutSector && (
          <Section label="Fill regions" defaultOpen={false} visible={singleNodeTab === "shape"}>
            {/* Region color */}
            <div>
              <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Region color</p>
              <ColorSwatchPicker value={drawingRegionColor} onChange={setDrawingRegionColor} size="sm" />
            </div>

            {/* Region opacity */}
            <div>
              <div className="mb-1 flex items-center justify-between">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Region opacity</p>
              </div>
              <SliderControl
                value={Math.round(drawingRegionOpacity * 100)}
                onChange={(value) => setDrawingRegionOpacity(value / 100)}
                suffix="%"
              />
            </div>

            {/* Draw / Stop freeform button */}
            <Button
              variant={isDrawing ? "destructive" : "default"}
              size="sm"
              className="w-full h-8 text-xs gap-1.5"
              onClick={() => setDrawingModeNodeId(isDrawing ? null : selectedNode.id)}
            >
              {isDrawing
                ? <><StopCircle className="h-3.5 w-3.5" />Stop drawing</>
                : <><Pencil className="h-3.5 w-3.5" />Free-draw region</>}
            </Button>
            {isDrawing && (
              <p className="text-[10px] text-muted-foreground text-center">
                Click &amp; drag inside the node to draw a region
              </p>
            )}

            {/* Add predefined shape regions */}
            <div>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Add shape fill</p>
              <div className="grid grid-cols-3 gap-1">
                {([
                  ["rect", "Rect"], ["circle", "Circle"], ["ellipse", "Ellipse"],
                  ["diamond", "Diamond"], ["triangle", "Triangle"],
                ] as [string, string][]).map(([kind, label]) => (
                  <button key={kind}
                    onClick={() => {
                      pushHistory();
                      updateNodeData(selectedNode.id, {
                        internalFillRegions: [...fillRegions, {
                          id: generateId(),
                          kind,
                          rect: { x: 30, y: 30, w: 40, h: 40 },
                          fillColor: drawingRegionColor,
                          opacity: drawingRegionOpacity,
                          createdAt: new Date().toISOString(),
                        } as InternalFillRegion],
                      });
                    }}
                    className="rounded-lg border border-border px-1 py-1.5 text-[10px] hover:bg-muted text-center">
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[9px] text-muted-foreground text-center">Select the node, then drag to move / resize</p>
            </div>

            {/* Existing regions */}
            {fillRegions.length > 0 && (
              <div className="space-y-2 pt-1">
                {fillRegions.map((r, i) => (
                  <div key={r.id} className="rounded-lg border border-border p-2 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <div className="h-5 w-5 flex-none rounded-full border border-border" style={{ backgroundColor: r.fillColor }} />
                      <span className="flex-1 text-[10px] text-muted-foreground capitalize">{r.kind ?? "free"} {i + 1}</span>
                      <button onClick={() => setField("internalFillRegions", fillRegions.filter((_, idx) => idx !== i))}
                        className="text-[10px] text-destructive hover:underline">Del</button>
                    </div>
                    <ColorSwatchPicker value={r.fillColor}
                      onChange={(c) => setField("internalFillRegions", fillRegions.map((x, idx) => idx === i ? { ...x, fillColor: c } : x))}
                      size="sm" />
                    <div>
                      <p className="mb-1 text-[9px] text-muted-foreground">Opacity</p>
                      <SliderControl
                        value={Math.round((r.opacity ?? 0.18) * 100)}
                        onChange={(value) => setField("internalFillRegions", fillRegions.map((x, idx) => idx === i ? { ...x, opacity: value / 100 } : x))}
                        suffix="%"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>
        )}

        {/* ── Convert to ── */}
        {isContentNode && !isRadialLayoutSector && (
          <Section label="Convert to" defaultOpen={false} visible={singleNodeTab === "data"}>
            <div className="grid grid-cols-2 gap-1">
              {CONVERT_TYPES.filter((t) => t.value !== nodeType).map(({ label, value }) => (
                <button key={value}
                  onClick={() => {
                    const extra: Record<string, unknown> = {};
                    if (value === "shape")   extra.shapeType = "rounded";
                    if (value === "mindmap") extra.color ??= "#818cf8";
                    if (value === "sticky")  extra.color ??= "yellow";
                    convertNode(selectedNode.id, value, extra);
                  }}
                  className="rounded-lg border border-border px-2 py-1.5 text-[10px] hover:bg-muted text-center">
                  {label}
                </button>
              ))}
            </div>
          </Section>
        )}

        {/* ── Sanskrit ── */}
        {isSanskrit && (
          <Section label="Sanskrit" visible={singleNodeTab === "data"}>
            {"devanagari" in d && <div><Label className="text-xs">Devanāgarī</Label>
              <Textarea aria-label="Devanagari text" name="devanagari" value={(d.devanagari as string) ?? ""} onChange={(e) => setField("devanagari", e.target.value)} className="mt-1 font-devanagari text-base" rows={2} /></div>}
            {"iast" in d && <div><Label className="text-xs">IAST</Label>
              <Textarea aria-label="IAST text" name="iast" value={(d.iast as string) ?? ""} onChange={(e) => setField("iast", e.target.value)} className="mt-1 italic text-sm" rows={2} /></div>}
            {"translation" in d && <div><Label className="text-xs">Translation</Label>
              <Textarea aria-label="Translation text" name="translation" value={(d.translation as string) ?? ""} onChange={(e) => setField("translation", e.target.value)} className="mt-1 text-sm" rows={2} /></div>}
            {"title" in d && <div><Label className="text-xs">Title</Label>
              <Input aria-label="Node title" name="node-title" value={(d.title as string) ?? ""} onChange={(e) => setField("title", e.target.value)} className="mt-1 h-8 text-sm" /></div>}
            {"displayMode" in d && <div><Label className="text-xs">Display mode</Label>
              <Select value={(d.displayMode as string) ?? "both-stacked"} onValueChange={(v) => setField("displayMode", v)}>
                <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="devanagari">Devanāgarī only</SelectItem>
                  <SelectItem value="iast">IAST only</SelectItem>
                  <SelectItem value="both-stacked">Both stacked</SelectItem>
                  <SelectItem value="both-side">Side-by-side</SelectItem>
                </SelectContent>
              </Select></div>}
          </Section>
        )}

        {/* ── Script ── */}
        {"scriptMode" in d && (
          <Section label="Script" defaultOpen={false} visible={singleNodeTab === "data"}>
            <Select value={(d.scriptMode as string) ?? "plain"} onValueChange={(v) => setField("scriptMode", v)}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="plain">Plain</SelectItem>
                <SelectItem value="devanagari">Devanāgarī</SelectItem>
                <SelectItem value="iast">IAST</SelectItem>
                <SelectItem value="mixed">Mixed</SelectItem>
              </SelectContent>
            </Select>
          </Section>
        )}

        {/* ── Tags ── */}
        <Section label="Tags" defaultOpen={false} visible={singleNodeTab === "data"}>
          <Input value={((d.tags as string[]) ?? []).join(", ")}
            aria-label="Tags"
            name="tags"
            onChange={(e) => setField("tags", e.target.value.split(",").map((t) => t.trim()).filter(Boolean))}
            placeholder="comma separated…" className="h-8 text-xs" />
          <div className="flex flex-wrap gap-1 pt-1">
            {SANSKRIT_TAG_SUGGESTIONS.slice(0, 8).map((tag) => (
              <button key={tag} className="rounded-full bg-muted px-2 py-0.5 text-[10px] hover:bg-accent font-devanagari"
                onClick={() => {
                  const tags = (d.tags as string[]) ?? [];
                  if (!tags.includes(tag)) setField("tags", [...tags, tag]);
                }}>{tag}</button>
            ))}
          </div>
        </Section>

        {/* ── Notes ── */}
        <Section label="Notes" defaultOpen={false} visible={singleNodeTab === "data"}>
          <Textarea value={(d.notes as string) ?? ""} onChange={(e) => setField("notes", e.target.value)}
            aria-label="Private notes" name="notes" rows={3} className="text-sm" placeholder="Private notes…" />
        </Section>
      </div>
    </aside>
  );
}
