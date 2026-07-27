"use client";

import { useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Lock,
  Maximize2,
  Palette,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Ungroup,
  Unlock,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useCanvasStore } from "@/store/canvas-store";
import { useUIStore } from "@/store/ui-store";
import { LAYOUT_OPTIONS, type LayoutMode } from "@/lib/layout";
import { buildHierarchy, getSubtree } from "@/lib/layout/hierarchy";
import { getNodeRect } from "@/lib/layout/geometry";
import { supportsAutomaticLayoutColors } from "@/lib/layout/layout-palette";
import { RADIAL_COLOR_SCHEMES, radialColorScheme } from "@/lib/radial-layout";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  routeTidiedFlowchartEdges,
  tidyFlowchart,
  type FlowchartTidyDirection,
} from "@/lib/canvas/flowchart-tidy";
import { smartRerouteBoardEdges } from "@/lib/canvas/smart-reroute";
import { FoldBranchControls } from "./FoldBranchControls";

const RADIAL_CHART_MIN_SIZE = 420;

function SettingsSection({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-muted/25">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left hover:bg-muted/60"
      >
        <span className="min-w-0">
          <span className="block text-xs font-medium text-foreground">{label}</span>
          {description && (
            <span className="mt-0.5 block truncate text-[9px] text-muted-foreground">{description}</span>
          )}
        </span>
        {open
          ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
      </button>
      {open && <div className="space-y-2 border-t border-border p-2">{children}</div>}
    </section>
  );
}

function clampControlValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function ExactNumberField({
  value,
  min,
  max,
  label,
  onCommit,
}: {
  value?: number;
  min: number;
  max: number;
  label: string;
  onCommit: (value: number | undefined) => void;
}) {
  const displayedValue = typeof value === "number"
    ? String(Math.round(value * 10) / 10)
    : "";
  const [draftValue, setDraftValue] = useState(displayedValue);
  const [editing, setEditing] = useState(false);
  const changedWhileEditingRef = useRef(false);
  const cancelNextBlurRef = useRef(false);

  return (
    <Input
      type="number"
      inputMode="decimal"
      aria-label={label}
      min={min}
      max={max}
      step={1}
      value={editing ? draftValue : displayedValue}
      placeholder="Auto"
      className="h-7 px-2 text-[10px]"
      onFocus={() => {
        changedWhileEditingRef.current = false;
        cancelNextBlurRef.current = false;
        setDraftValue(displayedValue);
        setEditing(true);
      }}
      onChange={(event) => {
        changedWhileEditingRef.current = true;
        setDraftValue(event.currentTarget.value);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          event.preventDefault();
          changedWhileEditingRef.current = false;
          cancelNextBlurRef.current = true;
          setDraftValue(displayedValue);
          event.currentTarget.blur();
        }
      }}
      onBlur={(event) => {
        if (cancelNextBlurRef.current) {
          cancelNextBlurRef.current = false;
          setEditing(false);
          return;
        }
        if (!changedWhileEditingRef.current) {
          setEditing(false);
          return;
        }
        const raw = event.currentTarget.value.trim();
        if (!raw) {
          if (value !== undefined) onCommit(undefined);
          setEditing(false);
          return;
        }
        const parsed = Number.parseFloat(raw);
        if (!Number.isFinite(parsed)) {
          setDraftValue(displayedValue);
          setEditing(false);
          return;
        }
        const next = clampControlValue(parsed, min, max);
        setDraftValue(String(next));
        setEditing(false);
        if (value === undefined || Math.abs(next - value) > 0.05) onCommit(next);
      }}
    />
  );
}

function SliderControl({
  value,
  min,
  max,
  step = 1,
  suffix = "",
  label,
  onChange,
  onChangeStart,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  label: string;
  onChange: (value: number) => void;
  onChangeStart?: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={onChangeStart}
        onKeyDown={(event) => {
          if (!event.repeat) onChangeStart?.();
        }}
        onChange={(event) => onChange(clampControlValue(Number(event.currentTarget.value), min, max))}
        className="h-1.5 flex-1 accent-primary"
      />
      <span className="w-10 text-right text-[10px] tabular-nums text-muted-foreground">
        {value}{suffix}
      </span>
    </div>
  );
}

// ── Schematic SVG previews (56×40) ────────────────────────────────────────────
const dot = (x: number, y: number, r = 3.2, fill = "#4262ff") => (
  <circle cx={x} cy={y} r={r} fill={fill} />
);
const line = (x1: number, y1: number, x2: number, y2: number) => (
  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#94a3b8" strokeWidth="1" />
);

