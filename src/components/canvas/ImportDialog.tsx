"use client";

import Image from "next/image";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  FileCode2,
  FileJson2,
  FileText,
  ImageIcon,
  IndentDecrease,
  IndentIncrease,
  Loader2,
  Plus,
  ScanText,
  Trash2,
} from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { LayoutPreview } from "@/components/canvas/LayoutPreview";
import {
  createDraftNode,
  fontFamilyForScript,
  IMPORT_LAYOUT_OPTIONS,
  locateDraftNode,
  parseHierarchyFile,
  refreshDraftScripts,
  scriptModeForText,
  type HierarchyDraft,
  type HierarchyDraftNode,
  type ImportLayoutMode,
  type ImportProgress,
} from "@/lib/import";
import { hierarchyDraftToBoardContent } from "@/lib/import/board";
import { createBoardFromContent, importBoard } from "@/lib/storage/board-store";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/store/canvas-store";

type ImportStep = "source" | "analyzing" | "review" | "layout" | "creating";
type SourcePickerKind = "json" | "pdf" | "text" | "html" | "image";
type ImportDestination = "new" | "current";

const SOURCE_OPTIONS: Array<{
  kind: SourcePickerKind;
  label: string;
  description: string;
  accept: string;
  icon: typeof FileJson2;
}> = [
  {
    kind: "json",
    label: "JSON backup",
    description: "Restore a lossless Manojalam backup as a new board",
    accept: ".json,application/json",
    icon: FileJson2,
  },
  {
    kind: "pdf",
    label: "PDF",
    description: "Use embedded text or local OCR",
    accept: ".pdf,application/pdf",
    icon: ScanText,
  },
  {
    kind: "text",
    label: "Text outline",
    description: "Read tabs, spaces, bullets, and numbering",
    accept: ".txt,text/plain",
    icon: FileText,
  },
  {
    kind: "html",
    label: "HTML",
    description: "Read nested lists and headings without OCR",
    accept: ".html,.htm,text/html",
    icon: FileCode2,
  },
  {
    kind: "image",
    label: "JPEG or PNG",
    description: "Recognize Sanskrit and English locally",
    accept: ".jpg,.jpeg,.png,image/jpeg,image/png",
    icon: ImageIcon,
  },
];

interface FlatDraftNode {
  node: HierarchyDraftNode;
  depth: number;
  parentId: string | null;
}

function flattenDraft(
  nodes: HierarchyDraftNode[],
  depth = 0,
  parentId: string | null = null
): FlatDraftNode[] {
  return nodes.flatMap((node) => [
    { node, depth, parentId },
    ...flattenDraft(node.children, depth + 1, node.id),
  ]);
}

