"use client";

import { useUIStore, TOOL_LABELS } from "@/store/ui-store";
import { useCanvasStore } from "@/store/canvas-store";

export function CanvasStatusBar() {
  const activeTool = useUIStore((s) => s.activeTool);
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);

  return (
    <div className="vidya-float-panel flex items-center gap-3 px-3.5 py-1.5 text-[11px] text-muted-foreground">
      <span className="font-semibold text-foreground">{TOOL_LABELS[activeTool]}</span>
      <span className="h-3 w-px bg-border" />
      <span>{nodes.length} nodes · {edges.length} edges</span>
      <span className="h-3 w-px bg-border" />
      <span className="hidden sm:inline text-muted-foreground/75">Tab = child · Enter = sibling · ⌘K = commands</span>
    </div>
  );
}
