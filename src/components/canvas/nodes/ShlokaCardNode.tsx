"use client";

import { memo, useState } from "react";
import { Handle, Position, NodeResizer, type NodeProps } from "@xyflow/react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { ShlokaCardNodeData } from "@/lib/types";
import { NodeQuickActions } from "./NodeQuickActions";
import {
  getTextStyle,
  resolveBorderColor,
  resolveBorderStyle,
  resolveBorderWidth,
  resolveFillColor,
  resolveLayoutVisualStyle,
  themeAwareNodeFillColor,
} from "@/lib/style-utils";
import { useNodeManualResize } from "./useNodeManualResize";
import { objectRotationStyle } from "@/lib/canvas/object-rotation";

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
  const matrixCell = d.matrixCell === true;
  const matrixGridVisible = d.matrixGridVisible !== false;
  const matrixRadius = d.matrixCellRole === "header" ? 7 : 4;
  const dd = d as Record<string, unknown>;
  const layoutStyle = resolveLayoutVisualStyle(dd);
  const accentColor = resolveBorderColor(dd) ?? "#d97706";
  const generatedStyle = layoutStyle ? {
    background: themeAwareNodeFillColor(resolveFillColor(dd)),
    borderColor: resolveBorderColor(dd),
    borderStyle: resolveBorderStyle(dd),
    borderWidth: matrixCell && !matrixGridVisible ? 0 : resolveBorderWidth(dd),
    color: getTextStyle(dd).color,
  } : {};
  const [collapsed, setCollapsed] = useState<Set<string>>(
    new Set(d.collapsedSections ?? [])
  );
  const resizeControls = useNodeManualResize(id);

  const toggle = (key: string) => {
    const next = new Set(collapsed);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setCollapsed(next);
  };

  return (
    <>
      <NodeResizer
        minWidth={300}
        minHeight={200}
        isVisible={selected && !matrixCell}
        onResizeStart={resizeControls.onResizeStart}
        onResizeEnd={resizeControls.onResizeEnd}
      />
      <div className="relative h-full w-full">
        <NodeQuickActions nodeId={id} color={accentColor} selected={selected} />
        <Handle type="target" position={Position.Left} />
        <Handle type="source" position={Position.Right} />
        <div
        data-node-content-layer="true"
        className={cn(
          "absolute inset-0 rounded-xl border border-amber-300/50 bg-card p-4 shadow-lg dark:border-amber-700/30",
          matrixCell ? "rounded-md shadow-none" : "",
          "h-full w-full",
          selected && "ring-2 ring-primary ring-offset-2"
        )}
        style={{
          ...generatedStyle,
          ...(matrixCell ? { borderRadius: matrixRadius } : {}),
          ...objectRotationStyle("shloka", dd),
        }}
      >
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
      </div>
    </>
  );
}

export const ShlokaCardNode = memo(ShlokaCardNodeComponent);