function Preview({ mode }: { mode: LayoutMode }) {
  let content: React.ReactNode;
  switch (mode) {
    case "topDown":
      content = <>{line(28, 8, 12, 24)}{line(28, 8, 28, 24)}{line(28, 8, 44, 24)}{dot(28, 8)}{dot(12, 26)}{dot(28, 26)}{dot(44, 26)}</>;
      break;
    case "horizontal":
      content = <>{line(10, 20, 30, 8)}{line(10, 20, 30, 20)}{line(10, 20, 30, 32)}{dot(10, 20)}{dot(32, 8)}{dot(32, 20)}{dot(32, 32)}</>;
      break;
    case "vertical":
      content = <>{line(28, 6, 14, 20)}{line(28, 6, 42, 20)}{line(14, 20, 8, 34)}{line(42, 20, 48, 34)}{dot(28, 6)}{dot(14, 20)}{dot(42, 20)}{dot(8, 34)}{dot(48, 34)}</>;
      break;
    case "list":
      content = <>{dot(10, 8, 2.6)}{dot(18, 16, 2.6)}{dot(26, 24, 2.6)}{dot(18, 32, 2.6)}{line(10, 8, 10, 34)}</>;
      break;
    case "linear":
      content = <>{line(8, 20, 48, 20)}{dot(10, 20)}{dot(23, 20)}{dot(36, 20)}{dot(48, 20)}</>;
      break;
    case "radial":
      content = <>{line(28, 20, 12, 12)}{line(28, 20, 44, 12)}{line(28, 20, 14, 30)}{line(28, 20, 42, 30)}{dot(28, 20, 4)}{dot(12, 12)}{dot(44, 12)}{dot(14, 30)}{dot(42, 30)}</>;
      break;
    case "matrix":
      content = <>
        <rect x="6" y="5" width="44" height="7" rx="1" fill="#4262ff" />
        <rect x="6" y="14" width="14" height="20" rx="1" fill="#a5b4fc" />
        <rect x="22" y="14" width="12" height="6" rx="1" fill="#c7d2fe" />
        <rect x="36" y="14" width="14" height="6" rx="1" fill="#dbeafe" />
        <rect x="22" y="22" width="12" height="5" rx="1" fill="#c7d2fe" />
        <rect x="36" y="22" width="14" height="5" rx="1" fill="#dbeafe" />
        <rect x="22" y="29" width="12" height="5" rx="1" fill="#c7d2fe" />
        <rect x="36" y="29" width="14" height="5" rx="1" fill="#dbeafe" />
      </>;
      break;
    case "fromParentFreeForm":
      content = <>{line(28, 20, 12, 10)}{line(28, 20, 46, 14)}{line(28, 20, 20, 33)}{line(28, 20, 44, 32)}{dot(28, 20, 4.2, "#ef4444")}{dot(12, 10)}{dot(46, 14)}{dot(20, 33)}{dot(44, 32)}</>;
      break;
    default: // freeForm
      content = <>{dot(12, 12)}{dot(40, 10)}{dot(22, 28)}{dot(46, 30)}{dot(10, 32)}</>;
  }
  return (
    <svg viewBox="0 0 56 40" className="h-10 w-14 rounded-md border border-border bg-muted/40">
      {content}
    </svg>
  );
}

function nodeTitle(node: { data?: unknown; id: string } | null): string {
  if (!node) return "";
  const data = (node.data ?? {}) as Record<string, unknown>;
  const fields = ["text", "title", "topic", "label", "devanagari", "iast", "translation", "rule"];
  const title = fields
    .map((field) => data[field])
    .find((value): value is string => typeof value === "string" && value.trim().length > 0);
  return title?.replace(/\s+/g, " ").trim().slice(0, 48) || node.id.slice(0, 8);
}

function layoutLabel(mode: string | undefined): string {
  if (mode === "topDown") return "Vertical";
  return LAYOUT_OPTIONS.find((option) => option.mode === mode)?.label ?? "Free Form";
}

