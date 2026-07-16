"use client";

import { Bold, Italic, Link2, Type, Unlink2 } from "lucide-react";
import { ColorSwatchPicker } from "@/components/canvas/ColorSwatchPicker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import {
  applyConnectorLabelStyleUpdate,
  DEFAULT_CONNECTOR_LABEL_COLOR,
  resolveConnectorColor,
  resolveConnectorLabelPresentation,
  type ConnectorLabelStyleUpdate,
} from "@/lib/canvas/connector-label-style";
import { findConnectorLabelOwnerEdge } from "@/lib/canvas/connector-junction";
import { FONT_OPTIONS } from "@/lib/fonts";
import type { VidyaEdgeData } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/store/canvas-store";

const COMMON_LABEL_FONT_SIZES = [8, 9, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48];

export function ConnectorLabelStylePicker({ edgeId }: { edgeId: string }) {
  const edges = useCanvasStore((state) => state.edges);
  const connector = edges.find((edge) => edge.id === edgeId);
  const owner = findConnectorLabelOwnerEdge(edges, edgeId) ?? connector;
  const connectorData = (connector?.data ?? {}) as VidyaEdgeData;
  const ownerData = (owner?.data ?? {}) as VidyaEdgeData;
  const presentation = resolveConnectorLabelPresentation(ownerData);
  const connectorColor = resolveConnectorColor(connectorData);
  const labelColor = presentation.color ?? DEFAULT_CONNECTOR_LABEL_COLOR;
  const fontSizes = [...new Set([...COMMON_LABEL_FONT_SIZES, presentation.fontSize])].sort((a, b) => a - b);

  const update = (change: ConnectorLabelStyleUpdate) => {
    const state = useCanvasStore.getState();
    const nextEdges = applyConnectorLabelStyleUpdate(state.edges, edgeId, change);
    if (nextEdges === state.edges) return;
    state.pushHistory();
    useCanvasStore.setState({ edges: nextEdges, saveStatus: "unsaved" });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Label color and font"
          aria-label="Change connection label color and font"
          className="relative flex h-7 w-7 items-center justify-center rounded-md border text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Type className="h-3.5 w-3.5" />
          <span
            aria-hidden
            className="absolute inset-x-1 bottom-0.5 h-0.5 rounded-full"
            style={{ backgroundColor: labelColor }}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        data-export-ignore
        align="start"
        className="nodrag nopan w-72 border-border bg-background p-3 text-foreground"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="space-y-3">
          <div>
            <p className="mb-1.5 text-xs font-semibold">Label color</p>
            <ColorSwatchPicker
              value={labelColor}
              onChange={(color) => update({ labelColor: color })}
              size="sm"
            />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border p-2">
            <div className="flex min-w-0 items-center gap-2">
              {presentation.synced ? <Link2 className="h-3.5 w-3.5 text-primary" /> : <Unlink2 className="h-3.5 w-3.5 text-muted-foreground" />}
              <div>
                <p className="text-[11px] font-medium">Sync label + connector</p>
                <p className="text-[9px] text-muted-foreground">Uses the label color for both</p>
              </div>
            </div>
            <Switch
              aria-label="Sync label and connector color"
              checked={presentation.synced}
              onCheckedChange={(checked) => update({ labelColorSynced: checked })}
            />
          </div>
          {!presentation.synced && (
            <div>
              <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Connector color</p>
              <ColorSwatchPicker
                value={connectorColor}
                onChange={(color) => update({ connectorColor: color })}
                size="sm"
              />
            </div>
          )}
          <div>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Font</p>
            <select
              aria-label="Connection label font"
              value={presentation.fontFamily ?? ""}
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-primary"
              onChange={(event) => update({ labelFontFamily: event.target.value })}
            >
              <option value="">Default font</option>
              {FONT_OPTIONS.map((font) => (
                <option key={font.value} value={font.value}>{font.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <label htmlFor={`connector-label-size-${edgeId}`} className="mr-auto text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Size</label>
            <select
              id={`connector-label-size-${edgeId}`}
              aria-label="Connection label font size"
              value={presentation.fontSize}
              className="h-7 w-14 rounded-md border border-input bg-background px-1.5 text-center text-xs"
              onChange={(event) => update({ labelFontSize: Number(event.target.value) })}
            >
              {fontSizes.map((fontSize) => <option key={fontSize} value={fontSize}>{fontSize}</option>)}
            </select>
            <button
              type="button"
              aria-label="Bold connection label"
              aria-pressed={presentation.fontWeight === "bold"}
              className={cn("flex h-7 w-7 items-center justify-center rounded-md border hover:bg-muted", presentation.fontWeight === "bold" && "border-primary bg-primary/10 text-primary")}
              onClick={() => update({ labelFontWeight: presentation.fontWeight === "bold" ? "normal" : "bold" })}
            >
              <Bold className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label="Italic connection label"
              aria-pressed={presentation.fontStyle === "italic"}
              className={cn("flex h-7 w-7 items-center justify-center rounded-md border hover:bg-muted", presentation.fontStyle === "italic" && "border-primary bg-primary/10 text-primary")}
              onClick={() => update({ labelFontStyle: presentation.fontStyle === "italic" ? "normal" : "italic" })}
            >
              <Italic className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
