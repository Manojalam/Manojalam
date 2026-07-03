"use client";

import { useUIStore, TOOL_LABELS } from "@/store/ui-store";
import { useCanvasStore } from "@/store/canvas-store";

export function CanvasStatusBar() {
  const activeTool = useUIStore((s) => s.activeTool);
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);

  return (
    <div className="vidya-float-panel flex items-center gap-3 px-3.5 py-1.5 text-[11px] text-gray-500">
      <span className="font-semibold text-gray-700">{TOOL_LABELS[activeTool]}</span>
      <span className="h-3 w-px bg-gray-200" />
      <span>{nodes.length} nodes · {edges.length} edges</span>
      <span className="h-3 w-px bg-gray-200" />
      <span className="hidden sm:inline text-gray-400">Tab = child · Enter = sibling · ⌘K = commands</span>
    </div>
  );
}
