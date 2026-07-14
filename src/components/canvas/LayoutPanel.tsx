"use client";

import { Grid3X3, Maximize2, Palette, RefreshCw, RotateCcw, Ungroup, X } from "lucide-react";
import { toast } from "sonner";
import { useCanvasStore } from "@/store/canvas-store";
import { useUIStore } from "@/store/ui-store";
import { LAYOUT_OPTIONS, type LayoutMode } from "@/lib/layout";
import { buildHierarchy, getSubtree } from "@/lib/layout/hierarchy";
import { supportsAutomaticLayoutColors } from "@/lib/layout/layout-palette";
import { RADIAL_COLOR_SCHEMES, radialColorScheme } from "@/lib/radial-layout";
import { cn } from "@/lib/utils";

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
  return LAYOUT_OPTIONS.find((option) => option.mode === mode)?.label ?? "Free Form";
}

export function LayoutPanel() {
  const open = useUIStore((s) => s.layoutPanelOpen);
  const setOpen = useUIStore((s) => s.setLayoutPanelOpen);
  const applyLayout = useCanvasStore((s) => s.applyLayout);
  const applyLayoutColorScheme = useCanvasStore((s) => s.applyLayoutColorScheme);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
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
  const matrixBranchIds = matrixRoot ? getSubtree(matrixRoot.id, hierarchy) : [];
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
  const activeColorScheme = radialColorScheme(
    paletteRootData.layoutColorScheme ?? paletteRootData.radialColorScheme
  ).id;

  const requestMeasuredLayout = (mode: "list" | "matrix", rootId: string, nodeIds: string[]) => {
    window.dispatchEvent(new CustomEvent("vidya:apply-measured-layout", {
      detail: { mode, rootId, nodeIds },
    }));
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
      setTimeout(() => window.dispatchEvent(new CustomEvent("vidya:fitview", {
        detail: { nodeIds: branchIds, mode, rootId: selectedNode.id },
      })), 60);
    }
    toast.success(`Applied ${layoutLabel(mode)} to ${affectedCount} node${affectedCount === 1 ? "" : "s"}.`, {
      description: (mode === "list" || mode === "matrix") && affectedCount > 30
        ? "The branch is large, so a readable zoom was preserved."
        : undefined,
      action: {
        label: "Undo",
        onClick: () => useCanvasStore.getState().undo(),
      },
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
            <p className="text-[10px] text-muted-foreground">Select one parent node first</p>
          )}
        </div>
        <button onClick={() => setOpen(false)} className="rounded-md p-1 text-muted-foreground hover:bg-muted">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {selectedNode ? (
          <div className="mb-2 rounded-lg border border-border bg-muted/35 p-2">
            <div className="truncate text-xs font-medium text-foreground">{nodeTitle(selectedNode)}</div>
            <div className="mt-1 grid grid-cols-2 gap-1 text-[10px] text-muted-foreground">
              <span>Descendants</span>
              <span className="text-right text-foreground">{Math.max(0, affectedCount - 1)}</span>
              <span>Current</span>
              <span className="text-right text-foreground">{layoutLabel(currentMode)}</span>
            </div>
          </div>
        ) : (
          <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[10px] text-amber-900">
            Layouts now apply only to a selected branch, so the whole board will not be rearranged by accident.
          </div>
        )}

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

        {selectedNode && currentMode === "radial" && (
          <div className="mt-2 rounded-lg border border-border bg-muted/35 p-2">
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
                onClick={() => window.dispatchEvent(new CustomEvent("vidya:fitview"))}
              >
                Fit
              </button>
            </div>
          </div>
        )}

        {paletteRoot && supportsAutomaticLayoutColors(paletteMode) && (
          <div className="mt-2 rounded-lg border border-border bg-muted/35 p-2">
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
          </div>
        )}

        {matrixRoot && (
          <div className="mt-2 rounded-lg border border-border bg-muted/35 p-2">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-medium text-foreground">Matrix table</div>
              <button
                type="button"
                title="Show or hide cell borders"
                aria-label="Show or hide cell borders"
                onClick={() => {
                  const rootMatrixData = (matrixRoot.data ?? {}) as Record<string, unknown>;
                  updateNodeData(matrixRoot.id, { matrixGridVisible: rootMatrixData.matrixGridVisible === false });
                  requestAnimationFrame(() => requestMeasuredLayout("matrix", matrixRoot.id, matrixBranchIds));
                }}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-md border",
                  ((matrixRoot.data as Record<string, unknown>).matrixGridVisible ?? true)
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground"
                )}
              >
                <Grid3X3 className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1">
              {(["compact", "comfortable", "presentation"] as const).map((density) => (
                <button
                  key={density}
                  type="button"
                  onClick={() => {
                    updateNodeData(matrixRoot.id, { matrixDensity: density });
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
          </div>
        )}
      </div>

      <div className="border-t px-3 py-2 text-[10px] text-muted-foreground">
        Tip: select the branch root before applying a layout.
      </div>
    </aside>
  );
}
