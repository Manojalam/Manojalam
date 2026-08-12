"use client";

import { useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Layers3,
  ListMinus,
  ListPlus,
  Lock,
  Pencil,
  Plus,
  Trash2,
  Unlock,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useCanvasStore } from "@/store/canvas-store";
import { useUIStore } from "@/store/ui-store";
import {
  canvasItemLayerId,
  canvasLayerMemberIds,
} from "@/lib/canvas/layers";
import { cn } from "@/lib/utils";

export function CanvasLayersPanel() {
  const open = useUIStore((state) => state.layersPanelOpen);
  const setOpen = useUIStore((state) => state.setLayersPanelOpen);
  const layers = useCanvasStore((state) => state.layers);
  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);
  const selectedNodeIds = useCanvasStore((state) => state.selectedNodeIds);
  const selectedEdgeIds = useCanvasStore((state) => state.selectedEdgeIds);
  const createLayer = useCanvasStore((state) => state.createLayer);
  const renameLayer = useCanvasStore((state) => state.renameLayer);
  const setLayerVisibility = useCanvasStore((state) => state.setLayerVisibility);
  const setLayerLocked = useCanvasStore((state) => state.setLayerLocked);
  const moveLayer = useCanvasStore((state) => state.moveLayer);
  const assignSelectionToLayer = useCanvasStore((state) => state.assignSelectionToLayer);
  const removeSelectionFromLayer = useCanvasStore((state) => state.removeSelectionFromLayer);
  const deleteLayer = useCanvasStore((state) => state.deleteLayer);
  const selectLayer = useCanvasStore((state) => state.selectLayer);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");

  const activeLayer = layers.find((layer) => layer.id === activeLayerId) ?? null;
  const selectedCount = selectedNodeIds.length + selectedEdgeIds.length;
  const memberCounts = useMemo(() => new Map(layers.map((layer) => {
    const members = canvasLayerMemberIds(nodes, edges, layer.id);
    return [layer.id, members.nodeIds.length + members.edgeIds.length];
  })), [edges, layers, nodes]);
  const unlayeredCount = useMemo(() =>
    nodes.filter((node) => canvasItemLayerId(node) === null).length
      + edges.filter((edge) => canvasItemLayerId(edge) === null).length,
  [edges, nodes]);
  const removableSelectionCount = activeLayerId
    ? selectedNodeIds.filter((id) => {
        const node = nodes.find((candidate) => candidate.id === id);
        return node && canvasItemLayerId(node) === activeLayerId;
      }).length
      + selectedEdgeIds.filter((id) => {
        const edge = edges.find((candidate) => candidate.id === id);
        return edge && canvasItemLayerId(edge) === activeLayerId;
      }).length
    : 0;

  if (!open) return null;

  const handleCreate = (fromSelection: boolean) => {
    const layerId = createLayer(fromSelection);
    if (!layerId) {
      toast.error("Select one or more objects or connectors first.");
      return;
    }
    setActiveLayerId(layerId);
    const layer = useCanvasStore.getState().layers.find((candidate) => candidate.id === layerId);
    toast.success(fromSelection ? "Layer created from selection." : "Empty layer created.", {
      description: layer?.name,
      action: { label: "Undo", onClick: () => useCanvasStore.getState().undo() },
    });
  };

  const commitRename = (layerId: string) => {
    renameLayer(layerId, draftName);
    setEditingLayerId(null);
  };

  const activateAndSelect = (layerId: string | null) => {
    setActiveLayerId(layerId);
    selectLayer(layerId);
  };

  return (
    <aside className="vidya-float-panel layers-panel flex max-h-[calc(100dvh-100px)] w-72 flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Layers3 className="h-4 w-4 text-primary" />
          <div>
            <h3 className="text-sm font-semibold">Layers</h3>
            <p className="text-[9px] text-muted-foreground">Select a layer, then style it in the Inspector.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close layers panel"
          className="rounded-md p-1 text-muted-foreground hover:bg-muted"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-1.5 border-b p-2">
        <button
          type="button"
          onClick={() => handleCreate(true)}
          disabled={!selectedCount}
          className="flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary px-2 text-[10px] font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <ListPlus className="h-3.5 w-3.5" />
          From selection
        </button>
        <button
          type="button"
          onClick={() => handleCreate(false)}
          className="flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-2 text-[10px] font-medium text-foreground hover:bg-accent"
        >
          <Plus className="h-3.5 w-3.5" />
          Empty layer
        </button>
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto p-2">
        {!layers.length && (
          <div className="rounded-lg border border-dashed p-4 text-center">
            <Layers3 className="mx-auto h-5 w-5 text-muted-foreground" />
            <p className="mt-2 text-xs font-medium">No named layers yet</p>
            <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
              Select related objects and create a layer to style or manage them together.
            </p>
          </div>
        )}

        {[...layers].reverse().map((layer) => {
          const active = activeLayer?.id === layer.id;
          const editing = editingLayerId === layer.id;
          const atFront = layer.order === layers.length - 1;
          const atBack = layer.order === 0;
          return (
            <div
              key={layer.id}
              role="button"
              tabIndex={layer.visible && !layer.locked ? 0 : -1}
              aria-pressed={active}
              onClick={() => activateAndSelect(layer.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") activateAndSelect(layer.id);
              }}
              className={cn(
                "rounded-lg border p-1.5 transition-colors",
                active ? "border-primary/50 bg-primary/5" : "border-border bg-background hover:bg-accent/50",
                (!layer.visible || layer.locked) && "opacity-65"
              )}
            >
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  title={layer.visible ? "Hide layer" : "Show layer"}
                  aria-label={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setLayerVisibility(layer.id, !layer.visible);
                  }}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {layer.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </button>
                <button
                  type="button"
                  title={layer.locked ? "Unlock layer" : "Lock layer"}
                  aria-label={layer.locked ? `Unlock ${layer.name}` : `Lock ${layer.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setLayerLocked(layer.id, !layer.locked);
                  }}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {layer.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                </button>

                <div className="min-w-0 flex-1 px-1">
                  {editing ? (
                    <input
                      autoFocus
                      value={draftName}
                      maxLength={80}
                      aria-label="Layer name"
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => setDraftName(event.target.value)}
                      onBlur={() => commitRename(layer.id)}
                      onKeyDown={(event) => {
                        event.stopPropagation();
                        if (event.key === "Enter") commitRename(layer.id);
                        if (event.key === "Escape") setEditingLayerId(null);
                      }}
                      className="h-6 w-full rounded border border-primary/40 bg-background px-1.5 text-xs outline-none ring-1 ring-primary/20"
                    />
                  ) : (
                    <>
                      <p className="truncate text-xs font-medium text-foreground">{layer.name}</p>
                      <p className="text-[9px] text-muted-foreground">
                        {memberCounts.get(layer.id) ?? 0} object{memberCounts.get(layer.id) === 1 ? "" : "s"}
                      </p>
                    </>
                  )}
                </div>

                {editing ? (
                  <button
                    type="button"
                    title="Save layer name"
                    onClick={(event) => {
                      event.stopPropagation();
                      commitRename(layer.id);
                    }}
                    className="rounded p-1 text-primary hover:bg-primary/10"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    title="Rename layer"
                    onClick={(event) => {
                      event.stopPropagation();
                      setEditingLayerId(layer.id);
                      setDraftName(layer.name);
                    }}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {active && (
                <div className="mt-1 flex items-center justify-end gap-0.5 border-t border-border/70 pt-1">
                  <button
                    type="button"
                    title="Move layer forward"
                    disabled={atFront}
                    onClick={(event) => {
                      event.stopPropagation();
                      moveLayer(layer.id, "forward");
                    }}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Move layer backward"
                    disabled={atBack}
                    onClick={(event) => {
                      event.stopPropagation();
                      moveLayer(layer.id, "backward");
                    }}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Delete layer and keep its objects"
                    onClick={(event) => {
                      event.stopPropagation();
                      deleteLayer(layer.id);
                      setActiveLayerId(null);
                      toast.success("Layer deleted. Its objects are now unlayered.", {
                        action: { label: "Undo", onClick: () => useCanvasStore.getState().undo() },
                      });
                    }}
                    className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {unlayeredCount > 0 && (
          <button
            type="button"
            onClick={() => activateAndSelect(null)}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg border border-dashed px-2.5 py-2 text-left hover:bg-accent/50",
              activeLayerId === null && "border-primary/40 bg-primary/5"
            )}
          >
            <span className="h-3 w-3 rounded-sm border border-muted-foreground/50" />
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-medium">Unlayered</span>
              <span className="block text-[9px] text-muted-foreground">
                {unlayeredCount} object{unlayeredCount === 1 ? "" : "s"}
              </span>
            </span>
          </button>
        )}
      </div>

      <div className="space-y-1.5 border-t p-2">
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            disabled={!activeLayer || !selectedCount || activeLayer.locked || !activeLayer.visible}
            onClick={() => {
              if (!activeLayer) return;
              const count = assignSelectionToLayer(activeLayer.id);
              if (count) toast.success(`Added ${count} object${count === 1 ? "" : "s"} to ${activeLayer.name}.`);
            }}
            className="flex h-8 items-center justify-center gap-1 rounded-md border border-border bg-background px-2 text-[10px] font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ListPlus className="h-3.5 w-3.5" />
            Add selection
          </button>
          <button
            type="button"
            disabled={!activeLayer || !removableSelectionCount || activeLayer.locked}
            onClick={() => {
              if (!activeLayer) return;
              const count = removeSelectionFromLayer(activeLayer.id);
              if (count) toast.success(`Removed ${count} object${count === 1 ? "" : "s"} from ${activeLayer.name}.`);
            }}
            className="flex h-8 items-center justify-center gap-1 rounded-md border border-border bg-background px-2 text-[10px] font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ListMinus className="h-3.5 w-3.5" />
            Remove
          </button>
        </div>
        <p className="px-1 text-[9px] leading-relaxed text-muted-foreground">
          Clicking a visible, unlocked layer selects its contents. Existing multi-selection style controls then apply to every compatible member.
        </p>
      </div>
    </aside>
  );
}