function releaseDraftPreviews(draft: HierarchyDraft | null): void {
  draft?.previewPages?.forEach((preview) => URL.revokeObjectURL(preview.url));
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function ImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<ImportStep>("source");
  const [draft, setDraft] = useState<HierarchyDraft | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ImportProgress>({
    stage: "Preparing import",
    progress: 0,
  });
  const [layoutMode, setLayoutMode] = useState<ImportLayoutMode>("horizontal");
  const [destination, setDestination] = useState<ImportDestination>("new");
  const abortRef = useRef<AbortController | null>(null);
  const currentBoard = useCanvasStore((state) => state.board);
  const canImportIntoCurrent = currentBoard?.accessRole !== "viewer";

  const flattened = useMemo(
    () => flattenDraft(draft?.roots ?? []),
    [draft]
  );
  const selectedLocation = draft && selectedNodeId
    ? locateDraftNode(draft.roots, selectedNodeId)
    : null;
  const selectedNode = selectedLocation?.node ?? null;

  const reset = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    releaseDraftPreviews(draft);
    setDraft(null);
    setSelectedNodeId(null);
    setStep("source");
    setProgress({ stage: "Preparing import", progress: 0 });
    setLayoutMode("horizontal");
    setDestination("new");
  };

  const handleOpenChange = (next: boolean) => {
    if (!next && step === "creating") return;
    if (!next) reset();
    onOpenChange(next);
  };

  const closeAfterSuccess = () => {
    abortRef.current = null;
    releaseDraftPreviews(draft);
    setDraft(null);
    setSelectedNodeId(null);
    setStep("source");
    setProgress({ stage: "Preparing import", progress: 0 });
    setLayoutMode("horizontal");
    setDestination("new");
    onOpenChange(false);
  };

  const openFilePicker = (source: (typeof SOURCE_OPTIONS)[number]) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = source.accept;
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) void handleFile(file, source.kind);
    };
    input.click();
  };

  const handleFile = async (file: File, pickerKind: SourcePickerKind) => {
    if (pickerKind === "json") {
      setStep("creating");
      try {
        const imported = await importBoard(await file.text());
        toast.success("Board imported");
        closeAfterSuccess();
        router.push(`/app/boards/${imported.id}`);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Invalid board file"
        );
        setStep("source");
      }
      return;
    }

    releaseDraftPreviews(draft);
    const controller = new AbortController();
    abortRef.current = controller;
    setDraft(null);
    setStep("analyzing");
    setProgress({ stage: "Reading file", progress: 0 });
    try {
      const parsed = await parseHierarchyFile(file, {
        signal: controller.signal,
        onProgress: setProgress,
      });
      if (controller.signal.aborted) return;
      setDraft(parsed);
      setSelectedNodeId(parsed.roots[0]?.id ?? null);
      setStep("review");
    } catch (error) {
      if (!isAbortError(error)) {
        toast.error(
          error instanceof Error ? error.message : "Could not import this file"
        );
      }
      setStep("source");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const mutateDraft = (
    mutation: (next: HierarchyDraft) => void,
    nextSelection?: string | null
  ) => {
    setDraft((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      mutation(next);
      return next;
    });
    if (nextSelection !== undefined) setSelectedNodeId(nextSelection);
  };

  const updateSelected = (
    field: "label" | "notes",
    value: string
  ) => {
    if (!selectedNodeId) return;
    mutateDraft((next) => {
      const location = locateDraftNode(next.roots, selectedNodeId);
      if (!location) return;
      location.node[field] = value;
      location.node.scriptMode = scriptModeForText(
        `${location.node.label}\n${location.node.notes}`
      );
    });
  };

  const addChild = () => {
    const parentId = selectedNodeId ?? draft?.roots[0]?.id;
    if (!parentId) return;
    const child = createDraftNode("New item", { confidence: 1 });
    mutateDraft((next) => {
      locateDraftNode(next.roots, parentId)?.node.children.push(child);
    }, child.id);
  };

  const deleteSelected = () => {
    if (!draft || !selectedNodeId) return;
    const current = locateDraftNode(draft.roots, selectedNodeId);
    if (!current || (!current.parent && draft.roots.length === 1)) return;
    const nextSelection = current.parent?.id ?? draft.roots[0]?.id ?? null;
    mutateDraft((next) => {
      const location = locateDraftNode(next.roots, selectedNodeId);
      location?.siblings.splice(location.index, 1);
    }, nextSelection);
  };

  const moveSelected = (offset: -1 | 1) => {
    if (!draft || !selectedNodeId) return;
    mutateDraft((next) => {
      const location = locateDraftNode(next.roots, selectedNodeId);
      if (!location) return;
      const target = location.index + offset;
      if (target < 0 || target >= location.siblings.length) return;
      const [node] = location.siblings.splice(location.index, 1);
      location.siblings.splice(target, 0, node);
    });
  };

  const indentSelected = () => {
    if (!draft || !selectedNodeId) return;
    mutateDraft((next) => {
      const location = locateDraftNode(next.roots, selectedNodeId);
      if (!location || location.index === 0) return;
      const previous = location.siblings[location.index - 1];
      const [node] = location.siblings.splice(location.index, 1);
      previous.children.push(node);
    });
  };

  const outdentSelected = () => {
    if (!draft || !selectedNodeId) return;
    mutateDraft((next) => {
      const location = locateDraftNode(next.roots, selectedNodeId);
      if (!location?.parent) return;
      const parentLocation = locateDraftNode(next.roots, location.parent.id);
      // Keep one document root; its direct children cannot become new roots.
      if (!parentLocation?.parent) return;
      const [node] = location.siblings.splice(location.index, 1);
      parentLocation.siblings.splice(parentLocation.index + 1, 0, node);
    });
  };

  const commitImportedHierarchy = async () => {
    if (!draft) return;
    setStep("creating");
    try {
      const finalized = structuredClone(draft);
      refreshDraftScripts(finalized.roots);
      const { content, rootId } = hierarchyDraftToBoardContent(finalized, {
        presentation: layoutMode === "cards" ? "cards" : "hierarchy",
      });
      if (destination === "current") {
        const canvas = useCanvasStore.getState();
        if (!canvas.board || canvas.board.accessRole === "viewer") {
          throw new Error("This board is read-only. Create a new board instead.");
        }
        const insertion = canvas.insertImportedHierarchy(
          content.nodes,
          content.edges,
          rootId
        );
        if (!insertion) {
          throw new Error("The reviewed hierarchy does not contain any nodes.");
        }

        toast.success("Hierarchy added to this board", {
          description: `Added ${insertion.nodeIds.length} nodes as a separate ${layoutMode} chart.`,
        });
        closeAfterSuccess();
        requestAnimationFrame(() => {
          if (layoutMode === "cards") {
            window.dispatchEvent(new CustomEvent("vidya:fitview", {
              detail: {
                mode: layoutMode,
                rootId: insertion.rootId,
                nodeIds: insertion.nodeIds,
                forceFit: true,
              },
            }));
            return;
          }
          if (layoutMode === "list" || layoutMode === "matrix") {
            window.dispatchEvent(new CustomEvent("vidya:apply-measured-layout", {
              detail: {
                mode: layoutMode,
                rootId: insertion.rootId,
                nodeIds: insertion.nodeIds,
                fitAfter: true,
                recordHistory: false,
              },
            }));
            return;
          }

          const current = useCanvasStore.getState();
          current.applyLayout(
            layoutMode,
            insertion.rootId,
            { recordHistory: false }
          );
          requestAnimationFrame(() => {
            const insertedIds = new Set(insertion.nodeIds);
            const fittedNodeIds = useCanvasStore.getState().nodes
              .filter((node) => {
                if (node.hidden) return false;
                if (insertedIds.has(node.id)) return true;
                const data = (node.data ?? {}) as Record<string, unknown>;
                return node.type === "sunburst" && data.rootId === insertion.rootId;
              })
              .map((node) => node.id);
            window.dispatchEvent(new CustomEvent("vidya:fitview", {
              detail: {
                mode: layoutMode,
                rootId: insertion.rootId,
                nodeIds: fittedNodeIds,
                forceFit: true,
              },
            }));
          });
        });
        return;
      }

      const board = await createBoardFromContent(finalized.title, content);
      const params = new URLSearchParams({
        importLayout: layoutMode,
        importRoot: rootId,
      });
      toast.success("Hierarchy imported", {
        description: "Applying the selected layout to the new board.",
      });
      closeAfterSuccess();
      router.push(`/app/boards/${board.id}?${params.toString()}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not import the reviewed hierarchy"
      );
      setStep("layout");
    }
  };

  const imageSource = selectedNode?.source &&
    (selectedNode.source.kind === "pdf" || selectedNode.source.kind === "image")
    ? selectedNode.source
    : null;
  const currentPreview = imageSource
    ? draft?.previewPages?.find(
        (preview) => preview.page === imageSource.page
      )
    : draft?.previewPages?.[0];
  const textLines = draft?.previewText?.replace(/\r\n?/g, "\n").split("\n") ?? [];
  const sourceLine = selectedNode?.source &&
    (selectedNode.source.kind === "text" || selectedNode.source.kind === "html")
    ? selectedNode.source.lineStart
    : null;
  const snippetStart = sourceLine
    ? Math.max(0, sourceLine - 5)
    : 0;
  const snippet = textLines.slice(snippetStart, snippetStart + 11);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          "max-h-[92dvh] overflow-hidden",
          step === "review" || step === "layout"
            ? "sm:max-w-6xl"
            : "sm:max-w-2xl"
          ,
          step === "review" && "h-[92dvh] grid-rows-[auto_minmax(0,1fr)_auto_auto]"
        )}
      >
        <DialogHeader>
          <DialogTitle>
            {step === "source" && "Import"}
            {step === "analyzing" && "Analyzing document"}
            {step === "review" && "Review hierarchy"}
            {step === "layout" && "Choose initial layout"}
            {step === "creating" && (
              destination === "current" ? "Adding to board" : "Creating board"
            )}
          </DialogTitle>
          <DialogDescription>
            {step === "source" && "Choose a source. Documents and OCR stay in your browser."}
            {step === "analyzing" && "Recovering text, structure, and hierarchy locally."}
            {step === "review" && "Correct labels, notes, and parent-child relationships before creating the board."}
            {step === "layout" && "Choose where to place the reviewed hierarchy and how it should be displayed."}
            {step === "creating" && (
              destination === "current"
                ? "Adding the reviewed hierarchy as a separate chart on this board."
                : "Saving the reviewed hierarchy as a new board."
            )}
          </DialogDescription>
        </DialogHeader>

        {step === "source" && (
          <div className="grid gap-3 overflow-y-auto p-1 sm:grid-cols-2">
            {SOURCE_OPTIONS.map((source) => {
              const Icon = source.icon;
              return (
                <button
                  key={source.kind}
                  type="button"
                  onClick={() => openFilePicker(source)}
                  className="flex items-start gap-3 rounded-xl border border-border p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                >
                  <span className="rounded-lg bg-primary/10 p-2 text-primary">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold">{source.label}</span>
                    <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                      {source.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {step === "analyzing" && (
          <div className="space-y-5 py-8">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{progress.stage}</div>
                {progress.page && progress.pageCount && (
                  <div className="text-xs text-muted-foreground">
                    Page {progress.page} of {progress.pageCount}
                  </div>
                )}
              </div>
              <span className="text-xs tabular-nums text-muted-foreground">
                {Math.round(progress.progress * 100)}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width]"
                style={{ width: `${Math.round(progress.progress * 100)}%` }}
              />
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  abortRef.current?.abort();
                  setStep("source");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {step === "review" && draft && (
          <>
            <div className="grid min-h-0 flex-1 gap-4 overflow-hidden lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <section className="min-h-0 overflow-y-auto rounded-xl border bg-muted/20 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Source
                  </h3>
                  <span className="text-[11px] text-muted-foreground">{draft.sourceName}</span>
                </div>
                {currentPreview ? (
                  <div className="relative overflow-hidden rounded-lg border bg-white">
                    <Image
                      src={currentPreview.url}
                      alt={`Source page ${currentPreview.page}`}
                      width={currentPreview.width}
                      height={currentPreview.height}
                      unoptimized
                      className="h-auto w-full"
                    />
                    {selectedNode?.source &&
                      (selectedNode.source.kind === "pdf" || selectedNode.source.kind === "image") &&
                      selectedNode.source.bbox && (
                        <div
                          className="pointer-events-none absolute border-2 border-red-500 bg-red-400/15"
                          style={{
                            left: `${selectedNode.source.bbox.x * 100}%`,
                            top: `${selectedNode.source.bbox.y * 100}%`,
                            width: `${selectedNode.source.bbox.width * 100}%`,
                            height: `${selectedNode.source.bbox.height * 100}%`,
                          }}
                        />
                      )}
                  </div>
                ) : (
                  <div className="rounded-lg border bg-background p-3 font-mono text-xs leading-relaxed">
                    {snippet.map((line, index) => {
                      const lineNumber = snippetStart + index + 1;
                      return (
                        <div
                          key={`${lineNumber}-${line}`}
                          className={cn(
                            "grid grid-cols-[2.5rem_1fr] gap-2 rounded px-1 py-0.5",
                            sourceLine === lineNumber && "bg-amber-100 text-amber-950 dark:bg-amber-900/40 dark:text-amber-100"
                          )}
                        >
                          <span className="select-none text-right text-muted-foreground">{lineNumber}</span>
                          <span className="whitespace-pre-wrap break-words">{line || " "}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="grid min-h-0 grid-rows-[auto_minmax(12rem,1fr)_auto] overflow-hidden rounded-xl border">
                <div className="flex flex-wrap items-center gap-2 border-b p-2">
                  <Button type="button" size="sm" variant="outline" onClick={addChild}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> Child
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    title="Move up"
                    onClick={() => moveSelected(-1)}
                    disabled={!selectedLocation || selectedLocation.index === 0}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    title="Move down"
                    onClick={() => moveSelected(1)}
                    disabled={!selectedLocation || selectedLocation.index >= selectedLocation.siblings.length - 1}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    title="Indent beneath previous sibling"
                    onClick={indentSelected}
                    disabled={!selectedLocation || selectedLocation.index === 0}
                  >
                    <IndentIncrease className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    title="Outdent"
                    onClick={outdentSelected}
                    disabled={!selectedLocation?.parent || !locateDraftNode(draft.roots, selectedLocation.parent.id)?.parent}
                  >
                    <IndentDecrease className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    title="Delete item"
                    onClick={deleteSelected}
                    disabled={!selectedLocation || (!selectedLocation.parent && draft.roots.length === 1)}
                    className="text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {flattened.length} nodes
                  </span>
                </div>

                <div className="overflow-y-auto p-2">
                  {flattened.map(({ node, depth }) => (
                    <button
                      key={node.id}
                      type="button"
                      onClick={() => setSelectedNodeId(node.id)}
                      className={cn(
                        "mb-0.5 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                        selectedNodeId === node.id
                          ? "bg-primary/10 text-primary"
                          : "hover:bg-muted"
                      )}
                      style={{
                        paddingLeft: `${8 + depth * 18}px`,
                        fontFamily: fontFamilyForScript(node.scriptMode),
                      }}
                    >
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-60" />
                      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
                        {node.label || "Untitled"}
                      </span>
                      {node.confidence < 0.75 && (
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                      )}
                    </button>
                  ))}
                </div>

                {selectedNode && (
                  <div className="space-y-3 border-t bg-muted/20 p-3">
                    <div>
                      <label htmlFor="import-node-label" className="text-xs font-medium">
                        Node label
                      </label>
                      <Input
                        id="import-node-label"
                        value={selectedNode.label}
                        onChange={(event) => updateSelected("label", event.target.value)}
                        style={{ fontFamily: fontFamilyForScript(selectedNode.scriptMode) }}
                      />
                    </div>
                    <div>
                      <label htmlFor="import-node-notes" className="text-xs font-medium">
                        Notes and source text
                      </label>
                      <Textarea
                        id="import-node-notes"
                        value={selectedNode.notes}
                        onChange={(event) => updateSelected("notes", event.target.value)}
                        rows={4}
                        style={{ fontFamily: fontFamilyForScript(selectedNode.scriptMode) }}
                      />
                    </div>
                    {!!selectedNode.warnings?.length && (
                      <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>{selectedNode.warnings.join(" ")}</span>
                      </div>
                    )}
                  </div>
                )}
              </section>
            </div>

            {!!draft.warnings.length && (
              <div className="max-h-20 overflow-y-auto rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                {draft.warnings.join(" ")}
              </div>
            )}
            <div className="flex items-center justify-between">
              <Button type="button" variant="outline" onClick={reset}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Choose another file
              </Button>
              <Button
                type="button"
                onClick={() => setStep("layout")}
                disabled={!draft.roots.length || flattened.length === 0}
              >
                Choose layout <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </>
        )}

        {step === "layout" && draft && (
          <>
            <div className="space-y-2">
              <p className="text-xs font-medium">Import destination</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  aria-pressed={destination === "new"}
                  onClick={() => setDestination("new")}
                  className={cn(
                    "rounded-xl border p-3 text-left transition-colors",
                    destination === "new"
                      ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                      : "border-border hover:bg-muted"
                  )}
                >
                  <span className="block text-sm font-semibold">Create new board</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Keep the imported hierarchy on its own board.
                  </span>
                </button>
                <button
                  type="button"
                  aria-pressed={destination === "current"}
                  onClick={() => setDestination("current")}
                  disabled={!currentBoard || !canImportIntoCurrent}
                  className={cn(
                    "rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                    destination === "current"
                      ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                      : "border-border hover:bg-muted"
                  )}
                >
                  <span className="block text-sm font-semibold">Add to current board</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {currentBoard?.accessRole === "viewer"
                      ? "This board is view-only."
                      : currentBoard
                        ? `Add a separate chart to “${currentBoard.title}”.`
                        : "No current board is available."}
                  </span>
                </button>
              </div>
            </div>
            {destination === "new" && (
              <div>
                <label htmlFor="import-board-title" className="text-xs font-medium">
                  New board title
                </label>
                <Input
                  id="import-board-title"
                  value={draft.title}
                  onChange={(event) =>
                    mutateDraft((next) => {
                      next.title = event.target.value;
                    })
                  }
                  style={{ fontFamily: fontFamilyForScript(scriptModeForText(draft.title)) }}
                />
              </div>
            )}
            <div className="grid gap-3 overflow-y-auto py-1 sm:grid-cols-2 lg:grid-cols-3">
              {IMPORT_LAYOUT_OPTIONS.map((layout) => (
                <button
                  key={layout.mode}
                  type="button"
                  aria-pressed={layoutMode === layout.mode}
                  onClick={() => setLayoutMode(layout.mode)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                    layoutMode === layout.mode
                      ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                      : "border-border hover:bg-muted"
                  )}
                >
                  <LayoutPreview mode={layout.mode} className="h-14 w-20 shrink-0" />
                  <span>
                    <span className="block text-sm font-semibold">{layout.label}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {layout.description}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            {layoutMode === "cards" && (
              <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                Cards creates ordinary shape nodes with no connectors. You can
                select them afterward and change them to rectangles, ellipses,
                diamonds, or any other shape.
              </p>
            )}
            <div className="flex items-center justify-between">
              <Button type="button" variant="outline" onClick={() => setStep("review")}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Review
              </Button>
              <Button
                type="button"
                onClick={() => void commitImportedHierarchy()}
                disabled={destination === "current" && (!currentBoard || !canImportIntoCurrent)}
              >
                {destination === "current" ? "Add to this board" : "Create new board"}
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </>
        )}

        {step === "creating" && (
          <div className="flex items-center justify-center gap-3 py-12">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">
              {destination === "current"
                ? "Adding hierarchy and preparing layout…"
                : "Saving hierarchy and preparing layout…"}
            </span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
