"use client";

import { RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { useCanvasStore } from "@/store/canvas-store";
import { useUIStore } from "@/store/ui-store";
import { LAYOUT_OPTIONS, type LayoutMode } from "@/lib/layout";
import { buildHierarchy, getSubtree } from "@/lib/layout/hierarchy";
import { cn } from "@/lib/utils";
import { LayoutPreview } from "@/components/canvas/LayoutPreview";

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
              <LayoutPreview mode={option.mode} />
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
