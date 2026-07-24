"use client";

import { memo, useState, useEffect, useRef, useCallback } from "react";
import { NodeResizer, type NodeProps } from "@xyflow/react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { NodeHandles } from "./NodeHandles";
import {
  getFittedTextPresentation, resolveFillColor, resolveBorderColor,
  resolveBorderWidth, resolveNodeBorderRadius, resolveFillOpacity, resolveBorderStyle,
  textMeasurementKey, themeAwareNodeFillColor,
} from "@/lib/style-utils";
import {
  shapeTextContentSize,
} from "@/lib/canvas/shape-fitting";
import {
  normalizeTextCalloutDirection,
  normalizeTextFrameStyle,
  textFrameBodyBox,
  textFrameContentSize,
} from "@/lib/canvas/text-callout";
import { shouldConstrainTextToNode } from "@/lib/canvas/node-sizing";
import type { TextBlockNodeData, InternalFillRegion, BorderLayer } from "@/lib/types";
import { useCanvasStore } from "@/store/canvas-store";
import { useUIStore } from "@/store/ui-store";
import { RichTextEditor } from "../RichTextEditor";
import { InternalFillLayer } from "../InternalFillLayer";
import { BorderLayers } from "../BorderLayers";
import { NodeQuickActions } from "./NodeQuickActions";
import { TextRotationHandle } from "./TextRotationHandle";
import { useNodeTextEditRequest } from "./useNodeTextEditRequest";
import { useNodeManualResize } from "./useNodeManualResize";
import { objectRotationStyle } from "@/lib/canvas/object-rotation";
import { normalizeTextRotation, textRotationStyle } from "@/lib/canvas/text-rotation";
import { matrixCellBorderRadius } from "@/lib/layout/matrix-presentation";
import { surfaceEffectFilter, surfaceEffectStyle } from "@/lib/canvas/surface-effects";
import { TextCalloutSurface } from "../TextCalloutSurface";

