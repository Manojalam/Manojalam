"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Undo2, Redo2, Download, Upload, Search,
  ChevronDown, Eye, Share2,
  Languages, Sun, Moon, Presentation,
  Layers3,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { useCanvasStore } from "@/store/canvas-store";
import { useUIStore } from "@/store/ui-store";
import {
  downloadHtmlOutline,
  downloadJson,
  downloadMarkdown,
  downloadPdfOutline,
  downloadTextOutline,
} from "@/lib/export";
import { cn } from "@/lib/utils";
import { APP_NAME, BOARD_CONTENT_VERSION } from "@/lib/config";
import type { BoardContent, VidyaBoard } from "@/lib/types";
import { buildPresentationStops } from "@/lib/canvas/presentation";
import { canvasLayerById, isCanvasItemLayerVisible } from "@/lib/canvas/layers";
import { UserMenu } from "@/components/layout/UserMenu";
import { BoardShareDialog } from "@/components/canvas/BoardShareDialog";
import { ImportDialog } from "@/components/canvas/ImportDialog";
import { toast } from "sonner";

/* ── Save status dot ── */
function SaveStatus({ status, readOnly }: { status: string; readOnly: boolean }) {
  return (
    <span
      className={cn(
        "hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium sm:flex",
        readOnly && "bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
        !readOnly && status === "saved"   && "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
        !readOnly && status === "saving"  && "bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
        !readOnly && status === "unsaved" && "bg-muted text-muted-foreground",
        !readOnly && status === "error"   && "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400",
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          readOnly && "bg-sky-500",
          !readOnly && status === "saved"   && "bg-emerald-500",
          !readOnly && status === "saving"  && "animate-pulse bg-amber-500",
          !readOnly && status === "unsaved" && "bg-muted-foreground",
          !readOnly && status === "error"   && "bg-red-500",
        )}
      />
      {readOnly
        ? "View only"
        : { saved: "Saved", saving: "Saving…", unsaved: "Unsaved", error: "Error" }[status]}
    </span>
  );
}

/* ── Icon button ── */
function IconBtn({
  icon, label, onClick, disabled, className,
}: {
  icon: React.ReactNode; label: string; onClick?: () => void;
  disabled?: boolean; className?: string;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "h-8 w-8 rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        className
      )}
    >
      {icon}
    </Button>
  );
}

/* ── Theme toggle ── */
function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      {isDark
        ? <Sun className="h-4 w-4" />
        : <Moon className="h-4 w-4" />}
    </button>
  );
}

