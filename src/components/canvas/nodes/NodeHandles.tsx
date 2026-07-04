"use client";

import { Fragment } from "react";
import { Handle, Position } from "@xyflow/react";

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
  return (
    <>
      {SIDES.map(({ id, pos }) => (
        <Fragment key={id}>
          <Handle
            type="target"
            id={id}
            position={pos}
            className="!h-2 !w-2 !border !border-background !opacity-0 group-hover:!opacity-100 transition-opacity"
            style={{ background: color }}
          />
          <Handle
            type="source"
            id={id}
            position={pos}
            className="!h-2 !w-2 !border !border-background !opacity-0 group-hover:!opacity-100 transition-opacity"
            style={{ background: color }}
          />
        </Fragment>
      ))}
    </>
  );
}
