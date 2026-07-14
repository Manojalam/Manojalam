"use client";

import { memo, useState, useEffect, useRef, useCallback } from "react";
import { NodeResizer, type NodeProps } from "@xyflow/react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { NodeHandles } from "./NodeHandles";
import {
  getFittedTextPresentation, resolveFillColor, resolveBorderColor,
  resolveBorderWidth, resolveNodeBorderRadius, resolveFillOpacity, resolveBorderStyle,
  textMeasurementKey,
} from "@/lib/style-utils";
import { shapeTextContentSize } from "@/lib/canvas/shape-fitting";
import type { TextBlockNodeData, InternalFillRegion, BorderLayer } from "@/lib/types";
import { useCanvasStore } from "@/store/canvas-store";
import { useUIStore } from "@/store/ui-store";
import { RichTextEditor } from "../RichTextEditor";
import { InternalFillLayer } from "../InternalFillLayer";
import { BorderLayers } from "../BorderLayers";
import { NodeQuickActions } from "./NodeQuickActions";
import { useNodeTextEditRequest } from "./useNodeTextEditRequest";

function TextBlockNodeComponent({ id, data, selected, width, height }: NodeProps) {
  const d  = data as TextBlockNodeData;
  const dd = d as Record<string, unknown>;
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const fitNodeToContent = useCanvasStore((s) => s.fitNodeToContent);
  const pushHistory    = useCanvasStore((s) => s.pushHistory);
  const setSaveStatus  = useCanvasStore((s) => s.setSaveStatus);
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
  const resolvedBorderWidth = resolveBorderWidth(dd);
  const bWidth       = matrixCell ? (matrixGridVisible ? resolvedBorderWidth : 0) : resolvedBorderWidth;
  const nodeSize = {
    width: typeof width === "number" && width > 0 ? width : 240,
    height: typeof height === "number" && height > 0 ? height : 56,
  };
  const bRadius      = matrixCell
    ? (matrixRole === "header" ? 7 : 4)
    : resolveNodeBorderRadius(dd, nodeSize, 32);
  const bStyle       = resolveBorderStyle(dd);
  const borderLayers = (dd.borderLayers as BorderLayer[]) ?? [];
  const fillOpacity  = resolveFillOpacity(dd);
  const fillRegions  = (dd.internalFillRegions as InternalFillRegion[]) ?? [];

  const [editing, setEditing] = useState(false);
  const initialContent = (dd.richText as string) || d.text || "";
  const availableTextSize = shapeTextContentSize("rectangle", nodeSize, "text");
  const textPresentation = getFittedTextPresentation(dd, availableTextSize.width, 14);
  const editHistoryCaptured = useRef(false);
  const editDirty = useRef(false);
  const captureTextHistory = useCallback(() => {
    if (!editHistoryCaptured.current) {
      pushHistory();
      editHistoryCaptured.current = true;
    }
    editDirty.current = true;
  }, [pushHistory]);

  const beginRequestedEdit = useCallback(() => setEditing(true), []);
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
        minWidth={160}
        minHeight={40}
        isVisible={selected && !editing && !isDrawing && !matrixCell}
        lineStyle={{ borderRadius: bRadius }}
        onResizeStart={(_, params) => {
          pushHistory();
          updateNodeData(id, { userSize: { width: params.width, height: params.height } });
        }}
        onResizeEnd={(_, params) => {
          updateNodeData(id, { userSize: { width: params.width, height: params.height } });
          setSaveStatus("unsaved");
        }}
      />
      <div
        className={cn(
          "group relative h-full w-full px-4 py-3",
          selected && "ring-2 ring-primary ring-offset-2 ring-offset-background"
        )}
        style={{
          backgroundColor: fillColor ?? "transparent",
          border: bWidth > 0 ? `${bWidth}px ${bStyle} ${borderColor ?? (matrixCell ? "#94a3b8" : "transparent")}` : undefined,
          borderRadius: bRadius,
        }}
        onDoubleClick={() => {
          if (isDrawing) return;
          useCanvasStore.setState((s) => ({
            nodes: s.nodes.map((n) => n.id === id ? { ...n, style: { ...(n.style ?? {}), height: undefined } } : n),
          }));
          editHistoryCaptured.current = false;
          editDirty.current = false;
          setEditing(true);
        }}
      >
        {/* Extra border layers */}
        {!matrixCell && <BorderLayers layers={borderLayers} primaryWidth={bWidth} baseRadius={bRadius} />}

        <NodeHandles color={borderColor ?? "#6366f1"} />
        <NodeQuickActions nodeId={id} color={borderColor ?? "#6366f1"} selected={selected} />

        {/* Add connected child */}
        {!isDrawing && (
          <button
            data-export-ignore
            className="absolute -right-3.5 -bottom-3.5 z-20 hidden h-7 w-7 items-center justify-center rounded-full border-2 border-background shadow-md transition-transform hover:scale-110 group-hover:flex"
            style={{ backgroundColor: borderColor ?? "#6366f1" }}
            onClick={(e) => { e.stopPropagation(); createChildNode(id); }}
            title="Add connected node"
          >
            <Plus className="h-3.5 w-3.5 text-white" />
          </button>
        )}

        {/* Internal fill regions (clipped to node bounds) */}
        {!matrixCell && <div className="absolute inset-0 overflow-hidden" style={{ borderRadius: bRadius }}>
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

        <div className={cn(
          "relative z-10 text-sm text-foreground",
          editing ? "nodrag nopan cursor-text" : "cursor-grab active:cursor-grabbing"
        )}
          style={textPresentation.style}>
          <RichTextEditor
            nodeId={id}
            initialContent={initialContent}
            editable={editing}
            measurementWidth={dd.userSize ? availableTextSize.width : undefined}
            measurementKey={`${textMeasurementKey(dd)}|${textPresentation.fontSize}|${Math.round(availableTextSize.width)}|${Math.round(availableTextSize.height)}`}
            placeholder="Double-click to type…"
            blockAlign={dd.textAlign as "left" | "center" | "right" | "justify" | undefined}
            onChange={(html) => {
              captureTextHistory();
              const plain = html.replace(/<[^>]+>/g, "").trim();
              updateNodeData(id, { richText: html, text: plain });
            }}
            onContentSizeChange={(size) => fitNodeToContent(id, size)}
            onBlur={finishEditing}
          />
        </div>
      </div>
    </>
  );
}

export const TextBlockNode = memo(TextBlockNodeComponent);
