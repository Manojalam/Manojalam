"use client";

import { memo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  type EdgeProps,
} from "@xyflow/react";
import type { VidyaEdgeData } from "@/lib/types";

function VidyaEdgeComponent({
  id,
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
  const curveStyle = d.curveStyle ?? "smooth";

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
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{
          stroke: d.color ?? (selected ? "#6366f1" : "#94a3b8"),
          strokeWidth: d.width ?? 2,
          strokeDasharray: d.dashed ? "6 4" : undefined,
        }}
      />
      {d.label && (
        <EdgeLabelRenderer>
          <div
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

export const BranchEdge = memo(VidyaEdgeComponent);
export const LabeledEdge = memo(VidyaEdgeComponent);
export const SanskritEdge = memo(VidyaEdgeComponent);

export const edgeTypes = {
  default: VidyaEdge,
  branch: BranchEdge,
  labeled: LabeledEdge,
  sanskrit: SanskritEdge,
};
