"use client";

import { Fragment } from "react";
import { Handle, Position } from "@xyflow/react";
import { useUIStore } from "@/store/ui-store";

/**
 * Renders a source AND a target handle on each of the four sides, with ids
 * "top" | "right" | "bottom" | "left". Layout-aware edges reference these ids
 * (e.g. sourceHandle="right", targetHandle="left") so arrows exit/enter from
 * the correct side. Handles are invisible until the node is hovered.
 */
const SIDES: Array<{ id: "top" | "right" | "bottom" | "left"; pos: Position }> = [
  { id: "top", pos: Position.Top },
  { id: "right", pos: Position.Right },
  { id: "bottom", pos: Position.Bottom },
  { id: "left", pos: Position.Left },
];

export function NodeHandles({ color = "#6366f1" }: { color?: string }) {
  const activeTool = useUIStore((s) => s.activeTool);
  const fullSurfaceActive = activeTool === "connector";

  return (
    <>
      {SIDES.map(({ id, pos }) => (
        <Fragment key={id}>
          <Handle
            type="target"
            id={id}
            position={pos}
            className="!border !border-background !opacity-0"
            style={{
              background: color,
              pointerEvents: fullSurfaceActive ? "all" : undefined,
              ...(fullSurfaceActive && (id === "top" || id === "bottom")
                ? { width: "calc(100% - 18px)", height: 18, borderRadius: 9 }
                : fullSurfaceActive
                  ? { width: 18, height: "calc(100% - 18px)", borderRadius: 9 }
                  : { width: 10, height: 10 }),
            }}
          />
          <Handle
            type="source"
            id={id}
            position={pos}
            className="!border !border-background !opacity-0"
            style={{
              background: color,
              pointerEvents: fullSurfaceActive ? "all" : undefined,
              ...(fullSurfaceActive && (id === "top" || id === "bottom")
                ? { width: "calc(100% - 18px)", height: 18, borderRadius: 9 }
                : fullSurfaceActive
                  ? { width: 18, height: "calc(100% - 18px)", borderRadius: 9 }
                  : { width: 10, height: 10 }),
            }}
          />
        </Fragment>
      ))}
    </>
  );
}
