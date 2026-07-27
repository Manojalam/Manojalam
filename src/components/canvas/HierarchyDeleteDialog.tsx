"use client";

import { GitBranch, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCanvasStore } from "@/store/canvas-store";

export function HierarchyDeleteDialog() {
  const pending = useCanvasStore((state) => state.pendingHierarchyDelete);
  const deleteSelected = useCanvasStore((state) => state.deleteSelected);
  const cancelHierarchyDelete = useCanvasStore((state) => state.cancelHierarchyDelete);

  const selectedCount = pending?.selectedNodeIds.length ?? 0;
  const descendantCount = pending?.descendantNodeIds.length ?? 0;
  const noun = descendantCount === 1 ? "descendant" : "descendants";

  return (
    <Dialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) cancelHierarchyDelete();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {selectedCount === 1 ? "Delete this parent?" : "Delete the selected parents?"}
          </DialogTitle>
          <DialogDescription>
            {descendantCount} unselected {noun} will be affected. Choose whether to keep
            them in the hierarchy or remove their entire branch.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-auto justify-start gap-3 whitespace-normal px-3 py-3 text-left"
            onClick={() => deleteSelected("promote-children")}
          >
            <GitBranch className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <span className="block font-medium">Delete selected only</span>
              <span className="block text-xs font-normal text-muted-foreground">
                Keep the children and move them to the nearest surviving parent.
              </span>
            </span>
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="h-auto justify-start gap-3 whitespace-normal px-3 py-3 text-left"
            onClick={() => deleteSelected("delete-branch")}
          >
            <Trash2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <span className="block font-medium">Delete entire branch</span>
              <span className="block text-xs font-normal opacity-90">
                Delete the selection and all {descendantCount} {noun}.
              </span>
            </span>
          </Button>
        </div>

        <div className="flex justify-end">
          <Button type="button" variant="ghost" onClick={cancelHierarchyDelete}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
