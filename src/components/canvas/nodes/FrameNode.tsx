"use client";

import { memo } from "react";
import { NodeResizer, ViewportPortal, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import type { FrameNodeData } from "@/lib/types";
import { NodeQuickActions } from "./NodeQuickActions";
import { useNodeManualResize } from "./useNodeManualResize";
import { objectRotationStyle } from "@/lib/canvas/object-rotation";
import {
  MATRIX_GRID_RADIUS,
  matrixCellBorderRadius,
} from "@/lib/layout/matrix-presentation";
import { getAuthoredTextStyle } from "@/lib/style-utils";
import { useCanvasStore } from "@/store/canvas-store";

function matrixGridDashArray(
  style: FrameNodeData["borderStyle"],
  width: number
): string | undefined {
  if (style === "dashed") {
    return `${Math.max(3, width * 5)} ${Math.max(2, width * 3)}`;
  }
  if (style === "dotted") return `0.1 ${Math.max(2, width * 3)}`;
  return undefined;
}

function selectRepeatedSource(nodeId: string, additive: boolean): void {
  useCanvasStore.setState((state) => {
    const selectedIds = new Set(additive ? state.selectedNodeIds : []);
    if (additive && selectedIds.has(nodeId)) selectedIds.delete(nodeId);
    else selectedIds.add(nodeId);
    return {
      nodes: state.nodes.map((node) => ({ ...node, selected: selectedIds.has(node.id) })),
      edges: state.edges.map((edge) => ({ ...edge, selected: false })),
      selectedNodeIds: Array.from(selectedIds),
      selectedEdgeIds: [],
    };
  });
}

function selectMatrixFoldSection(
  matrixRootId: string,
  sectionIndex: number,
  authoredNodeIds: readonly string[],
  additive: boolean
): void {
  useCanvasStore.setState((state) => {
    const sectionIds = new Set(authoredNodeIds);
    state.nodes.forEach((node) => {
      const data = (node.data ?? {}) as Record<string, unknown>;
      if (
        data.matrixFrameFor === matrixRootId
        && data.matrixFoldSectionIndex === sectionIndex
      ) {
        sectionIds.add(node.id);
      }
    });
    const selectedIds = new Set(additive ? state.selectedNodeIds : []);
    const removeSection = additive
      && sectionIds.size > 0
      && [...sectionIds].every((nodeId) => selectedIds.has(nodeId));
    sectionIds.forEach((nodeId) => {
      if (removeSection) selectedIds.delete(nodeId);
      else selectedIds.add(nodeId);
    });
    return {
      nodes: state.nodes.map((node) => ({ ...node, selected: selectedIds.has(node.id) })),
      edges: state.edges.map((edge) => ({ ...edge, selected: false })),
      selectedNodeIds: Array.from(selectedIds),
      selectedEdgeIds: [],
    };
  });
}

function FrameNodeComponent({
  id,
  data,
  selected,
  width,
  height,
  positionAbsoluteX,
  positionAbsoluteY,
}: NodeProps) {
  const d = data as FrameNodeData;
  const isMatrixFrame = typeof d.matrixFrameFor === "string";
  const matrixGridLines = Array.isArray(d.matrixGridLines) ? d.matrixGridLines : null;
  const matrixRepeatedCells = Array.isArray(d.matrixRepeatedCells) ? d.matrixRepeatedCells : [];
  const matrixFoldSectionIndex = typeof d.matrixFoldSectionIndex === "number"
    ? d.matrixFoldSectionIndex
    : null;
  const matrixFoldSectionNodeIds = Array.isArray(d.matrixFoldSectionNodeIds)
    ? d.matrixFoldSectionNodeIds
    : [];
  const matrixFoldSectionSelectorOffset = d.matrixFoldSectionSelectorOffset
    && typeof d.matrixFoldSectionSelectorOffset.x === "number"
    && typeof d.matrixFoldSectionSelectorOffset.y === "number"
    ? d.matrixFoldSectionSelectorOffset
    : null;
  const isMatrixGrid = isMatrixFrame && matrixGridLines !== null;
  const matrixOuterBorderVisible = d.matrixOuterBorderVisible !== false;
  const frameWidth = typeof width === "number" && width > 0 ? width : 1;
  const frameHeight = typeof height === "number" && height > 0 ? height : 1;
  const gridStrokeWidth = typeof d.borderWidth === "number" ? d.borderWidth : 1;
  const gridStrokeDasharray = matrixGridDashArray(d.borderStyle, gridStrokeWidth);
  const resizeControls = useNodeManualResize(id);
  const authoredTextStyle = getAuthoredTextStyle(d as Record<string, unknown>);
  const selectedNodeIds = useCanvasStore((state) => state.selectedNodeIds);

  return (
    <>
      <NodeResizer
        minWidth={200}
        minHeight={150}
        isVisible={selected && !d.locked}
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
        {isMatrixGrid && matrixRepeatedCells.map((cell) => (
          <div
            key={`${cell.key}-background`}
            data-export-surface-effect-shadow-layers={
              cell.exportSurfaceEffectShadowLayers
            }
            data-export-surface-effect-shadow={cell.exportSurfaceEffectShadow}
            className="pointer-events-none absolute"
            style={{
              left: cell.x,
              top: cell.y,
              width: cell.width,
              height: cell.height,
              borderRadius: matrixCellBorderRadius(cell.role),
              backgroundColor: cell.background,
              backgroundImage: cell.backgroundImage,
              backgroundBlendMode: cell.backgroundBlendMode,
              backdropFilter: cell.backdropFilter,
              boxShadow: cell.boxShadow,
              borderColor: cell.borderColor,
              borderStyle: cell.borderStyle,
              borderWidth: cell.borderWidth,
            }}
          />
        ))}
        {isMatrixGrid && (
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-10 h-full w-full overflow-visible"
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
                strokeDasharray={gridStrokeDasharray}
                strokeLinecap={d.borderStyle === "dotted" ? "round" : undefined}
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
                stroke={line.color ?? d.color ?? "#6366f1"}
                strokeWidth={gridStrokeWidth}
                strokeDasharray={gridStrokeDasharray}
                strokeLinecap={d.borderStyle === "dotted" ? "round" : undefined}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
        )}
        {isMatrixGrid && matrixRepeatedCells.map((cell) => (
          <div
            key={`${cell.key}-content`}
            aria-hidden="true"
            className="pointer-events-none absolute z-20 flex items-center justify-center overflow-hidden px-2 py-1 text-sm font-medium [&_p]:m-0"
            style={{
              left: cell.x,
              top: cell.y,
              width: cell.width,
              height: cell.height,
              color: cell.color,
              fontSize: cell.fontSize,
              fontFamily: cell.fontFamily,
              fontStyle: cell.fontStyle,
              fontWeight: cell.fontWeight,
              textAlign: cell.textAlign,
            }}
          >
            {cell.html
              ? <div className="w-full" dangerouslySetInnerHTML={{ __html: cell.html }} />
              : <div className="w-full">{cell.text}</div>}
          </div>
        ))}
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
      {isMatrixGrid && matrixRepeatedCells.length > 0 && (
        <ViewportPortal>
          {matrixRepeatedCells.map((cell) => {
            const sourceSelected = selectedNodeIds.includes(cell.sourceNodeId);
            return (
              <button
                type="button"
                key={`${cell.key}-interaction`}
                data-export-ignore
                data-matrix-repeated-cell={cell.key}
                aria-label={`Select ${cell.text || "continued Matrix ancestor"}`}
                aria-pressed={sourceSelected}
                className={cn(
                  "nodrag nopan pointer-events-auto absolute z-20 cursor-pointer border-0 bg-transparent p-0",
                  "hover:ring-2 hover:ring-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  sourceSelected && "ring-2 ring-primary ring-inset"
                )}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  selectRepeatedSource(
                    cell.sourceNodeId,
                    event.shiftKey || event.ctrlKey || event.metaKey
                  );
                }}
                style={{
                  left: positionAbsoluteX + cell.x,
                  top: positionAbsoluteY + cell.y,
                  width: cell.width,
                  height: cell.height,
                }}
              />
            );
          })}
        </ViewportPortal>
      )}
      {isMatrixGrid
        && typeof d.matrixFrameFor === "string"
        && matrixFoldSectionIndex !== null
        && matrixFoldSectionSelectorOffset && (
        <ViewportPortal>
          <button
            type="button"
            data-export-ignore
            aria-label={`Select Fold ${matrixFoldSectionIndex + 1}`}
            aria-pressed={selected}
            className={cn(
              "nodrag nopan pointer-events-auto absolute z-40 h-5 rounded-full border px-2 text-[9px] font-semibold shadow-sm",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              selected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background/90 text-foreground hover:border-primary hover:bg-muted"
            )}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              selectMatrixFoldSection(
                d.matrixFrameFor!,
                matrixFoldSectionIndex,
                matrixFoldSectionNodeIds,
                event.shiftKey || event.ctrlKey || event.metaKey
              );
            }}
            style={{
              left: positionAbsoluteX + matrixFoldSectionSelectorOffset.x,
              top: positionAbsoluteY + matrixFoldSectionSelectorOffset.y,
            }}
          >
            Fold {matrixFoldSectionIndex + 1}
          </button>
        </ViewportPortal>
      )}
    </>
  );
}

export const FrameNode = memo(FrameNodeComponent);
