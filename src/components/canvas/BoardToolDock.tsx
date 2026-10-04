"use client";

import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, LayoutTemplate } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import { useCanvasStore } from "@/store/canvas-store";
import { useUIStore } from "@/store/ui-store";
import { SaveBoxTemplateButton } from "./SaveBoxTemplateButton";
import { TemplateLauncher } from "./TemplateLauncher";

export type BoardToolCategory = "create" | "templates" | "text" | "appearance" | "arrange" | "connections" | "board";
export const BoardToolCategoryContext = createContext<BoardToolCategory>("create");
export const BOARD_TOOL_CATEGORIES: { id: BoardToolCategory; label: string }[] = [
  { id: "create", label: "Create" }, { id: "templates", label: "Templates" },
  { id: "text", label: "Text" }, { id: "appearance", label: "Appearance" },
  { id: "arrange", label: "Arrange" }, { id: "connections", label: "Connections" },
  { id: "board", label: "Board" },
];

export const BoardToolbarHost = createContext<HTMLElement | null>(null);

export function DockedSelectionTools({ children }: { children: ReactNode }) {
  const host = useContext(BoardToolbarHost);
  return host ? createPortal(children, host) : null;
}

export function BoardToolMenu({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="flex h-9 shrink-0 items-center gap-1 rounded-md px-2.5 text-xs font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          {label}<ChevronDown className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={8} className="board-tool-menu max-h-[min(65dvh,32rem)] w-80 max-w-[calc(100vw-1rem)] overflow-y-auto p-2">
        <p className="px-2 pb-2 pt-1 text-xs font-semibold text-muted-foreground">{label}</p>
        {children}
      </PopoverContent>
    </Popover>
  );
}


export function BoardToolGroup({ label, children }: { label: string; children: ReactNode }) {
  const category = useContext(BoardToolCategoryContext);
  const categories: Record<string, BoardToolCategory[]> = { Create: ["create"], Format: ["text", "appearance"], Organize: ["create", "arrange", "connections"], Templates: ["templates"], "Edit & share": ["create", "arrange"] };
  if (categories[label] && !categories[label].includes(category)) return null;
  return <div className="board-tool-group flex shrink-0 flex-col border-r px-1.5" role="group" aria-label={label}>
    <span className="px-1 text-[10px] font-semibold text-muted-foreground">{label}</span>
    <div className="board-quick-actions flex items-center gap-1">{children}</div>
  </div>;
}

/** Template creation and filling share one visible home, independent of Properties. */
export function BoardTemplatesButton() {
  const nodes = useCanvasStore(state => state.nodes);
  const selectedIds = useCanvasStore(state => state.selectedNodeIds);
  const selectedNode = selectedIds.length === 1 ? nodes.find(node => node.id === selectedIds[0]) : undefined;
  const card = selectedIds.length === 1 ? nodes.find(node => node.id === selectedIds[0] && node.data.cardTemplateId && !node.data.freeCardLayout) : undefined;
  return <BoardToolGroup label="Templates">
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs font-medium hover:bg-accent" aria-label="New card from template">
          <LayoutTemplate className="h-4 w-4" /><span>New card</span><ChevronDown className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-[65dvh] w-80 max-w-[calc(100vw-1rem)] overflow-y-auto p-0">
        <TemplateLauncher />
      </PopoverContent>
    </Popover>
    {selectedNode && <SaveBoxTemplateButton key={selectedNode.id} node={selectedNode} />}
    {card && <button type="button" className="h-9 shrink-0 rounded-md bg-primary px-2 text-xs font-medium text-primary-foreground disabled:opacity-50" disabled={!!card.data.locked} onClick={() => useUIStore.getState().setFillingCardNodeId(card.id)}>Fill card / sections</button>}
  </BoardToolGroup>;
}
