"use client";

import { RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { useCanvasStore } from "@/store/canvas-store";
import { useUIStore } from "@/store/ui-store";
import { LAYOUT_OPTIONS, type LayoutMode } from "@/lib/layout";
import { buildHierarchy, getSubtree } from "@/lib/layout/hierarchy";
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
    default:
      content = <>{dot(12, 12)}{dot(40, 10)}{dot(22, 28)}{dot(46, 30)}{dot(10, 32)}</>;
  }
  return (
    <svg viewBox="0 0 56 40" className="h-10 w-14 rounded-md border border-border bg-muted/40">
      {content}
    </svg>
  );
}

function layoutLabel(mode: string | undefined): string {
  if (mode === "topDown") return "Vertical";
  return LAYOUT_OPTIONS.find((option) => option.mode === mode)?.label ?? "Free Form";
}

export function LayoutPanel() {
  const open = useUIStore((state) => state.layoutPanelOpen);
  const setOpen = useUIStore((state) => state.setLayoutPanelOpen);
  const applyLayout = useCanvasStore((state) => state.applyLayout);
  const resetMatrixLayout = useCanvasStore((state) => state.resetMatrixLayout);
  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);
  const selectedNodeIds = useCanvasStore((state) => state.selectedNodeIds);

  if (!open) return null;

  const selectedNode = selectedNodeIds.length === 1
    ? nodes.find((node) => node.id === selectedNodeIds[0]) ?? null
    : null;
  const hierarchy = buildHierarchy(nodes, edges);
  const branchIds = selectedNode ? getSubtree(selectedNode.id, hierarchy) : [];
  const selectedData = (selectedNode?.data ?? {}) as Record<string, unknown>;
  const matrixRootId = selectedData.layoutMode === "matrix"
    ? selectedNode?.id
    : typeof selectedData.matrixRootId === "string" ? selectedData.matrixRootId : undefined;
  const matrixRootNode = matrixRootId
    ? nodes.find((node) => node.id === matrixRootId) ?? null
    : null;
  const currentMode = matrixRootNode
    ? "matrix"
    : selectedNode
      ? (selectedData.layoutMode as string | undefined) ?? "freeForm"
      : undefined;

  const handleApply = (mode: LayoutMode) => {
    if (!selectedNode) {
      toast.error("Select one parent node first to apply a branch layout.");
      return;
    }
    if (mode === "list" || mode === "matrix") {
      window.dispatchEvent(new CustomEvent("vidya:apply-measured-layout", {
        detail: { mode, rootId: selectedNode.id, nodeIds: branchIds },
      }));
    } else {
      applyLayout(mode, selectedNode.id);
    }
    toast.success(`Applied ${layoutLabel(mode)} to ${branchIds.length} node${branchIds.length === 1 ? "" : "s"}.`, {
      description: (mode === "list" || mode === "matrix") && branchIds.length > 30
        ? "The branch is large, so a readable zoom was preserved."
        : (mode === "horizontal" || mode === "vertical") && branchIds.length > 30
          ? "The branch is large; pan to inspect it or use Fit for an overview."
          : undefined,
      action: {
        label: "Undo",
        onClick: () => useCanvasStore.getState().undo(),
      },
    });
  };

  const handleMatrixReset = () => {
    if (!matrixRootNode) return;
    const changed = resetMatrixLayout(matrixRootNode.id);
    toast.success(
      changed
        ? "Reset Matrix layout to automatic defaults."
        : "Matrix layout is already using automatic defaults.",
      changed
        ? {
            description: "Content, colors, and styling were preserved.",
            action: {
              label: "Undo",
              onClick: () => useCanvasStore.getState().undo(),
            },
          }
        : undefined
    );
  };

  return (
    <aside className="vidya-float-panel layout-panel flex max-h-[calc(100dvh-100px)] w-64 flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2.5">
        <h3 className="text-sm font-semibold">Choose layout</h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close layout picker"
          className="rounded-md p-1 text-muted-foreground hover:bg-muted"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <div className="flex flex-col gap-1">
          {LAYOUT_OPTIONS.map((option) => (
            <button
              key={option.mode}
              type="button"
              onClick={() => handleApply(option.mode)}
              aria-pressed={currentMode === option.mode}
              className={cn(
                "flex items-center gap-3 rounded-lg border border-transparent p-2 text-left transition-colors",
                currentMode === option.mode
                  ? "border-primary/40 bg-primary/5"
                  : "hover:border-border hover:bg-accent"
              )}
            >
              <Preview mode={option.mode} />
              <div className="min-w-0">
                <div className="text-xs font-medium text-foreground">{option.label}</div>
                <div className="truncate text-[10px] text-muted-foreground">{option.description}</div>
              </div>
            </button>
          ))}
        </div>
        {matrixRootNode && (
          <div className="mt-2 rounded-lg border border-border bg-muted/30 p-2">
            <div className="text-xs font-medium text-foreground">Matrix controls</div>
            <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
              Restore automatic sizing, spacing, direction, and table settings for the whole Matrix.
            </p>
            <button
              type="button"
              onClick={handleMatrixReset}
              className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-border bg-background px-2 text-xs font-medium text-foreground transition-colors hover:bg-accent"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset Matrix layout
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
