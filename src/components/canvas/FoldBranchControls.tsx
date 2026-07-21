"use client";

import type { Node } from "@xyflow/react";
import {
  defaultFoldBreakAfter,
  resolvedFoldSectionCount,
  resolvedManualFoldBreakAfter,
} from "@/lib/layout/child-group-wrap";
import { useCanvasStore } from "@/store/canvas-store";
import { cn } from "@/lib/utils";

interface FoldBranchControlsProps {
  parentId: string;
  parentData: Record<string, unknown>;
  childIds: string[];
  nodes: Node[];
  compact?: boolean;
  className?: string;
}

function readableNodeLabel(node: Node | undefined, index: number): string {
  if (!node) return `Item ${index + 1}`;
  const data = (node.data ?? {}) as Record<string, unknown>;
  const value = ["text", "title", "topic", "label", "devanagari", "iast", "translation", "rule", "richText"]
    .map((field) => data[field])
    .find((candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0);
  const plainText = value
    ?.replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
  return plainText?.slice(0, 52) || `Item ${index + 1}`;
}

export function FoldBranchControls({
  parentId,
  parentData,
  childIds,
  nodes,
  compact = false,
  className,
}: FoldBranchControlsProps) {
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const sectionCount = resolvedFoldSectionCount(parentData, childIds.length);
  const manualBreakAfter = resolvedManualFoldBreakAfter(parentData, childIds, sectionCount);
  const nodesById = new Map(nodes.map((node) => [node.id, node]));

  const commit = (patch: Record<string, unknown>) => {
    useCanvasStore.getState().pushHistory();
    updateNodeData(parentId, patch);
  };

  const updateManualBreak = (breakIndex: number, childId: string) => {
    if (!manualBreakAfter) return;
    const indexes = manualBreakAfter.map((breakChildId) => childIds.indexOf(breakChildId));
    indexes[breakIndex] = childIds.indexOf(childId);
    for (let index = breakIndex + 1; index < indexes.length; index += 1) {
      indexes[index] = Math.max(indexes[index], indexes[index - 1] + 1);
    }
    commit({ layoutFoldBreakAfter: indexes.map((index) => childIds[index]) });
  };

  return (
    <div className={cn("rounded-lg border border-border bg-muted/35 p-2", className)}>
      <div className={cn("font-medium text-foreground", compact ? "text-[10px]" : "text-xs")}>
        Fold into sections
      </div>
      <p className="mt-0.5 text-[9px] leading-snug text-muted-foreground">
        Automatic balances rendered height—or width when sections stack vertically. Custom lets you place every break.
      </p>

      <label className="mt-2 block text-[9px] font-medium text-muted-foreground">
        Number of sections
      </label>
      <select
        value={sectionCount}
        aria-label="Number of folded sections"
        onChange={(event) => {
          const nextCount = Math.max(1, Math.min(childIds.length, Number(event.target.value)));
          commit({
            layoutFoldCount: nextCount > 1 ? nextCount : undefined,
            layoutWrapAfter: undefined,
            layoutFoldBreakAfter: undefined,
          });
        }}
        className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
      >
        {Array.from({ length: childIds.length }, (_, index) => index + 1).map((count) => (
          <option key={count} value={count}>
            {count === 1 ? "No fold · 1 section" : `${count} sections`}
          </option>
        ))}
      </select>

      {sectionCount > 1 && (
        <>
          <label className="mt-2 block text-[9px] font-medium text-muted-foreground">
            Break placement
          </label>
          <select
            value={manualBreakAfter ? "custom" : "automatic"}
            aria-label="Fold break placement"
            onChange={(event) => {
              commit({
                layoutFoldBreakAfter: event.target.value === "custom"
                  ? defaultFoldBreakAfter(childIds, sectionCount)
                  : undefined,
              });
            }}
            className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
          >
            <option value="automatic">Automatic · balance visual size</option>
            <option value="custom">Custom · choose each break</option>
          </select>

          {manualBreakAfter && (
            <div className="mt-2 space-y-2 rounded-md border border-border/70 bg-background/70 p-2">
              {manualBreakAfter.map((breakChildId, breakIndex) => {
                const previousIndex = breakIndex > 0
                  ? childIds.indexOf(manualBreakAfter[breakIndex - 1])
                  : -1;
                const minimumIndex = previousIndex + 1;
                const maximumIndex = childIds.length - sectionCount + breakIndex;
                return (
                  <label key={`${breakIndex}-${breakChildId}`} className="block">
                    <span className="block text-[9px] font-medium text-muted-foreground">
                      Section {breakIndex + 1} ends after
                    </span>
                    <select
                      value={breakChildId}
                      aria-label={`Section ${breakIndex + 1} ends after`}
                      onChange={(event) => updateManualBreak(breakIndex, event.target.value)}
                      className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
                    >
                      {childIds.map((childId, childIndex) => (
                        childIndex >= minimumIndex && childIndex <= maximumIndex ? (
                          <option key={childId} value={childId}>
                            {childIndex + 1}. {readableNodeLabel(nodesById.get(childId), childIndex)}
                          </option>
                        ) : null
                      ))}
                    </select>
                  </label>
                );
              })}
              <button
                type="button"
                onClick={() => commit({ layoutFoldBreakAfter: undefined })}
                className="text-[10px] font-medium text-primary hover:underline"
              >
                Rebalance automatically
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
