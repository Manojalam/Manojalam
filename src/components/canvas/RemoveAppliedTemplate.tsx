"use client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCanvasStore } from "@/store/canvas-store";
import type { TableAddress } from "@/lib/canvas/table";

export function RemoveAppliedTemplate({ nodeId, cell, disabled, onRemoved }: { nodeId: string; cell?: TableAddress; disabled?: boolean; onRemoved: () => void }) {
  const readonly = useCanvasStore(state => {
    const node = state.nodes.find(item => item.id === nodeId);
    return !node || !!node.data.locked || state.board?.accessRole === "viewer" || state.layers.some(layer => layer.id === node.data.layerId && layer.locked);
  });
  const container = cell ? "cell" : "object";
  return <div className="space-y-1">
    <Button type="button" size="sm" variant="outline" disabled={disabled || readonly} onClick={() => {
      if (!useCanvasStore.getState().removeAppliedTemplate(nodeId, cell)) return;
      onRemoved();
      toast.success(`Template and contents removed from this ${container}.`, { action: { label: "Undo", onClick: () => useCanvasStore.getState().undo() } });
    }}>Remove template and contents</Button>
    <p className="text-xs text-muted-foreground">Leaves this {container} empty. Keeps the {container} and saved template design. Undo restores everything.</p>
  </div>;
}
