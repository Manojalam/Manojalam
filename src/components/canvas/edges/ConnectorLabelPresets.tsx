"use client";

import { useState } from "react";
import { Plus, Tags, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  MAX_CONNECTOR_LABEL_PRESETS,
  normalizeConnectorLabelPresets,
} from "@/lib/canvas/connector-label-presets";
import { useCanvasStore } from "@/store/canvas-store";

interface ConnectorLabelPresetsProps {
  currentLabel?: string;
  onSelect: (label: string) => void;
  variant?: "toolbar" | "grid";
  maxVisible?: number;
}

export function ConnectorLabelPresets({
  currentLabel = "",
  onSelect,
  variant = "toolbar",
  maxVisible = variant === "toolbar" ? 3 : 8,
}: ConnectorLabelPresetsProps) {
  const [draft, setDraft] = useState("");
  const settings = useCanvasStore((state) => state.settings);
  const setSettings = useCanvasStore((state) => state.setSettings);
  const pushHistory = useCanvasStore((state) => state.pushHistory);
  const presets = normalizeConnectorLabelPresets(settings.connectorLabelPresets);
  const visiblePresets = presets.slice(0, maxVisible);

  const commit = (next: string[]) => {
    const normalized = normalizeConnectorLabelPresets(next, []);
    if (normalized.length === presets.length && normalized.every((label, index) => label === presets[index])) return;
    pushHistory();
    setSettings({ connectorLabelPresets: normalized });
  };

  const addDraft = () => {
    const next = draft.trim();
    if (!next) return;
    commit([...presets, next]);
    setDraft("");
  };

  return (
    <>
      {visiblePresets.map((preset) => (
        <button
          key={preset}
          type="button"
          title={`Set label to ${preset}`}
          className={cn(
            "rounded-md border font-medium hover:bg-muted",
            variant === "toolbar" ? "h-7 px-2 text-[10px]" : "px-1 py-1 text-[9px]"
          )}
          onClick={() => onSelect(preset)}
        >
          {preset}
        </button>
      ))}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            title="Edit label shortcuts"
            aria-label="Edit connector label shortcuts"
            className={cn(
              "flex items-center justify-center rounded-md border text-muted-foreground hover:bg-muted hover:text-foreground",
              variant === "toolbar" ? "h-7 w-7" : "min-h-7 px-1"
            )}
          >
            <Tags className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          data-export-ignore
          align="start"
          className="nodrag nopan w-64 border-border bg-background p-3 text-foreground"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold">Label shortcuts</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">Saved with this board. Labels can use any language.</p>
            </div>

            {!!presets.length && (
              <div className="flex flex-wrap gap-1.5">
                {presets.map((preset) => (
                  <span key={preset} className="flex items-center gap-1 rounded-md border bg-muted/40 pl-2 text-[10px]">
                    <button type="button" className="py-1" onClick={() => onSelect(preset)}>{preset}</button>
                    <button
                      type="button"
                      aria-label={`Remove ${preset} shortcut`}
                      className="flex h-6 w-6 items-center justify-center rounded-r-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => commit(presets.filter((candidate) => candidate !== preset))}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {currentLabel.trim() && !presets.includes(currentLabel.trim()) && presets.length < MAX_CONNECTOR_LABEL_PRESETS && (
              <button
                type="button"
                className="w-full rounded-md border px-2 py-1.5 text-left text-[10px] hover:bg-muted"
                onClick={() => commit([...presets, currentLabel])}
              >
                Save current label: <span className="font-semibold">{currentLabel.trim()}</span>
              </button>
            )}

            <div className="flex gap-1.5">
              <input
                aria-label="New connector label shortcut"
                value={draft}
                disabled={presets.length >= MAX_CONNECTOR_LABEL_PRESETS}
                placeholder={presets.length >= MAX_CONNECTOR_LABEL_PRESETS ? "Shortcut limit reached" : "New shortcut"}
                className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-primary"
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === "Enter") addDraft();
                }}
              />
              <button
                type="button"
                aria-label="Add label shortcut"
                disabled={!draft.trim() || presets.length >= MAX_CONNECTOR_LABEL_PRESETS}
                className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-40"
                onClick={addDraft}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}
