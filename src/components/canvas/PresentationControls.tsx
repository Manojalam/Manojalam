"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Node } from "@xyflow/react";
import { Panel, useReactFlow } from "@xyflow/react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Grid2X2,
  Maximize2,
  Minimize2,
  MousePointer2,
  Presentation,
  Rows3,
  X,
} from "lucide-react";
import { toast } from "sonner";

import type { PresentationStop } from "@/lib/canvas/presentation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/store/ui-store";

function ControlButton({
  label,
  onClick,
  disabled = false,
  active = false,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active || undefined}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 transition",
        "hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
        "disabled:cursor-not-allowed disabled:opacity-30",
        active && "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200"
      )}
    >
      {children}
    </button>
  );
}

export function PresentationControls({
  nodes,
  stops,
}: {
  nodes: readonly Node[];
  stops: readonly PresentationStop[];
}) {
  const { fitView } = useReactFlow();
  const presentationStep = useUIStore((state) => state.presentationStep);
  const presentationOrder = useUIStore((state) => state.presentationOrder);
  const setPresentationStep = useUIStore((state) => state.setPresentationStep);
  const setPresentationOrder = useUIStore((state) => state.setPresentationOrder);
  const stopPresentation = useUIStore((state) => state.stopPresentation);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [laserEnabled, setLaserEnabled] = useState(false);
  const [pointer, setPointer] = useState({ x: 0, y: 0, visible: false });
  const safeStep = Math.min(Math.max(0, presentationStep), Math.max(0, stops.length - 1));
  const currentStop = stops[safeStep];
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  const goTo = useCallback((step: number) => {
    if (!stops.length) return;
    setPresentationStep(Math.min(Math.max(0, step), stops.length - 1));
  }, [setPresentationStep, stops.length]);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      toast.error("Fullscreen is not available in this browser window.");
    }
  }, []);

  const exitPresentation = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    stopPresentation();
  }, [stopPresentation]);

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    handleFullscreenChange();
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (presentationStep !== safeStep) setPresentationStep(safeStep);
  }, [presentationStep, safeStep, setPresentationStep]);

  useEffect(() => {
    if (!currentStop) return;
    const targetNodes = currentStop.nodeIds
      .map((nodeId) => nodeById.get(nodeId))
      .filter((node): node is Node => Boolean(node) && !node?.hidden);
    if (!targetNodes.length) return;

    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        void fitView({
          nodes: targetNodes,
          padding: currentStop.kind === "overview" ? 0.12 : 0.2,
          duration: 520,
          maxZoom: currentStop.kind === "overview" ? 1.4 : 1.9,
        });
      });
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      if (secondFrame) cancelAnimationFrame(secondFrame);
    };
  }, [currentStop, fitView, nodeById]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("[data-presentation-controls]")) return;
      const key = event.key.toLowerCase();
      if (["arrowright", "arrowdown", "pagedown", " "].includes(key)) {
        event.preventDefault();
        goTo(safeStep + 1);
      } else if (["arrowleft", "arrowup", "pageup"].includes(key)) {
        event.preventDefault();
        goTo(safeStep - 1);
      } else if (key === "home" || key === "o") {
        event.preventDefault();
        goTo(0);
      } else if (key === "end") {
        event.preventDefault();
        goTo(stops.length - 1);
      } else if (key === "l") {
        event.preventDefault();
        setLaserEnabled((enabled) => !enabled);
      } else if (key === "r") {
        event.preventDefault();
        setPresentationOrder(presentationOrder === "rows" ? "columns" : "rows");
      } else if (key === "f") {
        event.preventDefault();
        void toggleFullscreen();
      } else if (key === "escape") {
        event.preventDefault();
        exitPresentation();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    exitPresentation,
    goTo,
    presentationOrder,
    safeStep,
    setPresentationOrder,
    stops.length,
    toggleFullscreen,
  ]);

  useEffect(() => {
    if (!laserEnabled) return;
    const handlePointerMove = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      setPointer({
        x: event.clientX,
        y: event.clientY,
        visible: !target?.closest("[data-presentation-controls]"),
      });
    };
    const hidePointer = () => setPointer((current) => ({ ...current, visible: false }));
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerleave", hidePointer);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerleave", hidePointer);
    };
  }, [laserEnabled]);

  if (!currentStop) return null;

  return (
    <>
      <Panel position="top-left" className="presentation-heading !m-4">
        <div className="rounded-2xl border border-white/70 bg-white/90 px-4 py-3 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/88">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-600 dark:text-indigo-300">
            <Presentation className="h-3.5 w-3.5" />
            Teaching mode
          </div>
          <p className="mt-1 max-w-[min(70vw,34rem)] truncate text-base font-semibold text-slate-950 dark:text-white" aria-live="polite">
            {currentStop.title}
          </p>
        </div>
      </Panel>

      <Panel position="bottom-center" className="presentation-dock !mb-5">
        <div
          data-presentation-controls
          className="flex items-center gap-1 rounded-2xl border border-white/80 bg-white/94 p-1.5 shadow-2xl shadow-slate-900/20 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/94"
        >
          <ControlButton label="Board overview (O)" onClick={() => goTo(0)} active={safeStep === 0}>
            <Grid2X2 className="h-4 w-4" />
          </ControlButton>
          <div className="mx-0.5 h-6 w-px bg-slate-200 dark:bg-slate-700" />
          <ControlButton label="Previous topic" onClick={() => goTo(safeStep - 1)} disabled={safeStep === 0}>
            <ChevronLeft className="h-5 w-5" />
          </ControlButton>
          <div className="min-w-[9rem] px-2 text-center">
            <p className="truncate text-xs font-semibold text-slate-900 dark:text-white">{currentStop.title}</p>
            <p className="mt-0.5 text-[10px] tabular-nums text-slate-500 dark:text-slate-400">
              {safeStep + 1} of {stops.length}
            </p>
          </div>
          <ControlButton label="Next topic" onClick={() => goTo(safeStep + 1)} disabled={safeStep === stops.length - 1}>
            <ChevronRight className="h-5 w-5" />
          </ControlButton>
          <div className="mx-0.5 h-6 w-px bg-slate-200 dark:bg-slate-700" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Teaching path: ${presentationOrder === "rows" ? "row by row" : "column by column"}`}
                title="Change teaching path (R)"
                className="flex h-10 w-10 items-center justify-center rounded-xl text-indigo-700 transition hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-indigo-300 dark:hover:bg-indigo-950"
              >
                {presentationOrder === "rows"
                  ? <Rows3 className="h-4 w-4" />
                  : <Columns3 className="h-4 w-4" />}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              data-presentation-controls
              side="top"
              align="center"
              sideOffset={12}
              className="w-64 rounded-xl p-1.5 shadow-xl"
            >
              <DropdownMenuLabel className="px-2 pb-1 pt-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                Teaching path
              </DropdownMenuLabel>
              <DropdownMenuItem
                onSelect={() => setPresentationOrder("rows")}
                className="items-start rounded-lg py-2"
              >
                <Rows3 className="mt-0.5" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">Row by row</span>
                  <span className="block text-[11px] text-muted-foreground">Left to right, then move down</span>
                </span>
                {presentationOrder === "rows" && <Check className="mt-0.5 text-primary" />}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => setPresentationOrder("columns")}
                className="items-start rounded-lg py-2"
              >
                <Columns3 className="mt-0.5" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">Column by column</span>
                  <span className="block text-[11px] text-muted-foreground">Top to bottom, then move right</span>
                </span>
                {presentationOrder === "columns" && <Check className="mt-0.5 text-primary" />}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <ControlButton label="Laser pointer (L)" onClick={() => setLaserEnabled((enabled) => !enabled)} active={laserEnabled}>
            <MousePointer2 className="h-4 w-4" />
          </ControlButton>
          <ControlButton label={isFullscreen ? "Exit fullscreen (F)" : "Enter fullscreen (F)"} onClick={() => void toggleFullscreen()}>
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </ControlButton>
          <ControlButton label="End presentation (Esc)" onClick={exitPresentation}>
            <X className="h-4 w-4" />
          </ControlButton>
        </div>
        <p className="mt-2 text-center text-[10px] font-medium text-slate-500 drop-shadow-sm dark:text-slate-300">
          Arrow keys or Space to move · R changes path · drag to pan
        </p>
      </Panel>

      {laserEnabled && pointer.visible && (
        <div
          aria-hidden="true"
          className="presentation-laser-pointer"
          style={{ left: pointer.x, top: pointer.y }}
        />
      )}
    </>
  );
}
