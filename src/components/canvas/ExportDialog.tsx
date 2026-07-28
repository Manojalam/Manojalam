"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileImage, FileText, FileType2, Gauge, ImageDown, Layers3, Link2 } from "lucide-react";
import { useViewport } from "@xyflow/react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  resolveExportTargetWithBounds,
  resolveSelectedSubtreeRoots,
} from "@/lib/export/bounds";
import { ExportError } from "@/lib/export/errors";
import { createPngExportPlan } from "@/lib/export/limits";
import { exportBoardVisual } from "@/lib/export/pipeline";
import { exportMatrixSections } from "@/lib/export/matrix-section-export";
import {
  resolveMatrixSectionExportPlan,
  type MatrixSectionExportPlan,
} from "@/lib/export/matrix-sections";
import {
  exportFormatSupportsTransparency,
  OPAQUE_EXPORT_FALLBACK_BACKGROUND,
  resolveElementExportBackground,
} from "@/lib/export/background";
import { boardTextureStyle } from "@/lib/canvas/board-textures";
import type { PdfPaperSize } from "@/lib/export/pdf";
import type { ExportFormat, ExportPlan, ExportScope } from "@/lib/export/types";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/store/canvas-store";
import { useUIStore, type BoardExportRequest } from "@/store/ui-store";

type DialogScope = "board" | "selection" | "subtree" | "frame";
type ScaleChoice = "1" | "2" | "3" | "4" | "custom";
type OpaqueFallback = "black" | "white";
type MatrixOutputMode = "whole" | "folds" | "children";

const DEFAULT_PADDING = 12;
const EMPTY_IDS: string[] = [];

function formatDimension(value: number): string {
  return Math.max(1, Math.ceil(value)).toLocaleString();
}

function formatScale(value: number): string {
  const formatted = value >= 0.01
    ? Number(value.toFixed(2)).toString()
    : Number(value.toPrecision(3)).toString();
  return `${formatted}×`;
}

function readableExportLabel(data: Record<string, unknown>, fallback: string): string {
  const value = [data.text, data.title, data.richText]
    .find((candidate): candidate is string =>
      typeof candidate === "string" && candidate.trim().length > 0);
  return value
    ?.replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 72) || fallback;
}

function requestInitialScope(
  request: BoardExportRequest,
  hasSelection: boolean,
  hasSubtree: boolean
): DialogScope {
  if (request.scope === "frame") return "frame";
  if (request.scope === "subtree") return hasSubtree ? "subtree" : "selection";
  if (request.scope === "node") return "selection";
  if (request.scope === "selection") return hasSubtree ? "subtree" : "selection";
  return request.scope === "board"
    ? "board"
    : hasSubtree
      ? "subtree"
      : hasSelection ? "selection" : "board";
}

function reportPreparationFailure(error: unknown): ExportError {
  const exportError = error instanceof ExportError
    ? error
    : new ExportError({
        stage: "resolve-bounds",
        cause: error,
        message: "The selected board content could not be measured for export.",
      });
  console.error("[Manojalam export]", {
    event: "manojalam.export",
    status: "failed",
    timestamp: new Date().toISOString(),
    ...exportError.toJSON(),
  }, exportError.cause ?? exportError);
  return exportError;
}

