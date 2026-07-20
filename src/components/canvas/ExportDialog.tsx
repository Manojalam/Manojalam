"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileImage, FileType2, Gauge, ImageDown, Layers3 } from "lucide-react";
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
import { resolveExportTargetWithBounds } from "@/lib/export/bounds";
import { ExportError } from "@/lib/export/errors";
import { createPngExportPlan } from "@/lib/export/limits";
import { exportBoardVisual } from "@/lib/export/pipeline";
import { resolveElementExportBackground } from "@/lib/export/background";
import type { ExportFormat, ExportScope } from "@/lib/export/types";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/store/canvas-store";
import { useUIStore, type BoardExportRequest } from "@/store/ui-store";

type DialogScope = "board" | "selection" | "frame";
type ScaleChoice = "1" | "2" | "3" | "4" | "custom";

const DEFAULT_PADDING = 32;
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

function requestInitialScope(request: BoardExportRequest, hasSelection: boolean): DialogScope {
  if (request.scope === "frame") return "frame";
  if (request.scope === "node" || request.scope === "selection") return "selection";
  return request.scope === "board" ? "board" : hasSelection ? "selection" : "board";
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
  const viewportTransform = useViewport();
  const requestedNodeIds = request.nodeIds?.length ? request.nodeIds : selectedNodeIds;
  const requestedEdgeIds = request.scope === "node" ? EMPTY_IDS : selectedEdgeIds;
  const hasSelection = requestedNodeIds.length > 0 || requestedEdgeIds.length > 0;
  const selectedFrameId = request.frameId
    ?? nodes.find((node) => requestedNodeIds.includes(node.id) && node.type === "frame")?.id;
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [scopeKind, setScopeKind] = useState<DialogScope>(() =>
    requestInitialScope(request, hasSelection)
  );
  const [format, setFormat] = useState<ExportFormat>(request.format ?? "png");
  const [scaleChoice, setScaleChoice] = useState<ScaleChoice>("2");
  const [customScale, setCustomScale] = useState(2);
  const [padding, setPadding] = useState(DEFAULT_PADDING);
  const [includeBackground, setIncludeBackground] = useState(false);
  const [exporting, setExporting] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

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
    return {
      kind: "selection",
      nodeIds: requestedNodeIds,
      edgeIds: requestedEdgeIds,
    };
  }, [requestedEdgeIds, requestedNodeIds, scopeKind, selectedFrameId]);

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

  const pngPlanning = useMemo(() => {
    if (!resolved.value || format !== "png") return { plan: null, error: null };
    try {
      return {
        plan: createPngExportPlan(resolved.value.bounds, requestedScale),
        error: null,
      };
    } catch (error) {
      return {
        plan: null,
        error: error instanceof Error ? error.message : "Choose a valid PNG export scale greater than zero.",
      };
    }
  }, [format, requestedScale, resolved.value]);
  const pngPlan = pngPlanning.plan;

  const boardBackground = useMemo(() => {
    if (!root) return { background: "#ffffff", appearanceBackground: "#ffffff" };
    return resolveElementExportBackground(root);
  }, [root]);
  const boardIsTransparent = boardBackground.background === null;
  const includedBoardBackground = boardBackground.background ?? boardBackground.appearanceBackground;

  const fitToSafeSize = () => {
    if (!pngPlan) return;
    setScaleChoice("custom");
    setCustomScale(pngPlan.effectiveScale);
  };

  const submit = async () => {
    if (!root || !resolved.value) {
      toast.error(resolved.error?.userMessage ?? "The board export area is not ready.");
      return;
    }
    if (format === "png" && !pngPlan) {
      toast.error(pngPlanning.error ?? "Choose a valid PNG scale greater than zero.");
      return;
    }

    setExporting(true);
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const toastId = toast.loading(`Preparing ${format.toUpperCase()} export…`);
    try {
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
        background: includeBackground ? includedBoardBackground : null,
        appearanceBackground: boardBackground.appearanceBackground,
        signal: abortController.signal,
      });
      const adjusted = result.plan?.adjusted
        ? ` at the safe ${formatScale(result.effectiveScale)} scale`
        : "";
      toast.success(
        `${format.toUpperCase()} download initiated${adjusted} (${result.width.toLocaleString()} × ${result.height.toLocaleString()}).`,
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

  const bounds = resolved.value?.bounds;
  const outputWidth = format === "png" ? pngPlan?.outputWidth : bounds ? Math.ceil(bounds.width) : null;
  const outputHeight = format === "png" ? pngPlan?.outputHeight : bounds ? Math.ceil(bounds.height) : null;
  const megapixels = format === "png" ? pngPlan?.megapixels : null;

  return (
    <Dialog open onOpenChange={(open) => !open && closeDialog()}>
      <DialogContent
        className="h-[min(92dvh,760px)] max-h-[calc(100dvh-1rem)] w-[min(94vw,38rem)] max-w-2xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0"
        aria-busy={exporting}
      >
        <DialogHeader className="border-b px-6 py-5 pr-12">
          <DialogTitle className="flex items-center gap-2">
            <ImageDown className="h-5 w-5 text-primary" />
            Export board image
          </DialogTitle>
          <DialogDescription>
            Export any visible board content with tight bounds and a browser-safe resolution.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 space-y-5 overflow-y-auto overscroll-contain px-6 py-5 touch-pan-y">
          <section className="space-y-2.5">
            <Label className="text-xs">Content</Label>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Export content scope">
              {([
                ["board", "Whole board"],
                ["selection", "Selection"],
                ["frame", "Selected frame"],
              ] as Array<[DialogScope, string]>).map(([value, label]) => {
                const disabled = value === "selection" ? !hasSelection : value === "frame" ? !selectedFrameId : false;
                return (
                  <button
                    key={value}
                    type="button"
                    disabled={disabled}
                    aria-pressed={scopeKind === value}
                    onClick={() => setScopeKind(value)}
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
            {resolved.value && (
              <p className="text-[10px] text-muted-foreground">
                {resolved.value.target.nodeIds.length} visible node{resolved.value.target.nodeIds.length === 1 ? "" : "s"}
                {" · "}{resolved.value.target.edgeIds.length} connection{resolved.value.target.edgeIds.length === 1 ? "" : "s"}
              </p>
            )}
          </section>

          <section className="space-y-2.5">
            <Label className="text-xs">Format</Label>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Export file format">
              <button
                type="button"
                aria-pressed={format === "png"}
                onClick={() => setFormat("png")}
                className={cn("flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs", format === "png" ? "border-primary bg-primary/10 text-primary" : "border-border")}
              >
                <FileImage className="h-4 w-4" /> PNG
              </button>
              <button
                type="button"
                aria-pressed={format === "svg"}
                onClick={() => setFormat("svg")}
                className={cn("flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs", format === "svg" ? "border-primary bg-primary/10 text-primary" : "border-border")}
              >
                <FileType2 className="h-4 w-4" /> SVG
              </button>
            </div>
          </section>

          {format === "png" && (
            <section className="space-y-3">
              <Label className="text-xs">Resolution</Label>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5" role="group" aria-label="PNG export scale">
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
                      : "Included in the exported image."
                    : "Transparent outer pixels (default)."}
                </p>
              </div>
              <Switch
                checked={includeBackground}
                onCheckedChange={setIncludeBackground}
                aria-label="Include board background"
              />
            </div>
          </section>

          <section className="rounded-xl border bg-muted/30 p-4" aria-live="polite">
            <div className="mb-3 flex items-center gap-2">
              <Gauge className="h-4 w-4 text-primary" />
              <p className="text-xs font-semibold">Export calculation</p>
            </div>
            {resolved.error ? (
              <p className="text-xs text-destructive" role="alert">{resolved.error.userMessage}</p>
            ) : pngPlanning.error ? (
              <p className="text-xs text-destructive" role="alert">{pngPlanning.error}</p>
            ) : bounds && outputWidth && outputHeight ? (
              <div className="grid grid-cols-2 gap-x-5 gap-y-2 text-[11px]">
                <span className="text-muted-foreground">Content</span>
                <span className="text-right font-medium">{formatDimension(bounds.width)} × {formatDimension(bounds.height)}</span>
                <span className="text-muted-foreground">Scale</span>
                <span className="text-right font-medium">{format === "png" && pngPlan ? formatScale(pngPlan.effectiveScale) : "Vector"}</span>
                <span className="text-muted-foreground">Output</span>
                <span className="text-right font-medium">{outputWidth.toLocaleString()} × {outputHeight.toLocaleString()}</span>
                {megapixels !== null && megapixels !== undefined && (
                  <>
                    <span className="text-muted-foreground">Pixels</span>
                    <span className="text-right font-medium">{megapixels.toFixed(1)} MP</span>
                  </>
                )}
                <span className="text-muted-foreground">Status</span>
                <span className={cn("text-right font-semibold", pngPlan?.adjusted ? "text-amber-600" : "text-emerald-600")}>
                  {format === "svg" ? "Vector · no canvas limit" : pngPlan?.adjusted ? "Adjusted to safe size" : "Safe"}
                </span>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Measuring the visible board content…</p>
            )}
            {pngPlan?.adjusted && (
              <div className="mt-3 rounded-lg bg-amber-500/10 p-3 text-[10px] leading-relaxed text-amber-800 dark:text-amber-200">
                This content is too large for {formatScale(pngPlan.requestedScale)} PNG export. It will export at the safe {formatScale(pngPlan.effectiveScale)} scale, producing {pngPlan.outputWidth.toLocaleString()} × {pngPlan.outputHeight.toLocaleString()} pixels.
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" className="h-7 text-[10px]" onClick={fitToSafeSize}>
                    Fit to safe PNG size
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => setFormat("svg")}>
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
            <Button className="max-sm:flex-1" onClick={() => void submit()} disabled={exporting || !resolved.value || (format === "png" && !pngPlan)}>
              {exporting ? "Exporting…" : `Export ${format.toUpperCase()}`}
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
