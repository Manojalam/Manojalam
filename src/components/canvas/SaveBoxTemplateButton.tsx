"use client";

import { LayoutTemplate } from "lucide-react";
import type { Node } from "@xyflow/react";
import { toast } from "sonner";
import { supportsStyleTemplate } from "@/lib/canvas/board-style-templates";
import { useCanvasStore } from "@/store/canvas-store";

export function SaveBoxTemplateButton({ node }: { node: Node }) {
  const viewer = useCanvasStore(state => state.board?.accessRole === "viewer");
  if (viewer || node.data.locked || !supportsStyleTemplate(node)) return null;
  return <button type="button" title="Use as template" aria-label="Use as template" className="flex h-9 items-center gap-1.5 rounded-md px-2 text-xs hover:bg-accent" onPointerDown={event => event.stopPropagation()} onClick={event => {
    event.stopPropagation();
    const state = useCanvasStore.getState();
    const text = String(node.data.text ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
    const name = text || `Template ${(state.settings.sampleTemplates?.length ?? 0) + 1}`;
    const id = state.createSampleTemplate(node.id, name);
    if (id) toast.success("Template saved", { description: "Reuse it from the Templates panel." });
    else toast.error("This box can no longer be used as a template.");
  }}><LayoutTemplate className="h-4 w-4" />Use as template</button>;
}
