"use client";

import { useState } from "react";
import { objectPasteParent } from "@/lib/canvas/clipboard";
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
  const parent = objectPasteParent(nodes, selectedIds);
  const canPasteInto = Boolean(parent);
  const paste = (includeDescendants: boolean, into: boolean) => {
    useCanvasStore.getState().paste(undefined, {
      includeDescendants, parentId: into ? parent?.id : null,
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
        <div className="border-t px-3 pt-2 text-xs font-medium">
          {canPasteInto ? "Paste into selected cell / object" : "Paste onto board"}
        </div>
        <button type="button" className={itemClass} disabled={!clipboard} onClick={() => paste(false, canPasteInto)}>Object only</button>
        <button type="button" className={itemClass} disabled={!clipboard} onClick={() => paste(true, canPasteInto)}>With descendants</button>
        {canPasteInto && <>
          <div className="border-t px-3 pt-2 text-xs font-medium">Paste separately onto board</div>
          <button type="button" className={itemClass} disabled={!clipboard} onClick={() => paste(false, false)}>Object only onto board</button>
          <button type="button" className={itemClass} disabled={!clipboard} onClick={() => paste(true, false)}>With descendants onto board</button>
        </>}
        {!clipboard && <p className="px-3 py-2 text-xs text-muted-foreground">Copy an object first.</p>}
      </PopoverContent>
    </Popover>
  );
}
