"use client";

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { NodeHandles } from "./NodeHandles";

function ConnectorJunctionNodeComponent({ data, selected }: NodeProps) {
  const color = typeof data.color === "string" ? data.color : "#6366f1";
  return (
    <div
      aria-label="Connector junction"
      title="Connector junction — drag to reroute or connect another line"
      className={cn(
        "group relative h-full w-full rounded-full border-[3px] border-background shadow-sm",
        selected && "ring-2 ring-primary ring-offset-2 ring-offset-background"
      )}
      style={{ backgroundColor: color }}
    >
      <NodeHandles color={color} selected={selected} />
    </div>
  );
}

export const ConnectorJunctionNode = memo(ConnectorJunctionNodeComponent);
