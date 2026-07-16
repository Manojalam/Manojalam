"use client";

import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { useReactFlow } from "@xyflow/react";
import { ArrowLeftRight, CircleDot, GitBranch, GripVertical, LocateFixed, Move, RotateCcw, Trash2, X } from "lucide-react";
import { useCanvasStore } from "@/store/canvas-store";
import { CONNECTOR_CONTROL_Z_INDEX } from "@/lib/canvas/connector-control-layer";
import { reverseLogicalConnectors } from "@/lib/canvas/connector-junction";
import { applyConnectorLabelPreset } from "@/lib/canvas/connector-label-presets";
import { ConnectorLabelPresets } from "./ConnectorLabelPresets";
import { ConnectorPathStylePicker } from "./ConnectorPathStylePicker";
import { ConnectorLabelStylePicker } from "./ConnectorLabelStylePicker";
import { resolveConnectorLabelPresentation } from "@/lib/canvas/connector-label-style";
import type { ConnectorLabelPreset, VidyaEdgeData } from "@/lib/types";
import {
  closestConnectorPathPosition,
  connectorPointAtProgress,
  sampleConnectorPath,
} from "@/lib/canvas/connector-label-position";

interface ConnectionLabelEditorProps {
  edgeId: string;
  toolbarEdgeId?: string;
  x: number;
  y: number;
  path: string;
  label?: string;
  selected?: boolean;
  showLabel?: boolean;
  deleteEdgeId?: string;
  onAddBend?: () => void;
  onResetRoute?: () => void;
  onAddJunction?: () => void;
}

function updateLabel(edgeId: string, label: string): void {
  useCanvasStore.setState((state) => ({
    edges: state.edges.map((edge) => edge.id === edgeId
      ? { ...edge, data: { ...(edge.data ?? {}), label } }
      : edge),
    saveStatus: "unsaved",
  }));
}

function updateLabelPosition(
  edgeId: string,
  labelPosition?: number,
  labelPathEdgeId?: string
): void {
  useCanvasStore.setState((state) => ({
    edges: state.edges.map((edge) => {
      if (edge.id !== edgeId) return edge;
      const data = { ...(edge.data ?? {}) } as Record<string, unknown>;
      if (typeof labelPosition === "number" && Number.isFinite(labelPosition)) {
        data.labelPosition = Math.round(Math.max(0, Math.min(1, labelPosition)) * 1_000_000) / 1_000_000;
        if (labelPathEdgeId) data.labelPathEdgeId = labelPathEdgeId;
        else delete data.labelPathEdgeId;
        delete data.labelOffset;
      } else {
        delete data.labelPosition;
        delete data.labelPathEdgeId;
        delete data.labelOffset;
      }
      return { ...edge, data };
    }),
    saveStatus: "unsaved",
  }));
}

function updateToolbarOffset(edgeId: string, toolbarOffset?: { x: number; y: number }): void {
  useCanvasStore.setState((state) => ({
    edges: state.edges.map((edge) => {
      if (edge.id !== edgeId) return edge;
      const data = { ...(edge.data ?? {}) } as Record<string, unknown>;
      if (toolbarOffset) data.toolbarOffset = toolbarOffset;
      else delete data.toolbarOffset;
      return { ...edge, data };
    }),
    saveStatus: "unsaved",
  }));
}

