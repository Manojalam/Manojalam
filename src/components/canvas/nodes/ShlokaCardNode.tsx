"use client";

import { memo, useState } from "react";
import { Handle, Position, NodeResizer, type NodeProps } from "@xyflow/react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { ShlokaCardNodeData } from "@/lib/types";
import { NodeQuickActions } from "./NodeQuickActions";

const SECTIONS = [
  { key: "verse", label: "Verse" },
  { key: "padaccheda", label: "Padaccheda", field: "padaccheda" },
  { key: "anvaya", label: "Anvaya", field: "anvaya" },
  { key: "padartha", label: "Padārtha", field: "padartha" },
  { key: "translation", label: "Meaning", field: "translation" },
  { key: "chandas", label: "Chandas", field: "chandas" },
  { key: "notes", label: "Notes", field: "notes" },
] as const;

const STATUS_COLORS = {
  new: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
  learning: "bg-amber-200 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  memorized: "bg-emerald-200 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
};

function ShlokaCardNodeComponent({ id, data, selected }: NodeProps) {
  const d = data as ShlokaCardNodeData;
  const [collapsed, setCollapsed] = useState<Set<string>>(
    new Set(d.collapsedSections ?? [])
  );

  const toggle = (key: string) => {
    const next = new Set(collapsed);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setCollapsed(next);
  };

  return (
    <>
      <NodeResizer minWidth={300} minHeight={200} isVisible={selected} />
      <div
        className={cn(
          "relative w-[360px] rounded-xl border border-amber-300/50 bg-card p-4 shadow-lg dark:border-amber-700/30",
          selected && "ring-2 ring-primary ring-offset-2"
        )}
      >
        <NodeQuickActions nodeId={id} color="#d97706" selected={selected} />
        <Handle type="target" position={Position.Left} />
        <Handle type="source" position={Position.Right} />

        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">{d.title || "Śloka"}</h3>
          <Badge className={cn("text-[10px]", STATUS_COLORS[d.memorizationStatus ?? "new"])}>
            {d.memorizationStatus ?? "new"}
          </Badge>
        </div>

        {d.sourceText && (
          <p className="mb-2 text-xs text-muted-foreground">{d.sourceText}</p>
        )}

        <div className="rounded-lg bg-amber-50/80 p-3 dark:bg-amber-950/30">
          {d.devanagari && (
            <p className="font-devanagari text-xl leading-relaxed">{d.devanagari}</p>
          )}
          {d.iast && <p className="font-iast mt-1 text-sm italic text-muted-foreground">{d.iast}</p>}
        </div>

        {SECTIONS.slice(1).map((section) => {
          const { key, label } = section;
          const field = "field" in section ? section.field : undefined;
          const value = field ? (d as Record<string, unknown>)[field] as string : "";
          if (!value && key !== "verse") return null;
          const isCollapsed = collapsed.has(key);
          return (
            <div key={key} className="mt-2 border-t border-border/50 pt-2">
              <button
                className="flex w-full items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                onClick={() => toggle(key)}
              >
                {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {label}
              </button>
              {!isCollapsed && value && (
                <p className={cn("mt-1 text-sm", key === "padartha" && "font-devanagari")}>{value}</p>
              )}
            </div>
          );
        })}

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

export const ShlokaCardNode = memo(ShlokaCardNodeComponent);
