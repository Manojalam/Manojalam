"use client";

import { memo } from "react";
import { NodeResizer, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import type { FrameNodeData } from "@/lib/types";
import { NodeQuickActions } from "./NodeQuickActions";

function FrameNodeComponent({ id, data, selected }: NodeProps) {
  const d = data as FrameNodeData;

  return (
    <>
      <NodeResizer minWidth={200} minHeight={150} isVisible={selected} />
      <div
        className={cn(
          "relative h-full w-full rounded-xl border-2",
          selected && "ring-2 ring-primary ring-offset-1",
          d.locked && "pointer-events-none"
        )}
        style={{
          borderColor: d.color ?? "#6366f1",
          borderStyle: d.borderStyle ?? "dashed",
          backgroundColor: d.background ?? `${d.color ?? "#6366f1"}08`,
        }}
      >
        {!d.locked && <NodeQuickActions nodeId={id} color={d.color ?? "#6366f1"} selected={selected} />}
        {d.title !== "" && (
          <div
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
    </>
  );
}

export const FrameNode = memo(FrameNodeComponent);
