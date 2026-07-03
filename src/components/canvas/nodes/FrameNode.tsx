"use client";

import { memo } from "react";
import { NodeResizer, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import type { FrameNodeData } from "@/lib/types";

function FrameNodeComponent({ data, selected }: NodeProps) {
  const d = data as FrameNodeData;

  return (
    <>
      <NodeResizer minWidth={200} minHeight={150} isVisible={selected} />
      <div
        className={cn(
          "h-full w-full rounded-xl border-2 border-dashed",
          selected && "ring-2 ring-primary ring-offset-1",
          d.locked && "pointer-events-none"
        )}
        style={{
          borderColor: d.color ?? "#6366f1",
          backgroundColor: d.background ?? `${d.color ?? "#6366f1"}08`,
        }}
      >
        <div
          className="absolute -top-3 left-3 rounded-md px-2 py-0.5 text-xs font-medium shadow-sm"
          style={{
            backgroundColor: d.color ?? "#6366f1",
            color: "white",
          }}
        >
          {d.title || "Frame"}
        </div>
      </div>
    </>
  );
}

export const FrameNode = memo(FrameNodeComponent);
