"use client";

import { memo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  useNodesData,
  type EdgeProps,
} from "@xyflow/react";
import { Trash2 } from "lucide-react";
import type { VidyaEdgeData } from "@/lib/types";
import { useCanvasStore } from "@/store/canvas-store";
import { SmartBranchEdge } from "./SmartBranchEdge";

function VidyaEdgeComponent({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
  markerEnd,
}: EdgeProps) {
  const d = (data ?? {}) as VidyaEdgeData;
  const edgeColor = d.color ?? d.layoutColor;
  const deleteEdges = useCanvasStore((s) => s.deleteEdges);
  const endpointData = useNodesData([source, target]);
  const curveStyle = d.curveStyle ?? "smooth";
  const sourceData = (endpointData.find((node) => node.id === source)?.data ?? {}) as Record<string, unknown>;
  const targetData = (endpointData.find((node) => node.id === target)?.data ?? {}) as Record<string, unknown>;
  if (
    d.layoutMode === "list" &&
    targetData.parentId === source &&
    sourceData.listManualOverride !== true &&
    targetData.listManualOverride !== true
  ) return null;
  if (
    (d.layoutMode === "horizontal" || d.layoutMode === "vertical" || d.layoutMode === "topDown") &&
    targetData.parentId === source &&
    sourceData.treeManualOverride !== true &&
    targetData.treeManualOverride !== true
  ) return null;

  let path: string;
  let labelX: number;
  let labelY: number;

  if (curveStyle === "straight") {
    [path, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  } else if (curveStyle === "step") {
    [path, labelX, labelY] = getSmoothStepPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
    });
  } else {
    [path, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
    });
  }

  return (
    <>
      <BaseEdge
        data-export-normal-stroke={edgeColor ?? "#94a3b8"}
        id={id}
        path={path}
        markerEnd={markerEnd}
        interactionWidth={28}
        style={{
          stroke: selected ? "#6366f1" : edgeColor ?? "#94a3b8",
          strokeWidth: d.width ?? 2,
          strokeDasharray: d.dashed ? "6 4" : undefined,
        }}
      />
      {selected && (
        <EdgeLabelRenderer>
          <button
            data-export-ignore
            type="button"
            title="Delete connection"
            aria-label="Delete connection"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              deleteEdges([id]);
            }}
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY - (d.label ? 24 : 0)}px)`,
              pointerEvents: "all",
            }}
            className="flex h-7 w-7 items-center justify-center rounded-full border bg-background text-destructive shadow-md"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </EdgeLabelRenderer>
      )}
      {d.label && (
        <EdgeLabelRenderer>
          <div
            data-export-edge-id={id}
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "all",
            }}
            className="rounded-md border bg-background px-1.5 py-0.5 text-[10px] font-medium shadow-sm"
          >
            {d.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const VidyaEdge = memo(VidyaEdgeComponent);

export const BranchEdge = SmartBranchEdge;
export const LabeledEdge = memo(VidyaEdgeComponent);
export const SanskritEdge = memo(VidyaEdgeComponent);

export const edgeTypes = {
  default: VidyaEdge,
  branch: BranchEdge,
  labeled: LabeledEdge,
  sanskrit: SanskritEdge,
};
