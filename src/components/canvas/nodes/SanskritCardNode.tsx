"use client";

import { memo } from "react";
import { Handle, Position, NodeResizer, type NodeProps } from "@xyflow/react";
import { Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SanskritCardNodeData } from "@/lib/types";
import { useCanvasStore } from "@/store/canvas-store";
import { toast } from "sonner";
import { NodeQuickActions } from "./NodeQuickActions";

function SanskritCardNodeComponent({ id, data, selected }: NodeProps) {
  const d = data as SanskritCardNodeData;
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const mode = d.displayMode ?? "both-stacked";

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const cycleMode = () => {
    const modes = ["devanagari", "iast", "both-stacked", "both-side"] as const;
    const idx = modes.indexOf(mode as typeof modes[number]);
    updateNodeData(id, { displayMode: modes[(idx + 1) % modes.length] });
  };

  return (
    <>
      <NodeResizer minWidth={280} minHeight={180} isVisible={selected} />
      <div
        className={cn(
          "relative w-[320px] rounded-xl border border-amber-200/60 bg-gradient-to-br from-amber-50 to-orange-50 p-4 shadow-md dark:border-amber-800/40 dark:from-amber-950/40 dark:to-orange-950/30",
          selected && "ring-2 ring-primary ring-offset-2"
        )}
      >
        <NodeQuickActions nodeId={id} color="#d97706" selected={selected} />
        <Handle type="target" position={Position.Left} />
        <Handle type="source" position={Position.Right} />

        <div className="mb-2 flex items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold text-foreground">{d.title || "Sanskrit Card"}</h3>
            {d.source && <p className="text-xs text-muted-foreground">{d.source}</p>}
          </div>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={cycleMode}>
            {mode.replace("-", " ")}
          </Button>
        </div>

        {(mode === "devanagari" || mode === "both-stacked" || mode === "both-side") && d.devanagari && (
          <div className={cn(mode === "both-side" && "inline-block w-1/2 align-top")}>
            <p className="font-devanagari text-lg leading-relaxed text-foreground">{d.devanagari}</p>
          </div>
        )}

        {(mode === "iast" || mode === "both-stacked" || mode === "both-side") && d.iast && (
          <div className={cn("font-iast text-sm italic text-muted-foreground", mode === "both-stacked" && "mt-1")}>
            {d.iast}
          </div>
        )}

        {d.translation && (
          <p className="mt-2 border-t border-amber-200/50 pt-2 text-sm dark:border-amber-800/30">
            {d.translation}
          </p>
        )}

        {d.grammarNotes && (
          <p className="mt-1 text-xs text-muted-foreground">{d.grammarNotes}</p>
        )}

        <div className="mt-2 flex flex-wrap gap-1">
          {d.tags?.map((tag) => (
            <Badge key={tag} variant="outline" className="text-[10px] bg-amber-100/50 dark:bg-amber-900/20">
              {tag}
            </Badge>
          ))}
        </div>

        <div className="mt-2 flex gap-1">
          {d.devanagari && (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyText(d.devanagari)}>
              <Copy className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
    </>
  );
}

export const SanskritCardNode = memo(SanskritCardNodeComponent);
