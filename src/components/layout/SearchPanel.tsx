"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useUIStore } from "@/store/ui-store";
import { useCanvasStore } from "@/store/canvas-store";

export function SearchPanel() {
  const { searchPanelOpen, setSearchPanelOpen } = useUIStore();
  const { searchQuery, searchResults, performSearch, nodes } = useCanvasStore();

  return (
    <Dialog open={searchPanelOpen} onOpenChange={setSearchPanelOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Search Board</DialogTitle>
        </DialogHeader>
        <Input
          placeholder="Search nodes, tags, Sanskrit text…"
          aria-label="Search board"
          name="board-search"
          value={searchQuery}
          onChange={(e) => performSearch(e.target.value)}
          autoFocus
        />
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {searchResults.length === 0 && searchQuery && (
            <p className="py-4 text-center text-sm text-muted-foreground">No matches</p>
          )}
          {searchResults.map((id) => {
            const node = nodes.find((n) => n.id === id);
            const text =
              (node?.data as { text?: string; title?: string })?.text ??
              (node?.data as { title?: string })?.title ??
              id;
            return (
              <button
                key={id}
                className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
                onClick={() => {
                  setSearchPanelOpen(false);
                  useCanvasStore.getState().setSelectedNodeIds([id]);
                }}
              >
                <span className="text-xs text-muted-foreground">{node?.type}</span>
                <p className="truncate">{text}</p>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
