"use client";

import { useState } from "react";
import { Clipboard } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCanvasStore } from "@/store/canvas-store";

/** App clipboard also works on touch devices without browser clipboard permission. */
export function ObjectClipboardMenu() {
  const [open, setOpen] = useState(false);
  const clipboard = useCanvasStore((state) => state.clipboard);
  const selectedIds = useCanvasStore((state) => state.selectedNodeIds);
  const nodes = useCanvasStore((state) => state.nodes);
  const parent = selectedIds.length === 1 ? nodes.find((node) => node.id === selectedIds[0]) : undefined;
  const canPasteInto = Boolean(parent && !parent.data.locked && !parent.data.externalNote
    && !["frame", "sunburst", "relationshipDiagram", "junction"].includes(parent.type ?? ""));
  const paste = (includeDescendants: boolean, into: boolean) => {
    useCanvasStore.getState().paste(undefined, {
      includeDescendants, parentId: into ? parent?.id : undefined,
    });
    setOpen(false);
    toast.success(into ? "Pasted as a child of the selected object." : "Pasted onto the board.", {
      action: { label: "Undo", onClick: () => useCanvasStore.getState().undo() },
    });
  };
  const itemClass = "w-full rounded px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-40 disabled:pointer-events-none";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" title="Copy and paste objects" aria-label="Copy and paste objects"
          className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-accent">
          <Clipboard className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 max-w-[calc(100vw-1rem)] p-1" side="bottom" align="start" collisionPadding={8} sticky="always">
        <button type="button" className={itemClass} disabled={!selectedIds.length} onClick={() => {
          useCanvasStore.getState().copySelected();
          setOpen(false);
          toast.success("Object copied. Select a destination and open Copy and paste objects.");
        }}>Copy selected object{selectedIds.length > 1 ? "s" : ""}</button>
        <div className="px-3 pb-2 text-xs text-muted-foreground">Keeps content, links and formatting. Choose descendants when pasting.</div>
        <div className="border-t px-3 pt-2 text-xs font-medium">Paste onto board</div>
        <button type="button" className={itemClass} disabled={!clipboard} onClick={() => paste(false, false)}>Object only</button>
        <button type="button" className={itemClass} disabled={!clipboard} onClick={() => paste(true, false)}>With descendants</button>
        <div className="border-t px-3 pt-2 text-xs font-medium">Paste into selected object</div>
        <button type="button" className={itemClass} disabled={!clipboard || !canPasteInto} onClick={() => paste(false, true)}>Object only as child</button>
        <button type="button" className={itemClass} disabled={!clipboard || !canPasteInto} onClick={() => paste(true, true)}>With descendants as child</button>
        {!clipboard && <p className="px-3 py-2 text-xs text-muted-foreground">Copy an object first.</p>}
      </PopoverContent>
    </Popover>
  );
}
