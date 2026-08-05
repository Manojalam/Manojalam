"use client";

import { memo, useState } from "react";
import { Handle, Position, NodeResizer, type NodeProps } from "@xyflow/react";
import { ChevronDown, ChevronRight, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { ShlokaCardNodeData, ShlokaStudySection } from "@/lib/types";
import { NodeQuickActions } from "./NodeQuickActions";
import {
  getAuthoredTextStyle,
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
import { matrixCellBorderRadius } from "@/lib/layout/matrix-presentation";
import { HierarchyNumberBadge } from "./HierarchyNumberBadge";
import { ShlokaCardEditorDialog } from "./ShlokaCardEditorDialog";
import { SHLOKA_STUDY_PALETTES } from "@/lib/canvas/shloka-study-palette";

const SECTIONS = [
  { key: "verse", label: "Verse" },
  { key: "padaccheda", label: "Padaccheda", field: "padaccheda" },
  { key: "anvaya", label: "Anvaya", field: "anvaya" },
  { key: "padartha", label: "Padārtha", field: "padartha" },
  { key: "translation", label: "Meaning", field: "translation" },
  { key: "grammar", label: "Grammar", field: "grammar" },
  { key: "chandas", label: "Chandas", field: "chandas" },
  { key: "notes", label: "Notes", field: "notes" },
  { key: "memorization", label: "Memorization", field: "memorizationNotes" },
] as const;

const STUDY_SECTION_FIELDS: Record<
  Exclude<ShlokaStudySection, "verse">,
  keyof ShlokaCardNodeData
> = {
  padaccheda: "padaccheda",
  anvaya: "anvaya",
  padartha: "padartha",
  translation: "translation",
  grammar: "grammar",
  chandas: "chandas",
  notes: "notes",
  memorization: "memorizationNotes",
};

const STATUS_COLORS = {
  new: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
  learning: "bg-amber-200 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  memorized: "bg-emerald-200 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
};

function ShlokaCardNodeComponent({ id, data, selected }: NodeProps) {
  const d = data as ShlokaCardNodeData;
  const matrixCell = d.matrixCell === true;
  const matrixRadius = matrixCellBorderRadius(d.matrixCellRole);
  const dd = d as Record<string, unknown>;
  const hierarchyNumber = typeof dd.hierarchyNumber === "string" ? dd.hierarchyNumber : undefined;
  const studyPalette = d.studySection ? SHLOKA_STUDY_PALETTES[d.studySection] : undefined;
  const layoutStyle = resolveLayoutVisualStyle(dd);
  const accentColor = resolveBorderColor(dd) ?? studyPalette?.accent ?? "#d97706";
  const generatedStyle = layoutStyle ? {
    background: themeAwareNodeFillColor(resolveFillColor(dd)),
    borderColor: resolveBorderColor(dd),
    borderStyle: resolveBorderStyle(dd),
    borderWidth: resolveBorderWidth(dd),
    color: getTextStyle(dd).color,
  } : {};
  const authoredTextStyle = getAuthoredTextStyle(dd);
  const compactStudySection = d.studySection && d.studySection !== "verse"
    ? d.studySection
    : undefined;
  const compactStudyValue = compactStudySection
    ? String(d[STUDY_SECTION_FIELDS[compactStudySection]] ?? "")
    : "";
  const [collapsed, setCollapsed] = useState<Set<string>>(
    new Set(d.collapsedSections ?? [])
  );
  const [editorOpen, setEditorOpen] = useState(false);
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
        minWidth={compactStudySection ? 240 : 300}
        minHeight={compactStudySection ? 140 : 200}
        isVisible={selected && !matrixCell}
        onResizeStart={resizeControls.onResizeStart}
        onResizeEnd={resizeControls.onResizeEnd}
      />
      <div className="group relative h-full w-full">
        <NodeQuickActions nodeId={id} color={accentColor} selected={selected} />
        <button
          type="button"
          data-export-ignore
          className={cn(
            "nodrag nopan absolute -right-3.5 top-6 z-30 flex h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-background text-foreground shadow-md transition-all hover:scale-110 hover:bg-accent focus:opacity-100",
            selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          )}
          title="Edit Śloka card"
          aria-label="Edit Śloka card"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            setEditorOpen(true);
          }}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <Handle
          type="target"
          position={Position.Left}
          style={studyPalette ? { backgroundColor: studyPalette.accent, borderColor: "white" } : undefined}
        />
        <Handle
          type="source"
          position={Position.Right}
          style={studyPalette ? { backgroundColor: studyPalette.accent, borderColor: "white" } : undefined}
        />
        <div
          className="pointer-events-none absolute inset-0 z-20"
          style={objectRotationStyle("shloka", dd)}
        >
          <HierarchyNumberBadge number={hierarchyNumber} />
        </div>
        <div
        data-node-content-layer="true"
        className={cn(
          "absolute inset-0 h-full w-full overflow-hidden rounded-2xl border-2 border-amber-300/60 bg-card p-4 shadow-lg transition-shadow dark:border-amber-700/40",
          studyPalette?.card,
          matrixCell ? "overflow-hidden rounded-md shadow-none" : "",
          selected && "ring-2 ring-primary ring-offset-2"
        )}
        style={{
          ...generatedStyle,
          ...(matrixCell ? { borderRadius: matrixRadius } : {}),
          ...objectRotationStyle("shloka", dd),
        }}
        onDoubleClick={(event) => {
          event.stopPropagation();
          setEditorOpen(true);
        }}
      >
        {studyPalette && (
          <div
            aria-hidden="true"
            className="absolute inset-y-0 left-0 w-1.5"
            style={{ backgroundColor: studyPalette.accent }}
          />
        )}
        <div className={cn("relative mb-3 flex items-center justify-between", studyPalette && "pl-1")}>
          <div className="flex min-w-0 items-center gap-2.5">
            {studyPalette && (
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 shrink-0 rounded-full shadow-sm"
                style={{ backgroundColor: studyPalette.accent }}
              />
            )}
            <h3
              className={cn(
                "truncate font-semibold",
                studyPalette && "text-lg font-bold tracking-tight",
                studyPalette?.title
              )}
              style={authoredTextStyle}
            >
              {d.title || "Śloka"}
            </h3>
          </div>
          {(!d.studySection || d.studySection === "memorization") && (
            <Badge
              className={cn("text-[10px]", STATUS_COLORS[d.memorizationStatus ?? "new"])}
              style={authoredTextStyle}
            >
              {d.memorizationStatus ?? "new"}
            </Badge>
          )}
        </div>

        {compactStudySection ? (
          <div className={cn(
            "overflow-hidden rounded-xl border p-4 shadow-sm",
            studyPalette?.content ?? "border-amber-200/70 bg-amber-50/80 dark:border-amber-800/60 dark:bg-amber-950/30"
          )}>
            <p
              className={cn(
                "whitespace-pre-wrap text-[15px] font-medium leading-6 text-slate-900 dark:text-slate-50",
                ["padaccheda", "anvaya"].includes(compactStudySection) && "font-devanagari text-base leading-7"
              )}
              style={authoredTextStyle}
            >
              {compactStudyValue || "Double-click to add content"}
            </p>
          </div>
        ) : (
          <>
            {d.sourceText && (
              <p
                className={cn(
                  "mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground",
                  studyPalette?.meta
                )}
                style={authoredTextStyle}
              >
                {d.sourceText}
              </p>
            )}

            <div className={cn(
              "rounded-xl border p-4 shadow-sm",
              studyPalette?.content ?? "border-amber-200/70 bg-amber-50/80 dark:border-amber-800/60 dark:bg-amber-950/30"
            )}>
              {d.devanagari && (
                <p className="whitespace-pre-wrap font-devanagari text-2xl font-medium leading-10 text-slate-950 dark:text-white" style={authoredTextStyle}>{d.devanagari}</p>
              )}
              {d.iast && (
                <p
                  className={cn("mt-2 whitespace-pre-wrap font-iast text-base italic leading-7 text-muted-foreground", studyPalette?.meta)}
                  style={authoredTextStyle}
                >
                  {d.iast}
                </p>
              )}
            </div>
          </>
        )}

        {!d.studySection && SECTIONS.slice(1).map((section) => {
          const { key, label } = section;
          const field = "field" in section ? section.field : undefined;
          const value = field ? (d as Record<string, unknown>)[field] as string : "";
          if (!value && key !== "verse") return null;
          const isCollapsed = collapsed.has(key);
          return (
            <div key={key} className="mt-2 border-t border-border/50 pt-2">
              <button
                type="button"
                className="flex w-full items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                style={authoredTextStyle}
                onClick={() => toggle(key)}
              >
                {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {label}
              </button>
              {!isCollapsed && value && (
                <p
                  className={cn("mt-1 text-sm", key === "padartha" && "font-devanagari")}
                  style={authoredTextStyle}
                >
                  {value}
                </p>
              )}
            </div>
          );
        })}

        {d.tags && d.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {d.tags.map((tag) => (
              <Badge
                key={tag}
                variant="outline"
                className={cn("text-[10px]", studyPalette?.tag)}
                style={authoredTextStyle}
              >
                {tag}
              </Badge>
            ))}
          </div>
        )}
        </div>
        {editorOpen && (
          <ShlokaCardEditorDialog
            nodeId={id}
            data={d}
            open
            onOpenChange={setEditorOpen}
          />
        )}
      </div>
    </>
  );
}

export const ShlokaCardNode = memo(ShlokaCardNodeComponent);
