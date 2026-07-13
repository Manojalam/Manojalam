"use client";

import { useCallback, useEffect } from "react";
import { Panel } from "@xyflow/react";
import { Check, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { buildHierarchy } from "@/lib/layout/hierarchy";
import { nodeDisplayLabel, resolveRelationshipPolicy } from "@/lib/relationships";
import { useCanvasStore } from "@/store/canvas-store";
import { useUIStore } from "@/store/ui-store";

export function commitRelationshipSelection(): boolean {
  const ui = useUIStore.getState();
  const session = ui.relationshipSelection;
  if (!session) return false;

  const canvas = useCanvasStore.getState();
  const chartNodes = canvas.nodes.filter((node) => node.type !== "sunburst" && node.type !== "frame");
  const hierarchy = buildHierarchy(chartNodes, canvas.edges);
  const policy = resolveRelationshipPolicy({
    relationType: session.relationType,
    sourceNodeId: session.sourceNodeId,
    chartRootId: session.chartRootNodeId,
    targetBranchNodeId: session.targetBranchNodeId,
    nodes: chartNodes,
    hierarchy,
  });

  if (!policy.ok || !policy.targetBranchNodeId) {
    toast.error("The target branch is no longer available. No relationships were changed.");
    return false;
  }

  const draft = new Set(session.draftTargetIds);
  const orderedTargetIds = policy.validTargetIds.filter((nodeId) => draft.has(nodeId));
  canvas.replaceRelationships(
    session.sourceNodeId,
    session.relationType,
    orderedTargetIds,
    policy.targetBranchNodeId
  );
  ui.cancelRelationshipSelection();
  toast.success(
    orderedTargetIds.length
      ? `${orderedTargetIds.length} relationship${orderedTargetIds.length === 1 ? "" : "s"} saved.`
      : "Relationships cleared."
  );
  return true;
}

export function RelationshipSelectionToolbar() {
  const session = useUIStore((state) => state.relationshipSelection);
  const clearTargets = useUIStore((state) => state.clearRelationshipTargets);
  const cancel = useUIStore((state) => state.cancelRelationshipSelection);
  const nodes = useCanvasStore((state) => state.nodes);

  const commit = useCallback(() => {
    commitRelationshipSelection();
  }, []);

  useEffect(() => {
    const handler = () => commit();
    window.addEventListener("vidya:commit-relationships", handler);
    return () => window.removeEventListener("vidya:commit-relationships", handler);
  }, [commit]);

  if (!session) return null;

  const source = nodes.find((node) => node.id === session.sourceNodeId);
  const sourceLabel = nodeDisplayLabel(source) || "Selected node";
  const count = session.draftTargetIds.length;

  return (
    <Panel
      position="top-center"
      className="nodrag nopan z-[100] m-3"
      data-export-ignore
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="flex max-w-[min(92vw,760px)] flex-wrap items-center justify-center gap-2 rounded-xl border border-primary/25 bg-background/95 px-3 py-2 shadow-2xl backdrop-blur">
        <div className="min-w-0 pr-1 text-sm">
          <span className="text-muted-foreground">Creating relationships for: </span>
          <span className="font-semibold text-foreground" title={sourceLabel}>{sourceLabel}</span>
        </div>
        <div
          className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold tabular-nums text-primary"
          aria-live="polite"
        >
          {count} selected
        </div>
        <Button type="button" size="sm" variant="ghost" disabled={!count} onClick={clearTargets}>
          <RotateCcw className="h-3.5 w-3.5" />
          Clear
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={cancel}>
          <X className="h-3.5 w-3.5" />
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={commit}>
          <Check className="h-3.5 w-3.5" />
          Done
        </Button>
      </div>
    </Panel>
  );
}