function ExportDialogOpen({ request }: { request: BoardExportRequest }) {
  const close = useUIStore((state) => state.closeBoardExport);
  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);
  const selectedNodeIds = useCanvasStore((state) => state.selectedNodeIds);
  const selectedEdgeIds = useCanvasStore((state) => state.selectedEdgeIds);
  const boardTitle = useCanvasStore((state) => state.board?.title ?? "board");
  const canvasTexture = useCanvasStore((state) => state.settings.canvasTexture);
  const viewportTransform = useViewport();
  const requestedNodeIds = request.nodeIds?.length ? request.nodeIds : selectedNodeIds;
  const requestedEdgeIds = request.scope === "node" ? EMPTY_IDS : selectedEdgeIds;
  const hasSelection = requestedNodeIds.length > 0 || requestedEdgeIds.length > 0;
  const selectedSubtreeRoots = useMemo(
    () => resolveSelectedSubtreeRoots(requestedNodeIds, nodes, edges),
    [edges, nodes, requestedNodeIds]
  );
  const subtreeRootIds = selectedSubtreeRoots.rootIds;
  const hasSubtree = selectedSubtreeRoots.hasVisibleDescendants;
  const subtreeRootId = subtreeRootIds.length === 1 ? subtreeRootIds[0] : null;
  const selectedFrameId = request.frameId
    ?? nodes.find((node) => requestedNodeIds.includes(node.id) && node.type === "frame")?.id;
  const selectedMatrixRootNode = subtreeRootId
    ? nodes.find((node) => (
        node.id === subtreeRootId
        && ((node.data ?? {}) as Record<string, unknown>).layoutMode === "matrix"
      ))
    : undefined;
  const matrixRootNodes = nodes.filter((node) => (
    node.hidden !== true
    && ((node.data ?? {}) as Record<string, unknown>).layoutMode === "matrix"
  ));
  const initialScopeKind = requestInitialScope(request, hasSelection, hasSubtree);
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [scopeKind, setScopeKind] = useState<DialogScope>(initialScopeKind);
  const requestedFormat = request.format ?? "png";
  const [format, setFormat] = useState<ExportFormat>(requestedFormat);
  const [scaleChoice, setScaleChoice] = useState<ScaleChoice>("2");
  const [customScale, setCustomScale] = useState(2);
  const [padding, setPadding] = useState(DEFAULT_PADDING);
  const [includeBackground, setIncludeBackground] = useState(
    () => !exportFormatSupportsTransparency(requestedFormat)
  );
  const [opaqueFallback, setOpaqueFallback] = useState<OpaqueFallback>("black");
  const [matrixOutputMode, setMatrixOutputMode] = useState<MatrixOutputMode>(
    initialScopeKind === "board" ? "whole" : "folds"
  );
  const [selectedMatrixSectionIds, setSelectedMatrixSectionIds] = useState<string[] | null>(null);
  const [selectedMatrixFoldIds, setSelectedMatrixFoldIds] = useState<string[] | null>(null);
  const [boardMatrixRootId, setBoardMatrixRootId] = useState<string | null>(
    selectedMatrixRootNode?.id ?? matrixRootNodes[0]?.id ?? null
  );
  const [pdfPaperSize, setPdfPaperSize] = useState<PdfPaperSize>("letter");
  const [exporting, setExporting] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const matrixRootNodeId = scopeKind === "subtree"
    ? selectedMatrixRootNode?.id
    : scopeKind === "board"
      ? matrixRootNodes.find((node) => node.id === boardMatrixRootId)?.id ?? matrixRootNodes[0]?.id
      : undefined;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setRoot(document.querySelector<HTMLElement>("[data-board-export-root]"));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const requestedScale = scaleChoice === "custom" ? customScale : Number(scaleChoice);
  const exportScope = useMemo<ExportScope | null>(() => {
    if (scopeKind === "board") return { kind: "board" };
    if (scopeKind === "frame") {
      return selectedFrameId ? { kind: "frame", frameId: selectedFrameId } : null;
    }
    if (scopeKind === "subtree") {
      return subtreeRootIds.length > 0
        ? {
            kind: "subtree",
            rootId: subtreeRootIds[0],
            rootIds: subtreeRootIds,
          }
        : null;
    }
    return {
      kind: "selection",
      nodeIds: requestedNodeIds,
      edgeIds: requestedEdgeIds,
    };
  }, [requestedEdgeIds, requestedNodeIds, scopeKind, selectedFrameId, subtreeRootIds]);

  const resolved = useMemo(() => {
    if (!root || !exportScope) return { value: null, error: null };
    try {
      return {
        value: resolveExportTargetWithBounds(exportScope, nodes, edges, {
          padding,
          dom: {
            root,
            flowContainer: root,
            viewport: viewportTransform,
          },
        }),
        error: null,
      };
    } catch (error) {
      return {
        value: null,
        error: reportPreparationFailure(error),
      };
    }
  }, [edges, exportScope, nodes, padding, root, viewportTransform]);

  const matrixSectionPlanning = useMemo<{
    value: MatrixSectionExportPlan | null;
    error: ExportError | null;
  }>(() => {
    const requestedMatrixRootId = scopeKind === "subtree"
      ? subtreeRootId
      : scopeKind === "board" ? boardMatrixRootId : null;
    const visibleMatrixRoots = nodes.filter((node) => (
      node.hidden !== true
      && ((node.data ?? {}) as Record<string, unknown>).layoutMode === "matrix"
    ));
    const requestedMatrixRoot = visibleMatrixRoots.find(
      (node) => node.id === requestedMatrixRootId
    );
    const plannedMatrixRoot = scopeKind === "board"
      ? requestedMatrixRoot ?? visibleMatrixRoots[0]
      : requestedMatrixRoot;
    if (!root || !plannedMatrixRoot || (scopeKind !== "subtree" && scopeKind !== "board")) {
      return { value: null, error: null };
    }
    try {
      return {
        value: resolveMatrixSectionExportPlan(plannedMatrixRoot.id, nodes, edges, {
          padding,
          dom: {
            root,
            flowContainer: root,
            viewport: viewportTransform,
          },
        }),
        error: null,
      };
    } catch (error) {
      return {
        value: null,
        error: reportPreparationFailure(error),
      };
    }
  }, [
    boardMatrixRootId,
    edges,
    nodes,
    padding,
    root,
    scopeKind,
    subtreeRootId,
    viewportTransform,
  ]);
  const matrixSectionPlan = matrixSectionPlanning.value;
  const allMatrixSectionIds = useMemo(
    () => matrixSectionPlan?.sections.map((section) => section.id) ?? [],
    [matrixSectionPlan]
  );
  const allMatrixFoldIds = useMemo(
    () => matrixSectionPlan?.folds.map((fold) => fold.id) ?? [],
    [matrixSectionPlan]
  );
  const effectiveSelectedMatrixSectionIds = selectedMatrixSectionIds ?? allMatrixSectionIds;
  const effectiveSelectedMatrixFoldIds = selectedMatrixFoldIds ?? allMatrixFoldIds;
  const selectedMatrixSectionIdSet = useMemo(
    () => new Set(effectiveSelectedMatrixSectionIds),
    [effectiveSelectedMatrixSectionIds]
  );
  const selectedMatrixFoldIdSet = useMemo(
    () => new Set(effectiveSelectedMatrixFoldIds),
    [effectiveSelectedMatrixFoldIds]
  );
  const selectedMatrixChildSections = useMemo(
    () => matrixSectionPlan?.sections.filter((section) =>
      selectedMatrixSectionIdSet.has(section.id)) ?? [],
    [matrixSectionPlan, selectedMatrixSectionIdSet]
  );
  const selectedMatrixFolds = useMemo(
    () => matrixSectionPlan?.folds.filter((fold) =>
      selectedMatrixFoldIdSet.has(fold.id)) ?? [],
    [matrixSectionPlan, selectedMatrixFoldIdSet]
  );
  const effectiveMatrixOutputMode = (
    matrixOutputMode === "folds"
    && (matrixSectionPlan?.folds.length ?? 0) < 2
  ) ? "children" : matrixOutputMode;
  const selectedMatrixSections = effectiveMatrixOutputMode === "folds"
    ? selectedMatrixFolds
    : selectedMatrixChildSections;
  const availableMatrixSections = effectiveMatrixOutputMode === "folds"
    ? matrixSectionPlan?.folds ?? []
    : matrixSectionPlan?.sections ?? [];
  const matrixOutputItemLabel = effectiveMatrixOutputMode === "folds"
    ? "fold"
    : "child section";
  const sectionMode = (
    effectiveMatrixOutputMode !== "whole"
    && (scopeKind === "subtree" || scopeKind === "board")
    && !!matrixSectionPlan
  );

  const rasterPlanning = useMemo(() => {
    if (!resolved.value || format === "svg") return { plan: null, error: null };
    try {
      return {
        plan: createPngExportPlan(resolved.value.bounds, requestedScale),
        error: null,
      };
    } catch (error) {
      return {
        plan: null,
        error: error instanceof Error ? error.message : "Choose a valid export scale greater than zero.",
      };
    }
  }, [format, requestedScale, resolved.value]);
  const rasterPlan = rasterPlanning.plan;
  const matrixRasterPlanning = useMemo(() => {
    if (!sectionMode || format === "svg") return { plans: [], error: null };
    try {
      return {
        plans: selectedMatrixSections.map((section) =>
          createPngExportPlan(section.bounds, requestedScale)),
        error: null,
      };
    } catch (error) {
      return {
        plans: [],
        error: error instanceof Error
          ? error.message
          : "Choose a valid export scale greater than zero.",
      };
    }
  }, [format, requestedScale, sectionMode, selectedMatrixSections]);

  const boardBackground = useMemo(() => {
    if (!root) return { background: "#ffffff", appearanceBackground: "#ffffff" };
    return resolveElementExportBackground(root);
  }, [root]);
  const boardIsTransparent = boardBackground.background === null;
  const includedBoardBackground = boardBackground.background ?? boardBackground.appearanceBackground;
  const formatSupportsTransparency = exportFormatSupportsTransparency(format);
  const opaqueFallbackBackground = opaqueFallback === "black"
    ? OPAQUE_EXPORT_FALLBACK_BACKGROUND
    : "#ffffff";
  const exportBackground = includeBackground
    ? includedBoardBackground
    : formatSupportsTransparency
      ? null
      : opaqueFallbackBackground;

  const selectFormat = (nextFormat: ExportFormat) => {
    setFormat(nextFormat);
    setIncludeBackground(!exportFormatSupportsTransparency(nextFormat));
  };

  const fitToSafeSize = () => {
    const safeScale = sectionMode
      ? Math.min(...matrixRasterPlanning.plans.map((plan) => plan.effectiveScale))
      : rasterPlan?.effectiveScale;
    if (!safeScale || !Number.isFinite(safeScale)) return;
    setScaleChoice("custom");
    setCustomScale(safeScale);
  };

  const submit = async () => {
    if (!root || (!sectionMode && !resolved.value)) {
      toast.error(
        matrixSectionPlanning.error?.userMessage
        ?? resolved.error?.userMessage
        ?? "The board export area is not ready."
      );
      return;
    }
    if (sectionMode && selectedMatrixSections.length === 0) {
      toast.error(`Select at least one Matrix ${matrixOutputItemLabel} to export.`);
      return;
    }
    if (
      format !== "svg"
      && (sectionMode ? matrixRasterPlanning.plans.length === 0 : !rasterPlan)
    ) {
      toast.error(
        sectionMode
          ? matrixRasterPlanning.error ?? "Choose a valid export scale greater than zero."
          : rasterPlanning.error ?? "Choose a valid export scale greater than zero."
      );
      return;
    }

    setExporting(true);
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const toastId = toast.loading(`Preparing ${format.toUpperCase()} export…`);
    try {
      if (sectionMode) {
        const result = await exportMatrixSections({
          viewport: root,
          sections: selectedMatrixSections,
          format,
          requestedScale,
          filename: request.title || boardTitle,
          title: request.title || boardTitle,
          background: exportBackground,
          backgroundTexture: includeBackground ? boardTextureStyle(canvasTexture) : null,
          appearanceBackground: boardBackground.appearanceBackground,
          viewportTransform,
          pdfPaperSize,
          signal: abortController.signal,
          onProgress: (completed, total) => {
            toast.loading(
              `Preparing ${format.toUpperCase()} ${matrixOutputItemLabel} ${completed} of ${total}…`,
              { id: toastId }
            );
          },
        });
        const adjusted = result.adjusted
          ? ` at the safe ${formatScale(result.effectiveScale)} scale`
          : "";
        const outputDescription = format === "pdf"
          ? `${result.pageCount} printable page${result.pageCount === 1 ? "" : "s"}`
          : `${result.outputCount} separate ${format.toUpperCase()} file${result.outputCount === 1 ? "" : "s"}`;
        toast.success(
          `${outputDescription} download initiated${adjusted}.`,
          { id: toastId }
        );
        close();
        return;
      }
      if (!resolved.value) return;
      const result = await exportBoardVisual({
        viewport: root,
        bounds: resolved.value.bounds,
        nodeIds: resolved.value.target.nodeIds,
        edgeIds: resolved.value.target.edgeIds,
        scopeKind: resolved.value.target.scopeKind,
        format,
        requestedScale,
        filename: request.title || boardTitle,
        title: request.title || boardTitle,
        background: exportBackground,
        backgroundTexture: includeBackground ? boardTextureStyle(canvasTexture) : null,
        appearanceBackground: boardBackground.appearanceBackground,
        viewportTransform,
        signal: abortController.signal,
      });
      const adjusted = result.plan?.adjusted
        ? ` at the safe ${formatScale(result.effectiveScale)} scale`
        : "";
      const outputSize = format === "pdf"
        ? `single page, ${result.width.toLocaleString()} × ${result.height.toLocaleString()} pt`
        : `${result.width.toLocaleString()} × ${result.height.toLocaleString()}`;
      toast.success(
        `${format.toUpperCase()} download initiated${adjusted} (${outputSize}).`,
        { id: toastId }
      );
      close();
    } catch (error) {
      const message = error instanceof ExportError
        ? error.userMessage
        : error instanceof Error ? error.message : `Unable to export ${format.toUpperCase()}.`;
      toast.error(message, { id: toastId, duration: 8_000 });
    } finally {
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
      setExporting(false);
    }
  };

  const closeDialog = () => {
    abortControllerRef.current?.abort();
    close();
  };

  const sectionBounds = sectionMode && selectedMatrixSections.length > 0
    ? {
        width: Math.max(...selectedMatrixSections.map((section) => section.bounds.width)),
        height: Math.max(...selectedMatrixSections.map((section) => section.bounds.height)),
      }
    : null;
  const bounds = sectionBounds ?? resolved.value?.bounds;
  const outputWidth = sectionMode
    ? format !== "svg"
      ? Math.max(0, ...matrixRasterPlanning.plans.map((plan) => plan.outputWidth))
      : sectionBounds ? Math.ceil(sectionBounds.width) : null
    : format !== "svg"
      ? rasterPlan?.outputWidth
      : bounds ? Math.ceil(bounds.width) : null;
  const outputHeight = sectionMode
    ? format !== "svg"
      ? Math.max(0, ...matrixRasterPlanning.plans.map((plan) => plan.outputHeight))
      : sectionBounds ? Math.ceil(sectionBounds.height) : null
    : format !== "svg"
      ? rasterPlan?.outputHeight
      : bounds ? Math.ceil(bounds.height) : null;
  const megapixels = format !== "svg"
    ? sectionMode
      ? matrixRasterPlanning.plans.reduce((total, plan) => total + plan.megapixels, 0)
      : rasterPlan?.megapixels
    : null;
  const activeRasterPlans = sectionMode ? matrixRasterPlanning.plans : rasterPlan ? [rasterPlan] : [];
  const activeAdjusted = activeRasterPlans.some((plan) => plan.adjusted);
  const activeEffectiveScale = activeRasterPlans.length > 0
    ? Math.min(...activeRasterPlans.map((plan) => plan.effectiveScale))
    : null;
  const limitingRasterPlan = activeRasterPlans.reduce(
    (limiting, plan) => !limiting || plan.effectiveScale < limiting.effectiveScale ? plan : limiting,
    null as ExportPlan | null
  );
  const preparationError = sectionMode
    ? matrixSectionPlanning.error?.userMessage ?? matrixRasterPlanning.error
    : resolved.error?.userMessage ?? rasterPlanning.error;
  const canExport = !!root
    && (sectionMode ? selectedMatrixSections.length > 0 : !!resolved.value)
    && (format === "svg" || activeRasterPlans.length > 0);

  return (
    <Dialog open onOpenChange={(open) => !open && closeDialog()}>
      <DialogContent
        className="h-[min(92dvh,760px)] max-h-[calc(100dvh-1rem)] w-[min(94vw,38rem)] max-w-2xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0"
        aria-busy={exporting}
      >
        <DialogHeader className="border-b px-6 py-5 pr-12">
          <DialogTitle className="flex items-center gap-2">
            <ImageDown className="h-5 w-5 text-primary" />
            Export board
          </DialogTitle>
          <DialogDescription>
            Export any visible board content with tight bounds as PNG, JPG, SVG, or a clickable PDF.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 space-y-5 overflow-y-auto overscroll-contain px-6 py-5 touch-pan-y">
          <section className="space-y-2.5">
            <Label className="text-xs">Content</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Export content scope">
              {([
                ["board", "Whole board", "Export every visible board object"],
                ["selection", "Selection", "Export only the selected objects"],
                ["subtree", "Parent + children", "Include each selected parent, its visible descendants, attached text notes, and internal connections"],
                ["frame", "Selected frame", "Export the selected frame and its visible contents"],
              ] as Array<[DialogScope, string, string]>).map(([value, label, title]) => {
                const disabled = value === "selection"
                  ? !hasSelection
                  : value === "subtree"
                    ? !hasSubtree
                    : value === "frame"
                      ? !selectedFrameId
                      : false;
                return (
                  <button
                    key={value}
                    type="button"
                    disabled={disabled}
                    title={title}
                    aria-pressed={scopeKind === value}
                    onClick={() => {
                      setScopeKind(value);
                      if (value === "subtree") setMatrixOutputMode("folds");
                      if (value === "board") setMatrixOutputMode("whole");
                    }}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-[11px] font-medium transition-colors",
                      scopeKind === value ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted",
                      disabled && "cursor-not-allowed opacity-40"
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {sectionMode ? (
              <p className="text-[10px] text-muted-foreground">
                {selectedMatrixSections.length} of {availableMatrixSections.length} Matrix {
                  matrixOutputItemLabel
                }{availableMatrixSections.length === 1 ? "" : "s"} selected
              </p>
            ) : resolved.value && (
              <p className="text-[10px] text-muted-foreground">
                {resolved.value.target.nodeIds.length} visible node{resolved.value.target.nodeIds.length === 1 ? "" : "s"}
                {" · "}{resolved.value.target.edgeIds.length} connection{resolved.value.target.edgeIds.length === 1 ? "" : "s"}
              </p>
            )}
            {scopeKind === "subtree" && hasSubtree && (
              <p className="text-[10px] text-muted-foreground">
                Includes {
                  subtreeRootIds.length === 1
                    ? "the selected parent and all of its"
                    : "each selected parent and all of their"
                } visible descendants, attached text notes, and connections within {
                  subtreeRootIds.length === 1 ? "the branch" : "those branches"
                }.
              </p>
            )}
          </section>

          {matrixSectionPlan && (scopeKind === "subtree" || scopeKind === "board") && (
            <section className="space-y-2.5">
              <Label className="text-xs">Matrix output</Label>
              {scopeKind === "board" && matrixRootNodes.length > 1 && (
                <label className="block rounded-lg border bg-muted/20 p-2">
                  <span className="block text-[9px] font-medium text-muted-foreground">
                    Matrix to split
                  </span>
                  <select
                    value={matrixRootNodeId ?? ""}
                    onChange={(event) => setBoardMatrixRootId(event.target.value)}
                    className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
                  >
                    {matrixRootNodes.map((node, index) => (
                      <option key={node.id} value={node.id}>
                        {readableExportLabel(
                          (node.data ?? {}) as Record<string, unknown>,
                          `Matrix ${index + 1}`
                        )}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div
                className={cn(
                  "grid gap-2",
                  matrixSectionPlan.folds.length > 1 ? "sm:grid-cols-3" : "grid-cols-2"
                )}
                role="group"
                aria-label="Matrix export arrangement"
              >
                <button
                  type="button"
                  aria-pressed={effectiveMatrixOutputMode === "whole"}
                  onClick={() => setMatrixOutputMode("whole")}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left",
                    effectiveMatrixOutputMode === "whole"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted"
                  )}
                >
                  <span className="block text-[11px] font-medium">
                    {scopeKind === "board" ? "Whole board" : "Whole Matrix"}
                  </span>
                  <span className="mt-0.5 block text-[9px] text-muted-foreground">
                    One complete file
                  </span>
                </button>
                {matrixSectionPlan.folds.length > 1 && (
                  <button
                    type="button"
                    aria-pressed={effectiveMatrixOutputMode === "folds"}
                    onClick={() => setMatrixOutputMode("folds")}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left",
                      effectiveMatrixOutputMode === "folds"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:bg-muted"
                    )}
                  >
                    <span className="block text-[11px] font-medium">Root folds</span>
                    <span className="mt-0.5 block text-[9px] text-muted-foreground">
                      {matrixSectionPlan.folds.length} authored fold pages
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  aria-pressed={effectiveMatrixOutputMode === "children"}
                  onClick={() => setMatrixOutputMode("children")}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left",
                    effectiveMatrixOutputMode === "children"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted"
                  )}
                >
                  <span className="block text-[11px] font-medium">Individual children</span>
                  <span className="mt-0.5 block text-[9px] text-muted-foreground">
                    {matrixSectionPlan.sections.length} direct child pages
                  </span>
                </button>
              </div>
              {sectionMode && (
                <div className="rounded-lg border p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-[10px] font-medium">
                      Choose one, several, or all {
                        effectiveMatrixOutputMode === "folds" ? "root folds" : "children"
                      }
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="text-[9px] font-medium text-primary hover:underline"
                        onClick={() => {
                          if (effectiveMatrixOutputMode === "folds") {
                            setSelectedMatrixFoldIds(allMatrixFoldIds);
                          } else {
                            setSelectedMatrixSectionIds(allMatrixSectionIds);
                          }
                        }}
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        className="text-[9px] font-medium text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          if (effectiveMatrixOutputMode === "folds") {
                            setSelectedMatrixFoldIds([]);
                          } else {
                            setSelectedMatrixSectionIds([]);
                          }
                        }}
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  <div className="max-h-36 space-y-1.5 overflow-y-auto pr-1">
                    {availableMatrixSections.map((section) => {
                      const checked = effectiveMatrixOutputMode === "folds"
                        ? selectedMatrixFoldIdSet.has(section.id)
                        : selectedMatrixSectionIdSet.has(section.id);
                      return (
                        <label
                          key={section.id}
                          className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              if (effectiveMatrixOutputMode === "folds") {
                                const next = new Set(effectiveSelectedMatrixFoldIds);
                                if (checked) next.delete(section.id);
                                else next.add(section.id);
                                setSelectedMatrixFoldIds(
                                  matrixSectionPlan.folds
                                    .map((candidate) => candidate.id)
                                    .filter((id) => next.has(id))
                                );
                              } else {
                                const next = new Set(effectiveSelectedMatrixSectionIds);
                                if (checked) next.delete(section.id);
                                else next.add(section.id);
                                setSelectedMatrixSectionIds(
                                  matrixSectionPlan.sections
                                    .map((candidate) => candidate.id)
                                    .filter((id) => next.has(id))
                                );
                              }
                            }}
                            className="mt-0.5 h-3.5 w-3.5 accent-primary"
                          />
                          <span className="min-w-0 text-[10px] leading-snug">
                            {effectiveMatrixOutputMode === "children" && (
                              <span className="mr-1 text-muted-foreground">{section.index + 1}.</span>
                            )}
                            {section.label}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-[9px] leading-snug text-muted-foreground">
                    The Matrix root is repeated as a full-width header and resized for every selected {
                      effectiveMatrixOutputMode === "folds" ? "fold" : "child section"
                    }.
                  </p>
                </div>
              )}
            </section>
          )}

          <section className="space-y-2.5">
            <Label className="text-xs">Format</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Export file format">
              <button
                type="button"
                aria-pressed={format === "png"}
                onClick={() => selectFormat("png")}
                className={cn("flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs", format === "png" ? "border-primary bg-primary/10 text-primary" : "border-border")}
              >
                <FileImage className="h-4 w-4" /> PNG
              </button>
              <button
                type="button"
                aria-pressed={format === "jpg"}
                onClick={() => selectFormat("jpg")}
                className={cn("flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs", format === "jpg" ? "border-primary bg-primary/10 text-primary" : "border-border")}
              >
                <FileImage className="h-4 w-4" /> JPG
              </button>
              <button
                type="button"
                aria-pressed={format === "svg"}
                onClick={() => selectFormat("svg")}
                className={cn("flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs", format === "svg" ? "border-primary bg-primary/10 text-primary" : "border-border")}
              >
                <FileType2 className="h-4 w-4" /> SVG
              </button>
              <button
                type="button"
                aria-pressed={format === "pdf"}
                onClick={() => selectFormat("pdf")}
                className={cn("flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs", format === "pdf" ? "border-primary bg-primary/10 text-primary" : "border-border")}
              >
                <FileText className="h-4 w-4" /> PDF
              </button>
            </div>
          </section>

          {sectionMode && format === "pdf" && (
            <section className="space-y-2.5">
              <Label className="text-xs">Print paper</Label>
              <div className="grid grid-cols-2 gap-2" role="group" aria-label="PDF paper size">
                {([
                  ["letter", "Letter", "8.5 × 11 in"],
                  ["a4", "A4", "210 × 297 mm"],
                ] as Array<[PdfPaperSize, string, string]>).map(([value, label, detail]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={pdfPaperSize === value}
                    onClick={() => setPdfPaperSize(value)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left",
                      pdfPaperSize === value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:bg-muted"
                    )}
                  >
                    <span className="block text-[11px] font-medium">{label}</span>
                    <span className="mt-0.5 block text-[9px] text-muted-foreground">{detail}</span>
                  </button>
                ))}
              </div>
              <p className="text-[9px] text-muted-foreground">
                Each {matrixOutputItemLabel} is fitted to its own page; portrait or landscape is chosen automatically.
              </p>
            </section>
          )}

          {format !== "svg" && (
            <section className="space-y-3">
              <Label className="text-xs">Resolution</Label>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5" role="group" aria-label={`${format.toUpperCase()} export scale`}>
                {(["1", "2", "3", "4", "custom"] as ScaleChoice[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={scaleChoice === value}
                    onClick={() => setScaleChoice(value)}
                    className={cn(
                      "rounded-lg border px-2 py-2 text-[11px] font-medium",
                      scaleChoice === value ? "border-primary bg-primary/10 text-primary" : "border-border"
                    )}
                  >
                    {value === "custom" ? "Custom" : `${value}×`}
                  </button>
                ))}
              </div>
              {scaleChoice === "custom" && (
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    min="0.000001"
                    max="20"
                    step="any"
                    value={customScale}
                    onChange={(event) => setCustomScale(Number(event.target.value))}
                    className="h-9"
                    aria-label="Custom export scale"
                  />
                  <span className="shrink-0 text-xs text-muted-foreground">times source size</span>
                </div>
              )}
            </section>
          )}

          <section className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="export-padding" className="text-xs">Padding</Label>
                <span className="text-[10px] text-muted-foreground">{padding}px</span>
              </div>
              <input
                id="export-padding"
                type="range"
                min="0"
                max="96"
                step="4"
                value={padding}
                onChange={(event) => setPadding(Number(event.target.value))}
                className="w-full accent-primary"
              />
            </div>
            <div className="flex items-center justify-between gap-4 rounded-lg border px-3 py-2.5">
              <div>
                <Label className="text-xs">Board background</Label>
                <p className="text-[9px] text-muted-foreground">
                  {includeBackground
                    ? boardIsTransparent
                      ? "Using the current theme backdrop."
                    : "Included in the exported file."
                    : formatSupportsTransparency
                      ? "Transparent outer pixels and authored transparent text boxes."
                      : `${opaqueFallback === "black" ? "Black" : "White"} fallback matte; ${format.toUpperCase()} cannot be transparent.`}
                </p>
              </div>
              <Switch
                checked={includeBackground}
                onCheckedChange={setIncludeBackground}
                aria-label="Include board background"
              />
            </div>
            {!formatSupportsTransparency && !includeBackground && (
              <div className="space-y-2 sm:col-span-2">
                <Label className="text-xs">Fallback matte</Label>
                <div className="grid grid-cols-2 gap-2" role="group" aria-label="Opaque export fallback matte">
                  {(["black", "white"] as OpaqueFallback[]).map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={opaqueFallback === value}
                      onClick={() => setOpaqueFallback(value)}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-[11px] font-medium",
                        opaqueFallback === value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border"
                      )}
                    >
                      {value === "black" ? "Black" : "White"}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="rounded-xl border bg-muted/30 p-4" aria-live="polite">
            <div className="mb-3 flex items-center gap-2">
              <Gauge className="h-4 w-4 text-primary" />
              <p className="text-xs font-semibold">Export calculation</p>
            </div>
            {preparationError ? (
              <p className="text-xs text-destructive" role="alert">{preparationError}</p>
            ) : sectionMode && selectedMatrixSections.length === 0 ? (
              <p className="text-xs text-destructive" role="alert">
                Select at least one Matrix {matrixOutputItemLabel}.
              </p>
            ) : bounds && outputWidth && outputHeight ? (
              <div className="grid grid-cols-2 gap-x-5 gap-y-2 text-[11px]">
                <span className="text-muted-foreground">
                  {sectionMode ? `Largest ${matrixOutputItemLabel}` : "Content"}
                </span>
                <span className="text-right font-medium">{formatDimension(bounds.width)} × {formatDimension(bounds.height)}</span>
                <span className="text-muted-foreground">Scale</span>
                <span className="text-right font-medium">
                  {format !== "svg" && activeEffectiveScale ? formatScale(activeEffectiveScale) : "Vector"}
                </span>
                <span className="text-muted-foreground">
                  {sectionMode ? "Largest image" : format === "pdf" ? "Embedded image" : "Output"}
                </span>
                <span className="text-right font-medium">
                  {outputWidth.toLocaleString()} × {outputHeight.toLocaleString()}{format === "pdf" ? " px" : ""}
                </span>
                {megapixels !== null && megapixels !== undefined && (
                  <>
                    <span className="text-muted-foreground">
                      {sectionMode ? "Combined pixels" : "Pixels"}
                    </span>
                    <span className="text-right font-medium">{megapixels.toFixed(1)} MP</span>
                  </>
                )}
                <span className="text-muted-foreground">Status</span>
                <span className={cn("text-right font-semibold", activeAdjusted ? "text-amber-600" : "text-emerald-600")}>
                  {sectionMode
                    ? format === "pdf"
                      ? `${selectedMatrixSections.length} page${selectedMatrixSections.length === 1 ? "" : "s"} · ${pdfPaperSize === "letter" ? "Letter" : "A4"}`
                      : `${selectedMatrixSections.length} separate ${format.toUpperCase()} file${selectedMatrixSections.length === 1 ? "" : "s"}`
                    : format === "svg"
                      ? "Vector · no canvas limit"
                      : format === "pdf"
                        ? "Single page · clickable links"
                        : activeAdjusted ? "Adjusted to safe size" : "Safe"}
                </span>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Measuring the visible board content…</p>
            )}
            {activeAdjusted && limitingRasterPlan && (
              <div className="mt-3 rounded-lg bg-amber-500/10 p-3 text-[10px] leading-relaxed text-amber-800 dark:text-amber-200">
                {sectionMode ? `At least one selected ${matrixOutputItemLabel} is` : "This content is"} too large for {formatScale(limitingRasterPlan.requestedScale)} {format.toUpperCase()} export. It will export at the safe {formatScale(limitingRasterPlan.effectiveScale)} scale, with the largest constrained image producing {limitingRasterPlan.outputWidth.toLocaleString()} × {limitingRasterPlan.outputHeight.toLocaleString()} pixels.
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" className="h-7 text-[10px]" onClick={fitToSafeSize}>
                    Fit to safe {format.toUpperCase()} size
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => selectFormat("svg")}>
                    Export as SVG instead
                  </Button>
                </div>
              </div>
            )}
            {format === "svg" && bounds && (bounds.width > 8_000 || bounds.height > 8_000) && (
              <p className="mt-3 flex items-center gap-2 rounded-lg bg-blue-500/10 p-2 text-[10px] text-blue-700 dark:text-blue-200">
                <Layers3 className="h-3.5 w-3.5" /> SVG is recommended for very large vector boards.
              </p>
            )}
            {format === "pdf" && (
              <p className="mt-3 flex items-center gap-2 rounded-lg bg-blue-500/10 p-2 text-[10px] text-blue-700 dark:text-blue-200">
                <Link2 className="h-3.5 w-3.5" />
                {sectionMode
                  ? `Each selected ${matrixOutputItemLabel} is fitted to its own printable page; chart links remain clickable.`
                  : "Links in chart text remain clickable in the PDF."}
              </p>
            )}
            {sectionMode && format !== "pdf" && selectedMatrixSections.length > 1 && (
              <p className="mt-3 flex items-center gap-2 rounded-lg bg-blue-500/10 p-2 text-[10px] text-blue-700 dark:text-blue-200">
                <Layers3 className="h-3.5 w-3.5" />
                Your browser may ask permission to allow the {selectedMatrixSections.length} separate downloads.
              </p>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-3 border-t bg-background px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[10px] text-muted-foreground sm:max-w-[55%]">
            Editor controls, panels, minimap, and hidden content are excluded.
          </p>
          <div className="flex justify-end gap-2">
            <Button className="max-sm:flex-1" variant="outline" onClick={closeDialog}>
              {exporting ? "Cancel export" : "Cancel"}
            </Button>
            <Button className="max-sm:flex-1" onClick={() => void submit()} disabled={exporting || !canExport}>
              {exporting
                ? "Exporting…"
                : sectionMode
                  ? `Export ${selectedMatrixSections.length} ${matrixOutputItemLabel}${selectedMatrixSections.length === 1 ? "" : "s"}`
                  : `Export ${format.toUpperCase()}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ExportDialog() {
  const request = useUIStore((state) => state.boardExportRequest);
  if (!request) return null;
  const key = [request.scope ?? "auto", request.frameId ?? "", request.format ?? "", ...(request.nodeIds ?? [])].join(":");
  return <ExportDialogOpen key={key} request={request} />;
}
