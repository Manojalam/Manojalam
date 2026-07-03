"use client";

import { memo } from "react";
import { Handle, Position, NodeResizer, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { GrammarCardNodeData } from "@/lib/types";
import { GRAMMAR_CATEGORY_LABELS } from "@/lib/sanskrit/transliterate";

function GrammarCardNodeComponent({ data, selected }: NodeProps) {
  const d = data as GrammarCardNodeData;

  return (
    <>
      <NodeResizer minWidth={280} minHeight={160} isVisible={selected} />
      <div
        className={cn(
          "w-[300px] rounded-xl border border-indigo-200/60 bg-gradient-to-br from-indigo-50/80 to-slate-50 p-4 shadow-md dark:border-indigo-800/40 dark:from-indigo-950/30 dark:to-slate-900/50",
          selected && "ring-2 ring-primary ring-offset-2"
        )}
      >
        <Handle type="target" position={Position.Left} />
        <Handle type="source" position={Position.Right} />

        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="font-semibold">{d.topic || "Grammar Rule"}</h3>
          <Badge className="bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200 text-[10px]">
            {GRAMMAR_CATEGORY_LABELS[d.category] ?? d.category}
          </Badge>
        </div>

        <div className="rounded-lg border border-indigo-100 bg-white/60 p-2 text-sm dark:border-indigo-900 dark:bg-indigo-950/20">
          {d.rule || "Enter rule..."}
        </div>

        {d.examples && d.examples.length > 0 && (
          <div className="mt-2">
            <p className="text-xs font-medium text-muted-foreground">Examples</p>
            {d.examples.map((ex, i) => (
              <p key={i} className="font-devanagari mt-0.5 text-sm">{ex}</p>
            ))}
          </div>
        )}

        {d.exceptions && (
          <p className="mt-2 text-xs text-muted-foreground">
            <span className="font-medium">Exceptions:</span> {d.exceptions}
          </p>
        )}

        {d.tags && d.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {d.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="text-[10px]">{tag}</Badge>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export const GrammarCardNode = memo(GrammarCardNodeComponent);