/** A visible edge label plus an in-place editor whenever the edge is selected. */
export function ConnectionLabelEditor({
  edgeId,
  toolbarEdgeId = edgeId,
  x,
  y,
  path,
  label = "",
  selected = false,
  showLabel = true,
  deleteEdgeId = edgeId,
  onAddBend,
  onResetRoute,
  onAddJunction,
}: ConnectionLabelEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const historyCaptured = useRef(false);
  const labelDrag = useRef<{
    startPointer: { x: number; y: number };
    startLabelPoint: { x: number; y: number };
  } | null>(null);
  const toolbarDrag = useRef<{
    startPointer: { x: number; y: number };
    startOffset: { x: number; y: number };
  } | null>(null);
  const deleteEdges = useCanvasStore((state) => state.deleteEdges);
  const pushHistory = useCanvasStore((state) => state.pushHistory);
  const storedLabelData = useCanvasStore((state) => (
    state.edges.find((edge) => edge.id === edgeId)?.data ?? {}
  )) as VidyaEdgeData;
  const storedLabelOffset = useCanvasStore((state) => (
    state.edges.find((edge) => edge.id === edgeId)?.data as Record<string, unknown> | undefined
  )?.labelOffset) as { x?: unknown; y?: unknown } | undefined;
  const storedLabelPosition = useCanvasStore((state) => (
    state.edges.find((edge) => edge.id === edgeId)?.data as Record<string, unknown> | undefined
  )?.labelPosition);
  const storedToolbarOffset = useCanvasStore((state) => (
    state.edges.find((edge) => edge.id === toolbarEdgeId)?.data as Record<string, unknown> | undefined
  )?.toolbarOffset) as { x?: unknown; y?: unknown } | undefined;
  const { screenToFlowPosition } = useReactFlow();
  const legacyLabelOffset = {
    x: typeof storedLabelOffset?.x === "number" ? storedLabelOffset.x : 0,
    y: typeof storedLabelOffset?.y === "number" ? storedLabelOffset.y : 0,
  };
  const sampledPath = useMemo(() => sampleConnectorPath(path), [path]);
  const savedProgress = typeof storedLabelPosition === "number" && Number.isFinite(storedLabelPosition)
    ? Math.max(0, Math.min(1, storedLabelPosition))
    : null;
  const legacyPosition = legacyLabelOffset.x !== 0 || legacyLabelOffset.y !== 0
    ? closestConnectorPathPosition(sampledPath, {
        x: x + legacyLabelOffset.x,
        y: y + legacyLabelOffset.y,
      })
    : null;
  const labelPoint = savedProgress === null
    ? legacyPosition?.point ?? { x, y }
    : connectorPointAtProgress(sampledPath, savedProgress, { x, y });
  const labelX = labelPoint.x;
  const labelY = labelPoint.y;
  const labelWasMoved = savedProgress !== null || legacyPosition !== null;
  const hasMovableLabel = label.trim().length > 0;
  const toolbarOffset = {
    x: typeof storedToolbarOffset?.x === "number" ? storedToolbarOffset.x : 0,
    y: typeof storedToolbarOffset?.y === "number" ? storedToolbarOffset.y : -64,
  };
  const toolbarX = x + toolbarOffset.x;
  const toolbarY = y + toolbarOffset.y;
  const labelPresentation = resolveConnectorLabelPresentation(storedLabelData);
  const labelStyle: CSSProperties = {
    color: labelPresentation.color,
    fontFamily: labelPresentation.fontFamily,
    fontSize: `${labelPresentation.fontSize}px`,
    fontWeight: labelPresentation.fontWeight,
    fontStyle: labelPresentation.fontStyle,
  };
  const labelInputStyle: CSSProperties = {
    color: labelPresentation.color,
    fontFamily: labelPresentation.fontFamily,
    fontWeight: labelPresentation.fontWeight,
    fontStyle: labelPresentation.fontStyle,
  };

  useEffect(() => {
    if (!selected || label) return;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [label, selected]);

  const setLabel = (nextLabel: string) => {
    if (!historyCaptured.current) {
      pushHistory();
      historyCaptured.current = true;
    }
    updateLabel(edgeId, nextLabel);
  };

  const selectPreset = (preset: ConnectorLabelPreset) => {
    if (!historyCaptured.current) {
      pushHistory();
      historyCaptured.current = true;
    }
    useCanvasStore.setState((state) => ({
      edges: applyConnectorLabelPreset(state.edges, toolbarEdgeId, preset),
      saveStatus: "unsaved",
    }));
  };

  const reverseConnection = () => {
    const state = useCanvasStore.getState();
    const edges = reverseLogicalConnectors(state.edges, [toolbarEdgeId]);
    if (edges === state.edges) return;
    state.pushHistory();
    useCanvasStore.setState({ edges, saveStatus: "unsaved" });
  };

  return (
    <>
      {showLabel && label && (
        <div
          data-export-edge-id={edgeId}
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: "none",
            ...labelStyle,
          }}
          className="rounded-md border bg-background px-1.5 py-0.5 text-[10px] font-medium shadow-sm"
        >
          {label}
        </div>
      )}

      {selected && (
        <div
          data-export-ignore
          role="group"
          aria-label="Edit connection label"
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${toolbarX}px,${toolbarY}px)`,
            pointerEvents: "auto",
            zIndex: CONNECTOR_CONTROL_Z_INDEX,
          }}
          className="nodrag nopan nowheel isolate flex items-center gap-1 rounded-lg border bg-background/95 p-1 shadow-lg backdrop-blur"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onBlur={(event) => {
            if (event.currentTarget.contains(event.relatedTarget)) return;
            historyCaptured.current = false;
          }}
        >
          <button
            type="button"
            title="Drag to move this connector toolbar. Double-click to reset its position."
            aria-label="Move connector toolbar"
            className="touch-none flex h-7 w-7 cursor-grab items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              pushHistory();
              toolbarDrag.current = {
                startPointer: screenToFlowPosition({ x: event.clientX, y: event.clientY }),
                startOffset: toolbarOffset,
              };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (!toolbarDrag.current) return;
              event.preventDefault();
              event.stopPropagation();
              const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
              updateToolbarOffset(toolbarEdgeId, {
                x: Math.round(toolbarDrag.current.startOffset.x + point.x - toolbarDrag.current.startPointer.x),
                y: Math.round(toolbarDrag.current.startOffset.y + point.y - toolbarDrag.current.startPointer.y),
              });
            }}
            onPointerUp={(event) => {
              event.stopPropagation();
              toolbarDrag.current = null;
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
            }}
            onPointerCancel={() => {
              toolbarDrag.current = null;
            }}
            onDoubleClick={(event) => {
              event.stopPropagation();
              pushHistory();
              updateToolbarOffset(toolbarEdgeId);
            }}
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <input
            ref={inputRef}
            aria-label="Connection label"
            value={label}
            placeholder="Connection label"
            className="h-7 w-28 rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-primary"
            style={labelInputStyle}
            onChange={(event) => setLabel(event.target.value)}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") inputRef.current?.blur();
              if (event.key === "Escape") inputRef.current?.blur();
            }}
          />
          <ConnectorLabelPresets currentLabel={label} onSelect={selectPreset} />
          <ConnectorPathStylePicker edgeId={toolbarEdgeId} />
          <ConnectorLabelStylePicker edgeId={toolbarEdgeId} />
          <button
            type="button"
            title="Reverse connection direction"
            aria-label="Reverse connection direction"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={reverseConnection}
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title={hasMovableLabel ? "Drag the label along this connector" : "Enter a label before moving it"}
            aria-label="Move connection label"
            disabled={!hasMovableLabel}
            className={hasMovableLabel
              ? "flex h-7 w-7 cursor-move items-center justify-center rounded-md bg-primary/10 text-primary hover:bg-primary/20"
              : "flex h-7 w-7 cursor-not-allowed items-center justify-center rounded-md text-muted-foreground/40"}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              pushHistory();
              labelDrag.current = {
                startPointer: screenToFlowPosition({ x: event.clientX, y: event.clientY }),
                startLabelPoint: { x: labelX, y: labelY },
              };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (!labelDrag.current) return;
              event.preventDefault();
              event.stopPropagation();
              const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
              const desiredPoint = {
                x: labelDrag.current.startLabelPoint.x + point.x - labelDrag.current.startPointer.x,
                y: labelDrag.current.startLabelPoint.y + point.y - labelDrag.current.startPointer.y,
              };
              const nextPosition = closestConnectorPathPosition(sampledPath, desiredPoint);
              updateLabelPosition(edgeId, nextPosition.progress, toolbarEdgeId);
            }}
            onPointerUp={(event) => {
              event.stopPropagation();
              labelDrag.current = null;
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
            }}
            onPointerCancel={() => {
              labelDrag.current = null;
            }}
          >
            <Move className="h-3.5 w-3.5" />
          </button>
          {labelWasMoved && (
            <button
              type="button"
              title="Reset label position"
              aria-label="Reset connection label position"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => {
                pushHistory();
                updateLabelPosition(edgeId);
              }}
            >
              <LocateFixed className="h-3.5 w-3.5" />
            </button>
          )}
          {onAddBend && (
            <button
              type="button"
              title="Add a movable bend point"
              aria-label="Add connector bend point"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={onAddBend}
            >
              <GitBranch className="h-3.5 w-3.5" />
            </button>
          )}
          {onResetRoute && (
            <button
              type="button"
              title="Reset to automatic routing"
              aria-label="Reset connector to automatic routing"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={onResetRoute}
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
          {onAddJunction && (
            <button
              type="button"
              title="Add a connector junction where the line was clicked"
              aria-label="Add connector junction at clicked position"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={onAddJunction}
            >
              <CircleDot className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            title="Clear label"
            aria-label="Clear connection label"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => setLabel("")}
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Delete connection"
            aria-label="Delete connection"
            className="flex h-7 w-7 items-center justify-center rounded-md text-destructive hover:bg-destructive/10"
            onClick={() => deleteEdges([deleteEdgeId])}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </>
  );
}