function TextBlockNodeComponent({ id, data, selected, width, height }: NodeProps) {
  const d  = data as TextBlockNodeData;
  const dd = d as Record<string, unknown>;
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const fitNodeToContent = useCanvasStore((s) => s.fitNodeToContent);
  const pushHistory    = useCanvasStore((s) => s.pushHistory);
  const createChildNode = useCanvasStore((s) => s.createChildNode);

  const drawingModeNodeId   = useUIStore((s) => s.drawingModeNodeId);
  const drawingRegionColor  = useUIStore((s) => s.drawingRegionColor);
  const drawingRegionOpacity = useUIStore((s) => s.drawingRegionOpacity);
  const isDrawing           = drawingModeNodeId === id;

  const fillColor    = resolveFillColor(dd);
  const borderColor  = resolveBorderColor(dd);
  const matrixCell   = dd.matrixCell === true;
  const matrixRole   = dd.matrixCellRole as string | undefined;
  const matrixGridVisible = dd.matrixGridVisible !== false;
  const textFrameStyle = matrixCell ? "plain" : normalizeTextFrameStyle(dd.textFrameStyle);
  const textCalloutDirection = normalizeTextCalloutDirection(dd.textCalloutDirection);
  const resolvedBorderWidth = resolveBorderWidth(dd);
  const bWidth       = matrixCell ? (matrixGridVisible ? resolvedBorderWidth : 0) : resolvedBorderWidth;
  const nodeSize = {
    width: typeof width === "number" && width > 0 ? width : 240,
    height: typeof height === "number" && height > 0 ? height : 56,
  };
  const bRadius      = matrixCell
    ? matrixCellBorderRadius(matrixRole)
    : resolveNodeBorderRadius(dd, nodeSize, 32);
  const bStyle       = resolveBorderStyle(dd);
  const borderLayers = (dd.borderLayers as BorderLayer[]) ?? [];
  const fillOpacity  = resolveFillOpacity(dd);
  const fillRegions  = (dd.internalFillRegions as InternalFillRegion[]) ?? [];

  const [editing, setEditing] = useState(false);
  const [editFocusPoint, setEditFocusPoint] = useState<{ clientX: number; clientY: number } | null>(null);
  const initialContent = (dd.richText as string) || d.text || "";
  const availableTextSize = textFrameStyle === "plain"
    ? shapeTextContentSize("rectangle", nodeSize, "text")
    : textFrameContentSize(nodeSize, textFrameStyle, textCalloutDirection);
  const textPresentation = getFittedTextPresentation(dd, availableTextSize.width, 14, {
    availableHeight: availableTextSize.height,
    constrain: shouldConstrainTextToNode(dd, nodeSize),
    backgroundColor: fillColor,
  });
  const textRotation = normalizeTextRotation(dd.textRotation);
  const textRotationTargetRef = useRef<HTMLDivElement>(null);
  const resizeControls = useNodeManualResize(id);
  const textFrameBody = textFrameBodyBox(textFrameStyle, textCalloutDirection);
  const hasTextFrame = textFrameStyle !== "plain";
  const editHistoryCaptured = useRef(false);
  const editDirty = useRef(false);
  const captureTextHistory = useCallback(() => {
    if (!editHistoryCaptured.current) {
      pushHistory();
      editHistoryCaptured.current = true;
    }
    editDirty.current = true;
  }, [pushHistory]);

  const beginRequestedEdit = useCallback(() => {
    setEditFocusPoint(null);
    setEditing(true);
  }, []);
  useNodeTextEditRequest(id, beginRequestedEdit);

  const finishEditing = useCallback(() => {
    if (editDirty.current) {
      pushHistory();
      editDirty.current = false;
    }
    editHistoryCaptured.current = false;
    setEditing(false);
  }, [pushHistory]);

  useEffect(() => {
    if (!selected && editing) {
      const frame = requestAnimationFrame(finishEditing);
      return () => cancelAnimationFrame(frame);
    }
  }, [selected, editing, finishEditing]);

  return (
    <>
      <NodeResizer
        minWidth={matrixCell ? 80 : 160}
        minHeight={40}
        isVisible={selected && !editing && !isDrawing}
        lineStyle={{ borderRadius: bRadius }}
        onResizeStart={resizeControls.onResizeStart}
        onResizeEnd={resizeControls.onResizeEnd}
      />
      <div className="group relative h-full w-full">
        <NodeHandles color={borderColor ?? "#6366f1"} selected={selected} />
        <NodeQuickActions nodeId={id} color={borderColor ?? "#6366f1"} selected={selected} />

        {/* Add connected child */}
        {!isDrawing && (
          <button
            data-export-ignore
            type="button"
            aria-label="Add connected child"
            className="absolute -right-3.5 -bottom-3.5 z-20 hidden h-7 w-7 items-center justify-center rounded-full border-2 border-background shadow-md transition-transform hover:scale-110 group-hover:flex"
            style={{ backgroundColor: borderColor ?? "#6366f1" }}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); createChildNode(id); }}
            title="Add connected child"
          >
            <Plus className="h-3.5 w-3.5 text-white" />
          </button>
        )}

        <div
          className={cn(
            "absolute inset-0",
            !hasTextFrame && "p-1",
            matrixCell && "overflow-hidden",
            selected && !hasTextFrame && "ring-2 ring-primary ring-offset-2 ring-offset-background"
          )}
          style={{
            ...(hasTextFrame ? {} : {
              backgroundColor: themeAwareNodeFillColor(fillColor) ?? "transparent",
              border: bWidth > 0 ? `${bWidth}px ${bStyle} ${borderColor ?? (matrixCell ? "#94a3b8" : "transparent")}` : undefined,
              borderRadius: bRadius,
              ...surfaceEffectStyle(dd, borderColor),
            }),
            ...objectRotationStyle("text", dd),
          }}
          onDoubleClick={(event) => {
            event.stopPropagation();
            if (isDrawing) return;
            editHistoryCaptured.current = false;
            editDirty.current = false;
            setEditFocusPoint({ clientX: event.clientX, clientY: event.clientY });
            setEditing(true);
          }}
        >
        {hasTextFrame && (
          <TextCalloutSurface
            style={textFrameStyle}
            direction={textCalloutDirection}
            fillColor={themeAwareNodeFillColor(fillColor) ?? "var(--card)"}
            borderColor={borderColor ?? "var(--border)"}
            borderWidth={bWidth}
            borderStyle={bStyle}
            selected={selected}
            filter={surfaceEffectFilter(dd, borderColor)}
          />
        )}

        {/* Extra border layers */}
        {!matrixCell && !hasTextFrame && (
          <BorderLayers layers={borderLayers} primaryWidth={bWidth} baseRadius={bRadius} />
        )}

        {/* Internal fill regions (clipped to node bounds) */}
        {!matrixCell && !hasTextFrame && <div className="absolute inset-0 overflow-hidden" style={{ borderRadius: bRadius }}>
          <InternalFillLayer
            regions={fillRegions}
            isDrawingMode={isDrawing}
            drawingColor={drawingRegionColor}
            drawingOpacity={drawingRegionOpacity}
            fillOpacity={fillOpacity}
            interactive={selected && !isDrawing}
            onRegionAdded={(r) => updateNodeData(id, { internalFillRegions: [...fillRegions, r] })}
            onRegionUpdated={(rid, patch) => updateNodeData(id, {
              internalFillRegions: fillRegions.map((x) => x.id === rid ? { ...x, ...patch } : x),
            })}
          />
        </div>}

        <div
          data-node-content-layer="true"
          data-node-owner={id}
          className={cn(
            "z-10 text-sm text-foreground",
            hasTextFrame ? "absolute flex items-center p-2" : "relative",
            editing ? "nodrag nopan cursor-text" : "cursor-grab active:cursor-grabbing"
          )}
          style={hasTextFrame ? {
            left: `${textFrameBody.x}%`,
            top: `${textFrameBody.y}%`,
            width: `${textFrameBody.width}%`,
            height: `${textFrameBody.height}%`,
          } : undefined}
        >
          <div ref={textRotationTargetRef} className="w-full" style={{ ...textPresentation.style, ...textRotationStyle(textRotation) }}>
            <RichTextEditor
            nodeId={id}
            initialContent={initialContent}
            editable={editing}
            initialFocusPoint={editFocusPoint}
            className={cn(
              textPresentation.singleWord && "single-word-fit",
              textPresentation.constrained && !textPresentation.singleWord && "bounded-text-fit"
            )}
            measurementKey={textMeasurementKey(dd)}
            measurementWidth={availableTextSize.width}
            measurementFontSize={textPresentation.authoredFontSize}
            contentScale={textPresentation.scale}
            placeholder="Double-click to type…"
            blockAlign={dd.textAlign as "left" | "center" | "right" | "justify" | undefined}
            onChange={(html) => {
              captureTextHistory();
              const plain = html.replace(/<[^>]+>/g, "").trim();
              updateNodeData(id, { richText: html, text: plain });
            }}
            onContentSizeChange={(size, reason) => fitNodeToContent(id, size, reason)}
            onBlur={finishEditing}
            />
          </div>
          {selected && !editing && !isDrawing && !matrixCell && d.locked !== true && (
            <TextRotationHandle
              nodeId={id}
              targetRef={textRotationTargetRef}
              rotation={textRotation}
              color={borderColor ?? "#6366f1"}
            />
          )}
        </div>
        </div>
      </div>
    </>
  );
}

export const TextBlockNode = memo(TextBlockNodeComponent);
