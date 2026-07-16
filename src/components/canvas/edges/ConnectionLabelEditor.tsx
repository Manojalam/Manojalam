"use client";

import { useEffect, useRef } from "react";
import { useReactFlow } from "@xyflow/react";
import { CircleDot, GitBranch, LocateFixed, Move, RotateCcw, Trash2, X } from "lucide-react";
import { useCanvasStore } from "@/store/canvas-store";
import { ConnectorLabelPresets } from "./ConnectorLabelPresets";

interface ConnectionLabelEditorProps {
  edgeId: string;
  x: number;
  y: number;
  label?: string;
  selected?: boolean;
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

function updateLabelOffset(edgeId: string, labelOffset?: { x: number; y: number }): void {
  useCanvasStore.setState((state) => ({
    edges: state.edges.map((edge) => {
      if (edge.id !== edgeId) return edge;
      const data = { ...(edge.data ?? {}) } as Record<string, unknown>;
      if (labelOffset) data.labelOffset = labelOffset;
      else delete data.labelOffset;
      return { ...edge, data };
    }),
    saveStatus: "unsaved",
  }));
}

/** A visible edge label plus an in-place editor whenever the edge is selected. */
export function ConnectionLabelEditor({
  edgeId,
  x,
  y,
  label = "",
  selected = false,
  onAddBend,
  onResetRoute,
  onAddJunction,
}: ConnectionLabelEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const historyCaptured = useRef(false);
  const labelDrag = useRef<{
    startPointer: { x: number; y: number };
    startOffset: { x: number; y: number };
  } | null>(null);
  const deleteEdges = useCanvasStore((state) => state.deleteEdges);
  const pushHistory = useCanvasStore((state) => state.pushHistory);
  const storedLabelOffset = useCanvasStore((state) => (
    state.edges.find((edge) => edge.id === edgeId)?.data as Record<string, unknown> | undefined
  )?.labelOffset) as { x?: unknown; y?: unknown } | undefined;
  const { screenToFlowPosition } = useReactFlow();
  const labelOffset = {
    x: typeof storedLabelOffset?.x === "number" ? storedLabelOffset.x : 0,
    y: typeof storedLabelOffset?.y === "number" ? storedLabelOffset.y : 0,
  };
  const labelX = x + labelOffset.x;
  const labelY = y + labelOffset.y;
  const labelWasMoved = labelOffset.x !== 0 || labelOffset.y !== 0;

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

  return (
    <>
      {label && (
        <div
          data-export-edge-id={edgeId}
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: "none",
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
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY - (label ? 36 : 0)}px)`,
            pointerEvents: "all",
          }}
          className="nodrag nopan flex items-center gap-1 rounded-lg border bg-background/95 p-1 shadow-lg backdrop-blur"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onBlur={(event) => {
            if (event.currentTarget.contains(event.relatedTarget)) return;
            historyCaptured.current = false;
          }}
        >
          <input
            ref={inputRef}
            aria-label="Connection label"
            value={label}
            placeholder="Connection label"
            className="h-7 w-28 rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-primary"
            onChange={(event) => setLabel(event.target.value)}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") inputRef.current?.blur();
              if (event.key === "Escape") inputRef.current?.blur();
            }}
          />
          <ConnectorLabelPresets currentLabel={label} onSelect={setLabel} />
          <button
            type="button"
            title="Drag to move the label"
            aria-label="Move connection label"
            className="flex h-7 w-7 cursor-move items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              pushHistory();
              labelDrag.current = {
                startPointer: screenToFlowPosition({ x: event.clientX, y: event.clientY }),
                startOffset: labelOffset,
              };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (!labelDrag.current) return;
              event.preventDefault();
              event.stopPropagation();
              const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
              updateLabelOffset(edgeId, {
                x: Math.round(labelDrag.current.startOffset.x + point.x - labelDrag.current.startPointer.x),
                y: Math.round(labelDrag.current.startOffset.y + point.y - labelDrag.current.startPointer.y),
              });
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
                updateLabelOffset(edgeId);
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
              title="Add a connector junction"
              aria-label="Add connector junction"
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
            onClick={() => deleteEdges([edgeId])}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </>
  );
}
