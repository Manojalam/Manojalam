"use client";

import { memo } from "react";
import {
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  useNodesData,
  type EdgeProps,
} from "@xyflow/react";
import type { VidyaEdgeData } from "@/lib/types";
import { ConnectionLabelEditor } from "./ConnectionLabelEditor";
import { ConnectorPath } from "./ConnectorPath";
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
  markerStart,
  markerEnd,
}: EdgeProps) {
  const d = (data ?? {}) as VidyaEdgeData;
  const edgeColor = d.color ?? d.layoutColor;
  const endpointData = useNodesData([source, target]);
  const curveStyle = d.curveStyle ?? "smooth";
  const targetData = (endpointData.find((node) => node.id === target)?.data ?? {}) as Record<string, unknown>;
  if (
    d.layoutMode === "list" &&
    targetData.parentId === source
  ) return null;
  if (
    (d.layoutMode === "horizontal" || d.layoutMode === "vertical" || d.layoutMode === "topDown") &&
    targetData.parentId === source
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
      <ConnectorPath
        id={id}
        path={path}
        edgeData={d}
        color={selected ? "#6366f1" : edgeColor ?? "#94a3b8"}
        normalColor={edgeColor ?? "#94a3b8"}
        width={d.width ?? 2}
        markerStart={markerStart}
        markerEnd={markerEnd}
        interactionWidth={28}
      />
      {(selected || d.label) && (
        <EdgeLabelRenderer>
          <ConnectionLabelEditor
            edgeId={id}
            x={labelX}
            y={labelY}
            path={path}
            label={d.label}
            selected={selected}
          />
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