export function LayoutPanel() {
  const [tidyDirection, setTidyDirection] = useState<FlowchartTidyDirection>("auto");
  const open = useUIStore((s) => s.layoutPanelOpen);
  const setOpen = useUIStore((s) => s.setLayoutPanelOpen);
  const applyLayout = useCanvasStore((s) => s.applyLayout);
  const applyLayoutColorScheme = useCanvasStore((s) => s.applyLayoutColorScheme);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const setNodeSize = useCanvasStore((s) => s.setNodeSize);
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const selectedNodeIds = useCanvasStore((s) => s.selectedNodeIds);

  if (!open) return null;

  const selectedNode = selectedNodeIds.length === 1
    ? nodes.find((node) => node.id === selectedNodeIds[0]) ?? null
    : null;
  const hierarchy = buildHierarchy(nodes, edges);
  const branchIds = selectedNode ? getSubtree(selectedNode.id, hierarchy) : [];
  const affectedCount = branchIds.length;
  const currentMode = selectedNode
    ? ((selectedNode.data as Record<string, unknown> | undefined)?.layoutMode as string | undefined) ?? "freeForm"
    : undefined;
  const selectedData = (selectedNode?.data ?? {}) as Record<string, unknown>;
  const matrixRootId = typeof selectedData.matrixRootId === "string" ? selectedData.matrixRootId : null;
  const matrixRoot = matrixRootId
    ? nodes.find((node) => node.id === matrixRootId) ?? null
    : currentMode === "matrix" ? selectedNode : null;
  const matrixRootData = (matrixRoot?.data ?? {}) as Record<string, unknown>;
  const matrixBranchIds = matrixRoot ? getSubtree(matrixRoot.id, hierarchy) : [];
  const explicitMatrixOrientation = selectedData.matrixOrientation === "vertical"
    || selectedData.matrixOrientation === "horizontal"
    ? selectedData.matrixOrientation
    : null;
  let effectiveMatrixOrientation: "horizontal" | "vertical" = "horizontal";
  if (selectedNode && matrixRoot) {
    const lineage: string[] = [];
    let cursor: string | null = selectedNode.id;
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor)) {
      seen.add(cursor);
      lineage.unshift(cursor);
      if (cursor === matrixRoot.id) break;
      cursor = hierarchy.get(cursor)?.parentId ?? null;
    }
    for (const nodeId of lineage) {
      const orientation = (nodes.find((node) => node.id === nodeId)?.data as Record<string, unknown> | undefined)?.matrixOrientation;
      if (orientation === "horizontal" || orientation === "vertical") effectiveMatrixOrientation = orientation;
    }
  }
  const explicitMatrixChildFlow = selectedData.matrixChildFlow === "row" || selectedData.matrixChildFlow === "column"
    ? selectedData.matrixChildFlow
    : null;
  const effectiveMatrixChildFlow = explicitMatrixChildFlow
    ?? (effectiveMatrixOrientation === "horizontal" ? "column" : "row");
  let paletteRoot = matrixRoot;
  if (!paletteRoot && selectedNode) {
    const nodesById = new Map(nodes.map((node) => [node.id, node]));
    let ancestorId: string | null = selectedNode.id;
    const seen = new Set<string>();
    while (ancestorId && !seen.has(ancestorId)) {
      seen.add(ancestorId);
      const candidate = nodesById.get(ancestorId) ?? null;
      const candidateMode = ((candidate?.data ?? {}) as Record<string, unknown>).layoutMode as LayoutMode | undefined;
      if (candidate && supportsAutomaticLayoutColors(candidateMode)) {
        paletteRoot = candidate;
        break;
      }
      ancestorId = hierarchy.get(ancestorId)?.parentId ?? null;
    }
  }
  const paletteRootData = (paletteRoot?.data ?? {}) as Record<string, unknown>;
  const paletteMode = paletteRootData.layoutMode as LayoutMode | undefined;
  const selectedChildIds = selectedNode ? hierarchy.get(selectedNode.id)?.childIds ?? [] : [];
  const selectedChildCount = selectedChildIds.length;
  const canFoldSelectedBranch = selectedChildCount > 1
    && (paletteMode === "horizontal"
      || paletteMode === "vertical"
      || paletteMode === "topDown"
      || paletteMode === "list"
      || paletteMode === "linear"
      || paletteMode === "matrix");
  const listRoot = paletteMode === "list" ? paletteRoot : null;
  const listBranchIds = listRoot ? getSubtree(listRoot.id, hierarchy) : [];
  const activeColorScheme = radialColorScheme(
    paletteRootData.layoutColorScheme ?? paletteRootData.radialColorScheme
  ).id;
  const matrixRects = matrixBranchIds
    .map((nodeId) => nodes.find((node) => node.id === nodeId))
    .filter((node) => !!node && !node.hidden)
    .map((node) => getNodeRect(node!));
  const matrixRenderedWidth = matrixRects.length
    ? Math.max(...matrixRects.map((rect) => rect.right)) - Math.min(...matrixRects.map((rect) => rect.left))
    : undefined;
  const matrixRenderedHeight = matrixRects.length
    ? Math.max(...matrixRects.map((rect) => rect.bottom)) - Math.min(...matrixRects.map((rect) => rect.top))
    : undefined;
  const matrixTableWidth = typeof matrixRootData.matrixTableWidthOverride === "number"
    ? matrixRootData.matrixTableWidthOverride
    : matrixRenderedWidth;
  const matrixTableHeight = typeof matrixRootData.matrixTableHeightOverride === "number"
    ? matrixRootData.matrixTableHeightOverride
    : matrixRenderedHeight;
  const matrixTableSizeLocked = matrixRootData.matrixTableSizeLocked === true;
  const radialKey = typeof selectedData.sunburstHiddenFor === "string"
    ? selectedData.sunburstHiddenFor
    : paletteMode === "radial" ? paletteRoot?.id ?? null : null;
  const radialChartNode = radialKey
    ? nodes.find((node) => node.type === "sunburst"
      && (node.data as Record<string, unknown> | undefined)?.sunburstFor === radialKey) ?? null
    : null;
  const radialChartData = (radialChartNode?.data ?? {}) as Record<string, unknown>;
  const radialRootId = typeof radialChartData.rootId === "string"
    ? radialChartData.rootId
    : paletteMode === "radial" ? paletteRoot?.id ?? null : null;
  const radialRoot = radialRootId
    ? nodes.find((node) => node.id === radialRootId) ?? null
    : null;
  const radialRootData = (radialRoot?.data ?? {}) as Record<string, unknown>;
  const radialChartSize = typeof radialChartData.chartSize === "number"
    ? radialChartData.chartSize
    : 1000;

  const requestMeasuredLayout = (mode: "list" | "matrix", rootId: string, nodeIds: string[]) => {
    window.dispatchEvent(new CustomEvent("vidya:apply-measured-layout", {
      detail: { mode, rootId, nodeIds },
    }));
  };
  const requestMatrixReflow = () => {
    if (!matrixRoot) return;
    requestAnimationFrame(() => requestMeasuredLayout("matrix", matrixRoot.id, matrixBranchIds));
  };
  const resizeRadialChart = (diameter: number) => {
    if (!radialChartNode || !Number.isFinite(diameter)) return;
    const nextDiameter = clampControlValue(Math.round(diameter), RADIAL_CHART_MIN_SIZE, 4096);
    if (Math.abs(nextDiameter - radialChartSize) < 1) return;
    setNodeSize(radialChartNode.id, { width: nextDiameter, height: nextDiameter });
  };

  const handleApply = (mode: LayoutMode) => {
    if (!selectedNode) {
      toast.error("Select one parent node first to apply a branch layout.");
      return;
    }
    if (mode === "list" || mode === "matrix") {
      // React Flow owns the authoritative rendered measurements. Ask the canvas
      // to refresh them, then apply the outline on the following frames.
      requestMeasuredLayout(mode, selectedNode.id, branchIds);
    } else {
      applyLayout(mode, selectedNode.id);
    }
    toast.success(`Applied ${layoutLabel(mode)} to ${affectedCount} node${affectedCount === 1 ? "" : "s"}.`, {
      description: (mode === "list" || mode === "matrix") && affectedCount > 30
        ? "The branch is large, so a readable zoom was preserved."
        : (mode === "horizontal" || mode === "vertical") && affectedCount > 30
          ? "The branch is large; pan to inspect it or use Fit for an overview."
          : undefined,
      action: {
        label: "Undo",
        onClick: () => useCanvasStore.getState().undo(),
      },
    });
  };

  const handleTidyFlowchart = () => {
    const layout = tidyFlowchart(nodes, edges, { direction: tidyDirection });
    if (layout.layoutNodeIds.length < 2) {
      toast.error("Connect at least two flowchart objects before using Tidy up.");
      return;
    }

    const layoutIds = new Set(layout.layoutNodeIds);
    const routeEdgeIndices = edges.flatMap((edge, index) => (
      !edge.hidden && layoutIds.has(edge.source) && layoutIds.has(edge.target) ? [index] : []
    ));
    const preparedEdges = routeEdgeIndices.map((index) => {
      const edge = edges[index];
      const sourceRank = layout.rankByNodeId[edge.source];
      const targetRank = layout.rankByNodeId[edge.target];
      const adjacent = targetRank - sourceRank === 1;
      const layoutMode: LayoutMode = adjacent
        ? layout.direction === "vertical" ? "topDown" : "horizontal"
        : "freeForm";
      return {
        ...edge,
        data: {
          ...(edge.data ?? {}),
          layoutMode,
          manualRoute: !adjacent,
        },
      };
    });
    const rerouted = smartRerouteBoardEdges(layout.nodes, preparedEdges, {
      resetManualAdjustments: true,
    });
    const plannedRoutes = routeTidiedFlowchartEdges(layout.nodes, rerouted.edges, layout);
    const routeEdgeIndexSet = new Set(routeEdgeIndices);
    let reroutedIndex = 0;
    const nextEdges = edges.map((edge, index) => (
      routeEdgeIndexSet.has(index) ? plannedRoutes.edges[reroutedIndex++] : edge
    ));

    useCanvasStore.getState().pushHistory();
    useCanvasStore.setState({
      nodes: layout.nodes,
      edges: nextEdges,
      saveStatus: "unsaved",
    });

    const details = [
      `${layout.direction === "vertical" ? "Top-to-bottom" : "Left-to-right"} layers`,
      layout.componentCount > 1 ? `${layout.componentCount} connected groups packed separately` : null,
      layout.lockedNodeCount ? `${layout.lockedNodeCount} locked object${layout.lockedNodeCount === 1 ? "" : "s"} kept in place` : null,
      layout.movedNoteCount ? `${layout.movedNoteCount} attached note${layout.movedNoteCount === 1 ? "" : "s"} spaced with its source` : null,
      plannedRoutes.semanticBranchCount ? `${plannedRoutes.semanticBranchCount} labeled decision branch${plannedRoutes.semanticBranchCount === 1 ? "" : "es"} separated` : null,
      plannedRoutes.laneRoutedCount ? `${plannedRoutes.laneRoutedCount} cross-link${plannedRoutes.laneRoutedCount === 1 ? "" : "s"} moved to outer lanes` : null,
    ].filter(Boolean).join(" · ");
    toast.success(`Tidied ${layout.layoutNodeIds.length} flowchart object${layout.layoutNodeIds.length === 1 ? "" : "s"}.`, {
      description: `${details}. Connector labels were re-anchored to rebuilt paths; styles were preserved.`,
      action: { label: "Undo", onClick: () => useCanvasStore.getState().undo() },
    });
  };

  return (
    <aside className="vidya-float-panel layout-panel flex max-h-[calc(100dvh-100px)] w-64 flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2.5">
        <div>
          <h3 className="text-sm font-semibold">Layout</h3>
          {selectedNode ? (
            <p className="text-[10px] text-muted-foreground">
              Selected branch · {affectedCount} node{affectedCount === 1 ? "" : "s"}
            </p>
          ) : (
            <p className="text-[10px] text-muted-foreground">Tidy the board or select a branch</p>
          )}
        </div>
        <button onClick={() => setOpen(false)} className="rounded-md p-1 text-muted-foreground hover:bg-muted">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        <SettingsSection
          label="Tidy flowchart"
          description="Arrange the whole connected board"
        >
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" /> Tidy up flowchart
          </div>
          <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
            Builds clear layers, keeps notes out of flow corridors, separates labeled decision branches, and lanes cross-links around the chart.
          </p>
          <div className="mt-2 grid grid-cols-3 gap-1">
            {([
              ["auto", "Auto"],
              ["vertical", "Down"],
              ["horizontal", "Across"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setTidyDirection(value)}
                className={cn(
                  "rounded-md border px-1.5 py-1.5 text-[9px]",
                  tidyDirection === value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:bg-muted"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={!edges.some((edge) => !edge.hidden)}
            onClick={handleTidyFlowchart}
            className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-primary px-2 text-[10px] font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" /> Tidy up entire flowchart
          </button>
          <p className="mt-1.5 text-[9px] leading-snug text-muted-foreground">
            Locked objects stay fixed. Attached notes keep their relative position. Undo restores node placement and connector bends.
          </p>
        </SettingsSection>

        {selectedNode ? (
          <div className="rounded-lg border border-border bg-muted/35 p-2">
            <div className="truncate text-xs font-medium text-foreground">{nodeTitle(selectedNode)}</div>
            <div className="mt-1 grid grid-cols-2 gap-1 text-[10px] text-muted-foreground">
              <span>Descendants</span>
              <span className="text-right text-foreground">{Math.max(0, affectedCount - 1)}</span>
              <span>Current</span>
              <span className="text-right text-foreground">{layoutLabel(currentMode)}</span>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-[10px] text-amber-900">
            Branch layouts require one selected parent. Tidy up above works on the whole connected flowchart.
          </div>
        )}

        <SettingsSection
          label="Choose layout"
          description={selectedNode ? `Current: ${layoutLabel(currentMode)}` : "Select one parent node first"}
        >
          <div className="flex flex-col gap-1">
            {LAYOUT_OPTIONS.map((opt) => (
              <button
                key={opt.mode}
                onClick={() => handleApply(opt.mode)}
                className={cn(
                  "flex items-center gap-3 rounded-lg border border-transparent p-2 text-left transition-colors",
                  currentMode === opt.mode ? "border-primary/40 bg-primary/5" : "hover:border-border hover:bg-accent"
                )}
              >
                <Preview mode={opt.mode} />
                <div className="min-w-0">
                  <div className="text-xs font-medium text-foreground">{opt.label}</div>
                  <div className="truncate text-[10px] text-muted-foreground">{opt.description}</div>
                </div>
              </button>
            ))}
          </div>
        </SettingsSection>

        {selectedNode && canFoldSelectedBranch && (
          <SettingsSection
            label="Fold branch"
            description={`${selectedChildCount} direct children`}
          >
            <FoldBranchControls
              parentId={selectedNode.id}
              parentData={selectedData}
              childIds={selectedChildIds}
              nodes={nodes}
            />
          </SettingsSection>
        )}

        {selectedNode && currentMode === "radial" && (
          <SettingsSection label="Radial help" description="Dense-label guidance and shortcuts">
            <div className="text-xs font-medium text-foreground">Radial help</div>
            <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
              Sunburst labels shrink or hide when sectors get small. Zoom in, or convert the branch to Matrix/List for dense text.
            </p>
            <div className="mt-2 grid grid-cols-3 gap-1">
              <button className="rounded-md border border-border px-1.5 py-1 text-[10px] hover:bg-background" onClick={() => handleApply("matrix")}>
                Matrix
              </button>
              <button className="rounded-md border border-border px-1.5 py-1 text-[10px] hover:bg-background" onClick={() => handleApply("list")}>
                List
              </button>
              <button
                className="rounded-md border border-border px-1.5 py-1 text-[10px] hover:bg-background"
                onClick={() => window.dispatchEvent(new CustomEvent("vidya:fitview", {
                  detail: {
                    nodeIds: [`sunburst-${selectedNode.id}`],
                    mode: "radial",
                    rootId: selectedNode.id,
                    forceFit: true,
                  },
                }))}
              >
                Fit radial
              </button>
            </div>
          </SettingsSection>
        )}

        {radialChartNode && radialRoot && (
          <SettingsSection
            label="Radial settings"
            description="Whole-chart size and sector distribution"
          >
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Chart diameter
                </p>
                <span className="text-[9px] text-muted-foreground">Whole chart</span>
              </div>
              <ExactNumberField
                value={radialChartSize}
                min={RADIAL_CHART_MIN_SIZE}
                max={4096}
                label="Radial chart diameter"
                onCommit={(value) => {
                  if (value !== undefined) resizeRadialChart(value);
                }}
              />
              <div className="mt-1.5 grid grid-cols-3 gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-1 text-[9px]"
                  onClick={() => resizeRadialChart(radialChartSize * 0.9)}
                >
                  Smaller
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-1 text-[9px]"
                  onClick={() => resizeRadialChart(radialChartSize * 1.1)}
                >
                  Larger
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-1 text-[9px]"
                  onClick={() => window.dispatchEvent(new CustomEvent("vidya:fitview", {
                    detail: {
                      nodeIds: [radialChartNode.id],
                      mode: "radial",
                      rootId: radialRoot.id,
                      forceFit: true,
                    },
                  }))}
                >
                  Fit
                </Button>
              </div>
            </div>

            <div>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Center size
              </p>
              <SliderControl
                value={typeof radialRootData.radialCenterRatio === "number"
                  ? radialRootData.radialCenterRatio
                  : 28}
                min={14}
                max={58}
                suffix="%"
                label="Radial chart center size"
                onChangeStart={() => useCanvasStore.getState().pushHistory()}
                onChange={(value) => updateNodeData(radialRoot.id, { radialCenterRatio: value })}
              />
            </div>

            <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background/60 p-2">
              <div>
                <p className="text-[10px] font-medium text-foreground">Equal outermost segments</p>
                <p className="mt-0.5 text-[9px] leading-snug text-muted-foreground">
                  Give every terminal segment the same angle at any depth.
                </p>
              </div>
              <Switch
                checked={radialChartData.radialEqualOutermostSegments === true}
                onCheckedChange={(checked) => {
                  useCanvasStore.getState().pushHistory();
                  updateNodeData(radialChartNode.id, { radialEqualOutermostSegments: checked });
                }}
                aria-label="Equal outermost radial segments"
              />
            </div>

            <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background/60 p-2">
              <div>
                <p className="text-[10px] font-medium text-foreground">Smart equal label sizes</p>
                <p className="mt-0.5 text-[9px] leading-snug text-muted-foreground">
                  Use one readable size for all terminal labels.
                </p>
              </div>
              <Switch
                checked={radialChartData.radialEqualOutermostLabelSizes === true}
                onCheckedChange={(checked) => {
                  useCanvasStore.getState().pushHistory();
                  updateNodeData(radialChartNode.id, { radialEqualOutermostLabelSizes: checked });
                }}
                aria-label="Smart equal outermost radial label sizes"
              />
            </div>
          </SettingsSection>
        )}

        {paletteRoot && supportsAutomaticLayoutColors(paletteMode) && (
          <SettingsSection
            label="Layout colors"
            description={`Whole ${layoutLabel(paletteMode)} hierarchy`}
          >
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <Palette className="h-3.5 w-3.5" /> Layout colors
              </div>
              <button
                type="button"
                title="Restore automatic colors"
                aria-label="Restore automatic colors"
                onClick={() => {
                  applyLayoutColorScheme(paletteRoot!.id, activeColorScheme, true);
                  toast.success("Restored automatic hierarchy colors.", {
                    action: { label: "Undo", onClick: () => useCanvasStore.getState().undo() },
                  });
                }}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1">
              {RADIAL_COLOR_SCHEMES.map((scheme) => (
                <button
                  key={scheme.id}
                  type="button"
                  title={`${scheme.label} hierarchy colors`}
                  aria-label={`${scheme.label} hierarchy colors`}
                  onClick={() => applyLayoutColorScheme(paletteRoot!.id, scheme.id)}
                  className={cn(
                    "flex min-w-0 items-center gap-1.5 rounded-md border bg-background px-1.5 py-1.5 text-left text-[9px]",
                    activeColorScheme === scheme.id
                      ? "border-primary ring-1 ring-primary/20"
                      : "border-border hover:bg-muted"
                  )}
                >
                  <span className="flex shrink-0 -space-x-0.5">
                    {scheme.swatches.slice(0, 3).map((color) => (
                      <span
                        key={color}
                        className="h-3 w-3 rounded-full border border-background"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </span>
                  <span className="truncate">{scheme.label}</span>
                </button>
              ))}
            </div>
          </SettingsSection>
        )}

        {listRoot && (
          <SettingsSection label="List settings" description="Density, reflow, and fit">
            <div className="mb-2 text-xs font-medium text-foreground">List density</div>
            <div className="grid grid-cols-2 gap-1">
              {(["compact", "comfortable"] as const).map((density) => (
                <button
                  key={density}
                  type="button"
                  onClick={() => {
                    updateNodeData(listRoot.id, { listDensity: density });
                    requestAnimationFrame(() => requestMeasuredLayout("list", listRoot.id, listBranchIds));
                  }}
                  className={cn(
                    "rounded-md border bg-background px-1.5 py-1.5 text-[9px] capitalize",
                    (((listRoot.data as Record<string, unknown>).listDensity as string | undefined) ?? "compact") === density
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted"
                  )}
                >
                  {density}
                </button>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={() => requestMeasuredLayout("list", listRoot.id, listBranchIds)}
                className="flex items-center justify-center gap-1 rounded-md border border-border bg-background px-1 py-1.5 text-[9px] hover:bg-muted"
              >
                <RefreshCw className="h-3 w-3" /> Reflow
              </button>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent("vidya:fitview", {
                  detail: { nodeIds: listBranchIds, mode: "list", rootId: listRoot.id, forceFit: true },
                }))}
                className="flex items-center justify-center gap-1 rounded-md border border-border bg-background px-1 py-1.5 text-[9px] hover:bg-muted"
              >
                <Maximize2 className="h-3 w-3" /> Fit
              </button>
            </div>
          </SettingsSection>
        )}

        {matrixRoot && (
          <SettingsSection
            label="Matrix settings"
            description="Table-wide layout, density, and sizing"
          >
            <div className="mb-2 text-xs font-medium text-foreground">Matrix table</div>

            <div className="mb-2 flex items-center justify-between gap-3 rounded-md border border-border/70 bg-background/60 p-1.5">
              <div>
                <div className="text-[10px] font-medium text-foreground">Cell divisions</div>
                <div className="mt-0.5 text-[9px] leading-snug text-muted-foreground">
                  Draw Matrix-owned boundaries around every cell without changing shape borders.
                </div>
              </div>
              <Switch
                checked={matrixRootData.matrixGridVisible !== false}
                onCheckedChange={(checked) => {
                  useCanvasStore.getState().pushHistory();
                  updateNodeData(matrixRoot.id, {
                    matrixGridVisible: checked ? undefined : false,
                  });
                  requestAnimationFrame(() => requestMeasuredLayout("matrix", matrixRoot.id, matrixBranchIds));
                }}
                aria-label="Show Matrix cell divisions"
              />
            </div>
            <div className="mb-2 flex items-center justify-between gap-3 rounded-md border border-border/70 bg-background/60 p-1.5">
              <div>
                <div className="text-[10px] font-medium text-foreground">Pack compact letter groups</div>
                <div className="mt-0.5 text-[9px] leading-snug text-muted-foreground">
                  Place short Devanagari terminal groups in rows on this Matrix only.
                </div>
              </div>
              <Switch
                checked={matrixRootData.matrixPackCompactGroups === true}
                onCheckedChange={(checked) => {
                  useCanvasStore.getState().pushHistory();
                  updateNodeData(matrixRoot.id, {
                    matrixPackCompactGroups: checked ? true : undefined,
                  });
                  requestAnimationFrame(() => requestMeasuredLayout("matrix", matrixRoot.id, matrixBranchIds));
                }}
                aria-label="Pack compact letter groups in this Matrix"
              />
            </div>
            <div className="mb-2 rounded-md border border-border/70 bg-background/60 p-1.5">
              <div className="text-[10px] font-medium text-foreground">Incomplete rows</div>
              <div className="mt-0.5 text-[9px] leading-snug text-muted-foreground">
                Stretch existing children or preserve missing trailing positions as empty cells.
              </div>
              <div className="mt-1.5 grid grid-cols-2 gap-1">
                {([
                  ["stretch", "Stretch cells"],
                  ["empty", "Empty slots"],
                ] as const).map(([mode, label]) => {
                  const active = (matrixRootData.matrixIncompleteRowMode ?? "stretch") === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        useCanvasStore.getState().pushHistory();
                        updateNodeData(matrixRoot.id, {
                          matrixIncompleteRowMode: mode === "stretch" ? undefined : "empty",
                        });
                        requestAnimationFrame(() => requestMeasuredLayout("matrix", matrixRoot.id, matrixBranchIds));
                      }}
                      className={cn(
                        "rounded-md border px-1 py-1.5 text-[9px]",
                        active
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-background hover:bg-muted"
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="mb-2 flex items-center justify-between gap-3 rounded-md border border-border/70 bg-background/60 p-1.5">
              <div>
                <div className="text-[10px] font-medium text-foreground">Fill cell labels</div>
                <div className="mt-0.5 text-[9px] leading-snug text-muted-foreground">
                  Expand every label to fill its safe shape interior consistently.
                </div>
              </div>
              <Switch
                checked={matrixRootData.matrixFillCellLabels === true}
                onCheckedChange={(checked) => {
                  useCanvasStore.getState().pushHistory();
                  updateNodeData(matrixRoot.id, {
                    matrixFillCellLabels: checked ? true : undefined,
                  });
                  requestAnimationFrame(() => requestMeasuredLayout("matrix", matrixRoot.id, matrixBranchIds));
                }}
                aria-label="Fill labels in this Matrix"
              />
            </div>

            <div className="mb-2 rounded-md border border-border/70 bg-background/60 p-1.5">
              <div className="mb-1.5">
                <div className="text-[10px] font-medium text-foreground">Branch direction</div>
                <div className="truncate text-[9px] text-muted-foreground">
                  {selectedNode?.id === matrixRoot.id
                    ? "Where the Matrix places each child group"
                    : `Where children of ${nodeTitle(selectedNode)} are placed`}
                </div>
              </div>
              <div className={cn("grid gap-1", selectedNode?.id === matrixRoot.id ? "grid-cols-2" : "grid-cols-3")}>
                <button
                  type="button"
                  title="Grow descendants from left to right"
                  onClick={() => {
                    if (!selectedNode) return;
                    useCanvasStore.getState().pushHistory();
                    updateNodeData(selectedNode.id, { matrixOrientation: "horizontal" });
                    requestAnimationFrame(() => requestMeasuredLayout("matrix", matrixRoot.id, matrixBranchIds));
                  }}
                  className={cn(
                    "flex items-center justify-center gap-1 rounded-md border px-1 py-1.5 text-[9px]",
                    effectiveMatrixOrientation === "horizontal" && (selectedNode?.id === matrixRoot.id || explicitMatrixOrientation === "horizontal")
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background hover:bg-muted"
                  )}
                >
                  <ArrowRight className="h-3 w-3" /> Right
                </button>
                <button
                  type="button"
                  title="Grow descendants from top to bottom"
                  onClick={() => {
                    if (!selectedNode) return;
                    useCanvasStore.getState().pushHistory();
                    updateNodeData(selectedNode.id, { matrixOrientation: "vertical" });
                    requestAnimationFrame(() => requestMeasuredLayout("matrix", matrixRoot.id, matrixBranchIds));
                  }}
                  className={cn(
                    "flex items-center justify-center gap-1 rounded-md border px-1 py-1.5 text-[9px]",
                    effectiveMatrixOrientation === "vertical" && (selectedNode?.id === matrixRoot.id || explicitMatrixOrientation === "vertical")
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background hover:bg-muted"
                  )}
                >
                  <ArrowDown className="h-3 w-3" /> Below
                </button>
                {selectedNode?.id !== matrixRoot.id && (
                  <button
                    type="button"
                    title={`Inherit ${effectiveMatrixOrientation === "vertical" ? "Below" : "Right"} from the parent`}
                    onClick={() => {
                      if (!selectedNode) return;
                      useCanvasStore.getState().pushHistory();
                      updateNodeData(selectedNode.id, { matrixOrientation: undefined });
                      requestAnimationFrame(() => requestMeasuredLayout("matrix", matrixRoot.id, matrixBranchIds));
                    }}
                    className={cn(
                      "rounded-md border px-1 py-1.5 text-[9px]",
                      explicitMatrixOrientation === null
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background hover:bg-muted"
                    )}
                  >
                    Inherit
                  </button>
                )}
              </div>
            </div>

            {selectedNode && selectedChildCount > 1 && (
              <div className="mb-2 rounded-md border border-border/70 bg-background/60 p-1.5">
                <div className="mb-1.5">
                  <div className="text-[10px] font-medium text-foreground">Direct children</div>
                  <div className="text-[9px] leading-snug text-muted-foreground">
                    Arrange siblings as a sideways row or a vertical column without moving their parent.
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <button
                    type="button"
                    title="Place direct children side by side"
                    onClick={() => {
                      useCanvasStore.getState().pushHistory();
                      updateNodeData(selectedNode.id, { matrixChildFlow: "row" });
                      requestAnimationFrame(() => requestMeasuredLayout("matrix", matrixRoot.id, matrixBranchIds));
                    }}
                    className={cn(
                      "flex items-center justify-center gap-1 rounded-md border px-1 py-1.5 text-[9px]",
                      effectiveMatrixChildFlow === "row" && explicitMatrixChildFlow === "row"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background hover:bg-muted"
                    )}
                  >
                    <ArrowRight className="h-3 w-3" /> Row
                  </button>
                  <button
                    type="button"
                    title="Stack direct children vertically"
                    onClick={() => {
                      useCanvasStore.getState().pushHistory();
                      updateNodeData(selectedNode.id, { matrixChildFlow: "column" });
                      requestAnimationFrame(() => requestMeasuredLayout("matrix", matrixRoot.id, matrixBranchIds));
                    }}
                    className={cn(
                      "flex items-center justify-center gap-1 rounded-md border px-1 py-1.5 text-[9px]",
                      effectiveMatrixChildFlow === "column" && explicitMatrixChildFlow === "column"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background hover:bg-muted"
                    )}
                  >
                    <ArrowDown className="h-3 w-3" /> Column
                  </button>
                  <button
                    type="button"
                    title={`Use the automatic ${effectiveMatrixOrientation === "horizontal" ? "column" : "row"} arrangement`}
                    onClick={() => {
                      useCanvasStore.getState().pushHistory();
                      updateNodeData(selectedNode.id, { matrixChildFlow: undefined });
                      requestAnimationFrame(() => requestMeasuredLayout("matrix", matrixRoot.id, matrixBranchIds));
                    }}
                    className={cn(
                      "rounded-md border px-1 py-1.5 text-[9px]",
                      explicitMatrixChildFlow === null
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background hover:bg-muted"
                    )}
                  >
                    Auto
                  </button>
                </div>
                <label className="mt-1.5 block space-y-1 text-[9px] font-medium text-muted-foreground">
                  <span>Sibling gap (px)</span>
                  <div className="grid grid-cols-[1fr_auto] gap-1">
                    <ExactNumberField
                      value={typeof selectedData.matrixSiblingGap === "number"
                        ? selectedData.matrixSiblingGap
                        : undefined}
                      min={0}
                      max={240}
                      label="Gap between direct Matrix children"
                      onCommit={(value) => {
                        useCanvasStore.getState().pushHistory();
                        updateNodeData(selectedNode.id, { matrixSiblingGap: value });
                        requestMatrixReflow();
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-[9px]"
                      onClick={() => {
                        useCanvasStore.getState().pushHistory();
                        updateNodeData(selectedNode.id, { matrixSiblingGap: undefined });
                        requestMatrixReflow();
                      }}
                    >
                      Auto
                    </Button>
                  </div>
                </label>
              </div>
            )}

            {selectedNode?.id === matrixRoot.id && (
              <div className="rounded-md border border-border/70 bg-background/60 p-1.5">
                <div className="mb-1">
                  <div className="text-[10px] font-medium text-foreground">Overall Matrix size</div>
                  <div className="mt-0.5 text-[9px] leading-snug text-muted-foreground">
                    {matrixTableSizeLocked
                      ? "Locked at this outer size while cells redistribute inside it."
                      : "Set an exact boundary or lock the current rendered size."}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <label className="space-y-1 text-[9px] font-medium text-muted-foreground">
                    <span>Width (px)</span>
                    <ExactNumberField
                      value={matrixTableWidth}
                      min={160}
                      max={6000}
                      label="Overall Matrix width"
                      onCommit={(value) => {
                        useCanvasStore.getState().pushHistory();
                        updateNodeData(matrixRoot.id, { matrixTableWidthOverride: value });
                        requestMatrixReflow();
                      }}
                    />
                  </label>
                  <label className="space-y-1 text-[9px] font-medium text-muted-foreground">
                    <span>Height (px)</span>
                    <ExactNumberField
                      value={matrixTableHeight}
                      min={100}
                      max={6000}
                      label="Overall Matrix height"
                      onCommit={(value) => {
                        useCanvasStore.getState().pushHistory();
                        updateNodeData(matrixRoot.id, { matrixTableHeightOverride: value });
                        requestMatrixReflow();
                      }}
                    />
                  </label>
                </div>
                <div className="mt-1.5 grid grid-cols-2 gap-1">
                  <Button
                    type="button"
                    variant={matrixTableSizeLocked ? "secondary" : "outline"}
                    size="sm"
                    className="h-7 gap-1 px-1 text-[9px]"
                    aria-pressed={matrixTableSizeLocked}
                    onClick={() => {
                      useCanvasStore.getState().pushHistory();
                      updateNodeData(matrixRoot.id, matrixTableSizeLocked
                        ? { matrixTableSizeLocked: undefined }
                        : {
                            matrixTableSizeLocked: true,
                            matrixTableWidthOverride: matrixTableWidth,
                            matrixTableHeightOverride: matrixTableHeight,
                          });
                      requestMatrixReflow();
                    }}
                  >
                    {matrixTableSizeLocked
                      ? <Unlock className="h-3 w-3" />
                      : <Lock className="h-3 w-3" />}
                    {matrixTableSizeLocked ? "Unlock" : "Lock size"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-1 text-[9px]"
                    onClick={() => {
                      useCanvasStore.getState().pushHistory();
                      updateNodeData(matrixRoot.id, {
                        matrixTableSizeLocked: undefined,
                        matrixTableWidthOverride: undefined,
                        matrixTableHeightOverride: undefined,
                      });
                      requestMatrixReflow();
                    }}
                  >
                    Auto size
                  </Button>
                </div>
              </div>
            )}

            <div className="text-[10px] font-medium text-foreground">Density</div>
            <div className="grid grid-cols-3 gap-1">
              {(["compact", "comfortable", "presentation"] as const).map((density) => (
                <button
                  key={density}
                  type="button"
                  onClick={() => {
                    updateNodeData(matrixRoot.id, { matrixDensity: density, matrixDensityUserSet: true });
                    requestAnimationFrame(() => requestMeasuredLayout("matrix", matrixRoot.id, matrixBranchIds));
                  }}
                  className={cn(
                    "rounded-md border px-1 py-1.5 text-[9px] capitalize",
                    (((matrixRoot.data as Record<string, unknown>).matrixDensity as string | undefined) ?? "comfortable") === density
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background hover:bg-muted"
                  )}
                >
                  {density}
                </button>
              ))}
            </div>

            <div className="mt-2 grid grid-cols-3 gap-1">
              <button
                type="button"
                onClick={() => requestMeasuredLayout("matrix", matrixRoot.id, matrixBranchIds)}
                className="flex items-center justify-center gap-1 rounded-md border border-border bg-background px-1 py-1.5 text-[9px] hover:bg-muted"
              >
                <RefreshCw className="h-3 w-3" /> Reflow
              </button>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent("vidya:fitview", {
                  detail: { nodeIds: matrixBranchIds, mode: "matrix", rootId: matrixRoot.id, forceFit: true },
                }))}
                className="flex items-center justify-center gap-1 rounded-md border border-border bg-background px-1 py-1.5 text-[9px] hover:bg-muted"
              >
                <Maximize2 className="h-3 w-3" /> Fit
              </button>
              <button
                type="button"
                onClick={() => {
                  applyLayout("freeForm", matrixRoot.id);
                  toast.success("Converted Matrix to Free Form.", {
                    action: { label: "Undo", onClick: () => useCanvasStore.getState().undo() },
                  });
                }}
                className="flex items-center justify-center gap-1 rounded-md border border-border bg-background px-1 py-1.5 text-[9px] hover:bg-muted"
              >
                <Ungroup className="h-3 w-3" /> Free
              </button>
            </div>
          </SettingsSection>
        )}
      </div>

      <div className="border-t px-3 py-2 text-[10px] text-muted-foreground">
        Tip: use Tidy up for a rough whole-board flow; use a layout below for one selected branch.
      </div>
    </aside>
  );
}