export function CanvasTopbar() {
  const [shareOpen, setShareOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [powerPointExporting, setPowerPointExporting] = useState(false);
  // Targeted selectors — each only re-renders when its own slice changes
  const board           = useCanvasStore((s) => s.board);
  const saveStatus      = useCanvasStore((s) => s.saveStatus);
  const undo            = useCanvasStore((s) => s.undo);
  const redo            = useCanvasStore((s) => s.redo);
  const updateBoardTitle = useCanvasStore((s) => s.updateBoardTitle);
  const hasPresentableContent = useCanvasStore((s) => {
    const layersById = canvasLayerById(s.layers);
    return s.nodes.some((node) => !node.hidden && isCanvasItemLayerVisible(node, layersById));
  });
  const relationshipSelection = useUIStore((s) => s.relationshipSelection);
  const layersPanelOpen = useUIStore((s) => s.layersPanelOpen);
  const setLayersPanelOpen = useUIStore((s) => s.setLayersPanelOpen);
  const openBoardExport = useUIStore((s) => s.openBoardExport);
  const { setSanskritPanelOpen, setSearchPanelOpen, startPresentation } = useUIStore();
  const canEdit = board?.accessRole !== "viewer";

  const currentBoardSnapshot = (): VidyaBoard | null => {
    const state = useCanvasStore.getState();
    if (!state.board) return null;
    return {
      ...state.board,
      content: {
        ...state.board.content,
        version: BOARD_CONTENT_VERSION,
        nodes: state.nodes,
        edges: state.edges,
        relationships: state.relationships,
        relationshipFans: state.relationshipFans,
        layers: state.layers,
        viewport: state.viewport,
        settings: state.settings,
      } as BoardContent,
    };
  };

  const exportEditablePowerPoint = async () => {
    const state = useCanvasStore.getState();
    if (!state.board || powerPointExporting) return;
    const stops = buildPresentationStops(
      state.nodes,
      state.edges,
      useUIStore.getState().presentationOrder
    );
    if (!stops.length) {
      toast.error("Add a visible chart before exporting a PowerPoint presentation.");
      return;
    }
    setPowerPointExporting(true);
    const toastId = toast.loading("Building an editable PowerPoint presentation…");
    try {
      const { downloadEditablePowerPoint } = await import("@/lib/export/powerpoint");
      const result = await downloadEditablePowerPoint({
        boardTitle: state.board.title || "Teaching chart",
        nodes: state.nodes,
        edges: state.edges,
        relationships: state.relationships,
        stops,
        onProgress: (completed, total) => {
          toast.loading(`Building editable PowerPoint slide ${completed} of ${total}…`, {
            id: toastId,
          });
        },
      });
      const warningText = result.warnings.length
        ? ` ${result.warnings.length} chart${result.warnings.length === 1 ? "" : "s"} used an editable fallback.`
        : "";
      toast.success(
        `PowerPoint downloaded: ${result.slideCount} slide${result.slideCount === 1 ? "" : "s"}, ${result.editableObjectCount} editable objects.${warningText}`,
        { id: toastId, duration: 6000 }
      );
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Unable to export the editable PowerPoint presentation.",
        { id: toastId }
      );
    } finally {
      setPowerPointExporting(false);
    }
  };

  return (
    <>
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-card px-3 shadow-sm max-sm:gap-1 max-sm:px-2">
      {/* Logo */}
      <Link href="/app" className="mr-1 flex shrink-0 items-center gap-2">
        <div className="logo-font flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground text-base shadow-sm">
          म
        </div>
        <span className="logo-font hidden text-[15px] text-foreground sm:inline tracking-tight">{APP_NAME}</span>
      </Link>

      {/* Divider */}
      <div className="h-5 w-px bg-border max-sm:hidden" />

      {/* Undo / Redo */}
      <div className="flex items-center gap-0.5">
        <IconBtn icon={<Undo2 className="h-4 w-4" />} label="Undo (⌘Z)" onClick={undo} disabled={!canEdit || Boolean(relationshipSelection)} />
        <IconBtn icon={<Redo2 className="h-4 w-4" />} label="Redo (⌘⇧Z)" onClick={redo} disabled={!canEdit || Boolean(relationshipSelection)} />
      </div>

      {/* Divider */}
      <div className="h-5 w-px bg-border max-sm:hidden" />

      {/* Board title — centered */}
      <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
        <Input
          value={board?.title ?? ""}
          onChange={(e) => updateBoardTitle(e.target.value)}
          readOnly={!canEdit}
          className="h-8 max-w-[420px] min-w-0 border-transparent bg-transparent text-center text-sm font-semibold text-foreground shadow-none focus-visible:border-primary/40 focus-visible:bg-accent focus-visible:ring-1 focus-visible:ring-primary/30 max-sm:max-w-full"
          aria-label="Board title"
          name="board-title"
        />
        <SaveStatus status={saveStatus} readOnly={!canEdit} />
      </div>

      {/* Right actions */}
      <div className="flex shrink-0 items-center gap-1 max-sm:gap-0.5">
        <IconBtn
          icon={<Search className="h-4 w-4" />}
          label="Search (⌘F)"
          onClick={() => setSearchPanelOpen(true)}
        />
        <IconBtn
          icon={<Layers3 className="h-4 w-4" />}
          label="Layers"
          onClick={() => setLayersPanelOpen(!layersPanelOpen)}
          disabled={!canEdit || Boolean(relationshipSelection)}
        />
        <IconBtn
          icon={<Languages className="h-4 w-4" />}
          label="Sanskrit tools"
          onClick={() => setSanskritPanelOpen(true)}
          className="max-sm:hidden"
        />

        {/* Export dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="h-8 gap-1.5 rounded-lg px-2.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Export</span>
              <ChevronDown className="h-3 w-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52 rounded-xl shadow-xl">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Export as</DropdownMenuLabel>
            <DropdownMenuItem
              disabled={!board || !hasPresentableContent || powerPointExporting || Boolean(relationshipSelection)}
              onClick={() => void exportEditablePowerPoint()}
            >
              {powerPointExporting ? "Building PowerPoint…" : "Editable PowerPoint (.pptx)"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => {
              const snapshot = currentBoardSnapshot();
              if (snapshot) downloadJson(snapshot);
            }}>JSON backup</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">Hierarchical outline</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => {
              const snapshot = currentBoardSnapshot();
              if (snapshot) downloadMarkdown(snapshot);
            }}>Markdown (.md)</DropdownMenuItem>
            <DropdownMenuItem onClick={() => {
              const snapshot = currentBoardSnapshot();
              if (snapshot) downloadTextOutline(snapshot);
            }}>Plain text (.txt)</DropdownMenuItem>
            <DropdownMenuItem onClick={() => {
              const snapshot = currentBoardSnapshot();
              if (snapshot) downloadHtmlOutline(snapshot);
            }}>Web page (.html)</DropdownMenuItem>
            <DropdownMenuItem onClick={() => {
              const snapshot = currentBoardSnapshot();
              if (!snapshot) return;
              const toastId = toast.loading("Preparing hierarchical PDF outline...");
              void downloadPdfOutline(snapshot)
                .then(({ pageCount }) => {
                  toast.success(
                    `PDF outline download initiated (${pageCount} page${pageCount === 1 ? "" : "s"}).`,
                    { id: toastId }
                  );
                })
                .catch((error: unknown) => {
                  toast.error(
                    error instanceof Error ? error.message : "Unable to export the PDF outline.",
                    { id: toastId }
                  );
                });
            }}>Document (.pdf)</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={!board || Boolean(relationshipSelection)}
              onClick={() => openBoardExport({
                scope: useCanvasStore.getState().selectedNodeIds.length
                  || useCanvasStore.getState().selectedEdgeIds.length
                  ? undefined
                  : "board",
                title: board?.title,
              })}
            >
              Visual board or selection…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <IconBtn
          icon={<Upload className="h-4 w-4" />}
          label="Import"
          onClick={() => setImportOpen(true)}
          className="max-sm:hidden"
        />

        <UserMenu compact align="end" side="bottom" />

        <div className="h-5 w-px bg-border mx-1 max-sm:hidden" />

        {/* Theme toggle */}
        <div className="max-sm:hidden"><ThemeToggle /></div>

        <div className="h-5 w-px bg-border mx-1 max-sm:hidden" />

        <button
          type="button"
          title="Present this board"
          onClick={() => {
            useCanvasStore.setState((state) => ({
              nodes: state.nodes.map((node) => node.selected ? { ...node, selected: false } : node),
              edges: state.edges.map((edge) => edge.selected ? { ...edge, selected: false } : edge),
              selectedNodeIds: [],
              selectedEdgeIds: [],
            }));
            startPresentation();
          }}
          disabled={!hasPresentableContent}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 text-[13px] font-semibold text-indigo-700 shadow-sm transition-colors hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-200 dark:hover:bg-indigo-900/60 max-sm:w-8 max-sm:justify-center max-sm:px-0"
        >
          <Presentation className="h-3.5 w-3.5" />
          <span className="max-sm:hidden">Present</span>
        </button>

        {/* Share button */}
        <button
          type="button"
          onClick={() => setShareOpen(true)}
          disabled={!board}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[13px] font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 max-sm:px-2"
        >
          {board?.accessRole === "viewer"
            ? <Eye className="h-3.5 w-3.5" />
            : <Share2 className="h-3.5 w-3.5" />}
          <span className="max-sm:hidden">Share</span>
        </button>
      </div>
    </header>
    {board && (
      <BoardShareDialog
        board={board}
        open={shareOpen}
        onOpenChange={setShareOpen}
      />
    )}
    <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </>
  );
}
