"use client";

import { memo } from "react";
import { NodeResizer, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import type { FrameNodeData } from "@/lib/types";
import { NodeQuickActions } from "./NodeQuickActions";
import { useNodeManualResize } from "./useNodeManualResize";
import { objectRotationStyle } from "@/lib/canvas/object-rotation";
import { MATRIX_FRAME_RADIUS } from "@/lib/layout/matrix-presentation";

function FrameNodeComponent({ id, data, selected }: NodeProps) {
  const d = data as FrameNodeData;
  const isMatrixFrame = typeof d.matrixFrameFor === "string";
  const resizeControls = useNodeManualResize(id);

  return (
    <>
      <NodeResizer
        minWidth={200}
        minHeight={150}
        isVisible={selected}
        onResizeStart={resizeControls.onResizeStart}
        onResizeEnd={resizeControls.onResizeEnd}
      />
      <div className="relative h-full w-full">
        {!d.locked && <NodeQuickActions nodeId={id} color={d.color ?? "#6366f1"} selected={selected} />}
        <div
        className={cn(
          "absolute inset-0",
          isMatrixFrame ? "border" : "rounded-xl border-2",
          selected && "ring-2 ring-primary ring-offset-1",
          d.locked && "pointer-events-none"
        )}
        style={{
          ...(isMatrixFrame ? { borderRadius: MATRIX_FRAME_RADIUS } : {}),
          borderColor: d.color ?? "#6366f1",
          borderStyle: d.borderStyle ?? "dashed",
          backgroundColor: d.background ?? `${d.color ?? "#6366f1"}08`,
          ...objectRotationStyle("frame", d as Record<string, unknown>),
        }}
      >
        {d.title !== "" && (
          <div
            data-canvas-label-box="true"
            className="absolute -top-3 left-3 rounded-md px-2 py-0.5 text-xs font-medium shadow-sm"
            style={{
              backgroundColor: d.color ?? "#6366f1",
              color: "white",
            }}
          >
            {d.title || "Frame"}
          </div>
        )}
        </div>
      </div>
    </>
  );
}

export const FrameNode = memo(FrameNodeComponent);
