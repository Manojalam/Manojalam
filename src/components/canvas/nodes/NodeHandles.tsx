"use client";

import { Handle, Position } from "@xyflow/react";
import { useUIStore } from "@/store/ui-store";

/**
 * Renders one loose-mode handle on each side. In React Flow's loose connection
 * mode a source handle can also receive a connection, so overlapping source and
 * target handles only make pointer targeting ambiguous. Layout-aware edges keep
 * referencing these stable side ids.
 */
const SIDES: Array<{ id: "top" | "right" | "bottom" | "left"; pos: Position }> = [
  { id: "top", pos: Position.Top },
  { id: "right", pos: Position.Right },
  { id: "bottom", pos: Position.Bottom },
  { id: "left", pos: Position.Left },
];

export function NodeHandles({ color = "#6366f1" }: { color?: string }) {
  const activeTool = useUIStore((s) => s.activeTool);
  const connectorActive = activeTool === "connector";

  return (
    <>
      {SIDES.map(({ id, pos }) => (
        <Handle
          key={id}
          data-export-ignore
          data-connector-handle={id}
          type="source"
          id={id}
          position={pos}
          isConnectableStart
          isConnectableEnd
          className={connectorActive
            ? "!h-4 !w-4 !border-2 !border-background !opacity-100 !shadow-md"
            : "!h-2.5 !w-2.5 !border !border-background !opacity-0"}
          style={{ background: color, pointerEvents: "all" }}
        />
      ))}
    </>
  );
}
