"use client";

import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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
