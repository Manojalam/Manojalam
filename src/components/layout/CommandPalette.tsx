"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useUIStore } from "@/store/ui-store";
import { useCanvasStore } from "@/store/canvas-store";
import { createBoard } from "@/lib/storage/board-store";
import { downloadJson } from "@/lib/export";
import { toast } from "sonner";

export function CommandPalette() {
  const { commandPaletteOpen, setCommandPaletteOpen, setSanskritPanelOpen, setActiveTool } = useUIStore();
  const { board, setSettings } = useCanvasStore();
  const router = useRouter();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [setCommandPaletteOpen]);

  const run = (fn: () => void) => {
    setCommandPaletteOpen(false);
    fn();
  };

  return (
    <CommandDialog open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen}>
      <CommandInput placeholder="Search commands…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Board">
          <CommandItem onSelect={() => run(async () => {
            const b = await createBoard();
            router.push(`/app/boards/${b.id}`);
          })}>New board</CommandItem>
          <CommandItem onSelect={() => run(() => router.push("/app/boards"))}>Search boards</CommandItem>
        </CommandGroup>
        <CommandGroup heading="Create">
          <CommandItem onSelect={() => run(() => setActiveTool("mindmap"))}>Add mind-map node</CommandItem>
          <CommandItem onSelect={() => run(() => setActiveTool("sticky"))}>Add sticky note</CommandItem>
          <CommandItem onSelect={() => run(() => setActiveTool("sanskrit"))}>Add Sanskrit card</CommandItem>
          <CommandItem onSelect={() => run(() => setActiveTool("shloka"))}>Add śloka card</CommandItem>
        </CommandGroup>
        <CommandGroup heading="View">
          <CommandItem onSelect={() => run(() => setSettings({ background: board?.content.settings.background === "dots" ? "plain" : "dots" }))}>
            Toggle grid
          </CommandItem>
          <CommandItem onSelect={() => run(() => setSanskritPanelOpen(true))}>Open Sanskrit tools</CommandItem>
          <CommandItem onSelect={() => run(() => router.push("/help/shortcuts"))}>Open shortcuts</CommandItem>
        </CommandGroup>
        <CommandGroup heading="Export">
          <CommandItem onSelect={() => run(() => board && downloadJson(board))}>Export JSON</CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
