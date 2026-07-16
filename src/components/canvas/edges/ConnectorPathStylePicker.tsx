"use client";

import type { ConnectorPathStyle, VidyaEdgeData } from "@/lib/types";
import {
  CONNECTOR_PATH_STYLES,
  resolveConnectorPathStyle,
} from "@/lib/canvas/connector-path-style";
import { findLogicalConnectorEdgeIds } from "@/lib/canvas/connector-junction";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/store/canvas-store";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function ConnectorPathStylePreview({ style }: { style: ConnectorPathStyle }) {
  if (style === "double") {
    return (
      <svg aria-hidden viewBox="0 0 28 12" className="h-3 w-7 overflow-visible">
        <path d="M 1 4 H 27 M 1 8 H 27" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }

  return (
    <svg aria-hidden viewBox="0 0 28 12" className="h-3 w-7 overflow-visible">
      <path
        d="M 1 6 H 27"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={style === "dashed" ? "7 4" : style === "dotted" ? "1 4" : undefined}
      />
    </svg>
  );
}

export function ConnectorPathStylePicker({ edgeId }: { edgeId: string }) {
  const edgeData = useCanvasStore((state) => (
    state.edges.find((edge) => edge.id === edgeId)?.data ?? {}
  )) as VidyaEdgeData;
  const currentStyle = resolveConnectorPathStyle(edgeData);

  const setStyle = (pathStyle: ConnectorPathStyle) => {
    if (pathStyle === currentStyle) return;
    const state = useCanvasStore.getState();
    const logicalEdgeIds = new Set(findLogicalConnectorEdgeIds(state.edges, edgeId));
    state.pushHistory();
    useCanvasStore.setState((current) => ({
      edges: current.edges.map((edge) => {
        if (!logicalEdgeIds.has(edge.id)) return edge;
        const data = { ...(edge.data ?? {}), pathStyle } as Record<string, unknown>;
        delete data.dashed;
        return { ...edge, data };
      }),
      saveStatus: "unsaved",
    }));
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={`Connection path: ${currentStyle}`}
          aria-label="Change connection path style"
          className="flex h-7 w-9 items-center justify-center rounded-md border text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ConnectorPathStylePreview style={currentStyle} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        data-export-ignore
        align="start"
        className="nodrag nopan w-48 border-border bg-background p-2 text-foreground"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <p className="px-1 pb-2 text-xs font-semibold">Connection path</p>
        <div className="grid grid-cols-2 gap-1">
          {CONNECTOR_PATH_STYLES.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={currentStyle === option.value}
              className={cn(
                "flex h-12 flex-col items-center justify-center gap-1 rounded-md border text-[10px] hover:bg-muted",
                currentStyle === option.value && "border-primary bg-primary/10 text-primary"
              )}
              onClick={() => setStyle(option.value)}
            >
              <ConnectorPathStylePreview style={option.value} />
              {option.label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
