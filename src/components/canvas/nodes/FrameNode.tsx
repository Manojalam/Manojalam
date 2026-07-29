"use client";

import { memo } from "react";
import { NodeResizer, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import type { FrameNodeData } from "@/lib/types";
import { NodeQuickActions } from "./NodeQuickActions";
import { useNodeManualResize } from "./useNodeManualResize";
import { objectRotationStyle } from "@/lib/canvas/object-rotation";
import { MATRIX_GRID_RADIUS } from "@/lib/layout/matrix-presentation";
import { getAuthoredTextStyle } from "@/lib/style-utils";

function FrameNodeComponent({ id, data, selected, width, height }: NodeProps) {
  const d = data as FrameNodeData;
  const isMatrixFrame = typeof d.matrixFrameFor === "string";
  const matrixGridLines = Array.isArray(d.matrixGridLines) ? d.matrixGridLines : null;
  const isMatrixGrid = isMatrixFrame && matrixGridLines !== null;
  const matrixOuterBorderVisible = d.matrixOuterBorderVisible !== false;
  const frameWidth = typeof width === "number" && width > 0 ? width : 1;
  const frameHeight = typeof height === "number" && height > 0 ? height : 1;
  const gridStrokeWidth = typeof d.borderWidth === "number" ? d.borderWidth : 1;
  const resizeControls = useNodeManualResize(id);
  const authoredTextStyle = getAuthoredTextStyle(d as Record<string, unknown>);

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
        data-export-board-dependent-background={isMatrixFrame ? "true" : undefined}
        className={cn(
          "absolute inset-0",
          isMatrixGrid ? "" : isMatrixFrame ? "border" : "rounded-xl border-2",
          selected && "ring-2 ring-primary ring-offset-1",
          d.locked && "pointer-events-none"
        )}
        style={{
          ...(isMatrixFrame && !isMatrixGrid ? { borderWidth: d.borderWidth } : {}),
          borderColor: d.color ?? "#6366f1",
          borderStyle: d.borderStyle ?? "dashed",
          backgroundColor: d.background ?? `${d.color ?? "#6366f1"}08`,
          ...objectRotationStyle("frame", d as Record<string, unknown>),
        }}
      >
        {isMatrixGrid && (
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
            viewBox={`0 0 ${frameWidth} ${frameHeight}`}
            preserveAspectRatio="none"
            shapeRendering="geometricPrecision"
          >
            {matrixOuterBorderVisible && (
              <rect
                x={gridStrokeWidth / 2}
                y={gridStrokeWidth / 2}
                width={Math.max(0, frameWidth - gridStrokeWidth)}
                height={Math.max(0, frameHeight - gridStrokeWidth)}
                rx={MATRIX_GRID_RADIUS}
                fill="none"
                stroke={d.color ?? "#6366f1"}
                strokeWidth={gridStrokeWidth}
                vectorEffect="non-scaling-stroke"
              />
            )}
            {matrixGridLines?.map((line, index) => (
              <line
                key={`${line.x1}-${line.y1}-${line.x2}-${line.y2}-${index}`}
                x1={line.x1}
                y1={line.y1}
                x2={line.x2}
                y2={line.y2}
                stroke={d.color ?? "#6366f1"}
                strokeWidth={gridStrokeWidth}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
        )}
        {d.title !== "" && (
          <div
            data-canvas-label-box="true"
            className="absolute -top-3 left-3 rounded-md px-2 py-0.5 text-xs font-medium shadow-sm"
            style={{
              backgroundColor: d.color ?? "#6366f1",
              color: "white",
              ...authoredTextStyle,
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
