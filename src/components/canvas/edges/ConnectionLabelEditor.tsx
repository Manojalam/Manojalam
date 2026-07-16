"use client";

import { useEffect, useRef } from "react";
import { Trash2, X } from "lucide-react";
import { useCanvasStore } from "@/store/canvas-store";

interface ConnectionLabelEditorProps {
  edgeId: string;
  x: number;
  y: number;
  label?: string;
  selected?: boolean;
}

function updateLabel(edgeId: string, label: string): void {
  useCanvasStore.setState((state) => ({
    edges: state.edges.map((edge) => edge.id === edgeId
      ? { ...edge, data: { ...(edge.data ?? {}), label } }
      : edge),
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
}: ConnectionLabelEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const historyCaptured = useRef(false);
  const deleteEdges = useCanvasStore((state) => state.deleteEdges);
  const pushHistory = useCanvasStore((state) => state.pushHistory);

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
            transform: `translate(-50%, -50%) translate(${x}px,${y}px)`,
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
            transform: `translate(-50%, -50%) translate(${x}px,${y - (label ? 36 : 0)}px)`,
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
            placeholder="Label (Yes / No)"
            className="h-7 w-28 rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-primary"
            onChange={(event) => setLabel(event.target.value)}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") inputRef.current?.blur();
              if (event.key === "Escape") inputRef.current?.blur();
            }}
          />
          {(["Yes", "No"] as const).map((preset) => (
            <button
              key={preset}
              type="button"
              className="h-7 rounded-md border px-2 text-[10px] font-medium hover:bg-muted"
              onClick={() => setLabel(preset)}
            >
              {preset}
            </button>
          ))}
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
