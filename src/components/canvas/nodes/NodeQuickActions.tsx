"use client";

import { Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/store/canvas-store";

export function NodeQuickActions({
  nodeId,
  color = "#6366f1",
  selected,
  counterRotate = false,
}: {
  nodeId: string;
  color?: string;
  selected?: boolean;
  counterRotate?: boolean;
}) {
  const duplicateNode = useCanvasStore((state) => state.duplicateNode);
  if (!selected) return null;

  return (
    <button
      className={cn(
        "nodrag nopan absolute -right-3.5 -top-3.5 z-30 flex h-7 w-7 items-center justify-center rounded-full border-2 border-background shadow-md transition-transform hover:scale-110",
        counterRotate && "-rotate-45"
      )}
      style={{ backgroundColor: color }}
      title="Duplicate"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        duplicateNode(nodeId);
      }}
    >
      <Copy className="h-3.5 w-3.5 text-white" />
    </button>
  );
}
