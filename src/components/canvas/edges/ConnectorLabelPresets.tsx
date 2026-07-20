"use client";

import { useState } from "react";
import { Link2, Palette, Plus, Tags, Unlink2, X } from "lucide-react";
import { ColorSwatchPicker } from "@/components/canvas/ColorSwatchPicker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  MAX_CONNECTOR_LABEL_PRESETS,
  normalizeConnectorLabelPresets,
} from "@/lib/canvas/connector-label-presets";
import type { ConnectorLabelPreset } from "@/lib/types";
import { useCanvasStore } from "@/store/canvas-store";

interface ConnectorLabelPresetsProps {
  currentLabel?: string;
  onSelect: (preset: ConnectorLabelPreset) => void;
  variant?: "toolbar" | "grid";
  maxVisible?: number;
}

function PresetColorControl({
  preset,
  onChange,
}: {
  preset: ConnectorLabelPreset;
  onChange: (preset: ConnectorLabelPreset) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={preset.color ? `Default color ${preset.color}` : "Set a default label color"}
          aria-label={`Set default color for ${preset.label}`}
          className="relative flex h-7 w-7 items-center justify-center rounded-md border text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Palette className="h-3.5 w-3.5" />
          <span
            aria-hidden
            className={cn(
              "absolute inset-x-1 bottom-0.5 h-0.5 rounded-full",
              !preset.color && "bg-muted-foreground/30"
            )}
            style={preset.color ? { backgroundColor: preset.color } : undefined}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        data-export-ignore
        side="right"
        align="start"
        className="nodrag nopan w-60 border-border bg-background p-3 text-foreground"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <p className="mb-1.5 text-xs font-semibold">Default color for {preset.label}</p>
        <ColorSwatchPicker
          value={preset.color}
          onChange={(color) => onChange({ ...preset, color })}
          onClear={() => onChange({ label: preset.label })}
          size="sm"
        />
      </PopoverContent>
    </Popover>
  );
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

  const commit = (next: ConnectorLabelPreset[]) => {
    const normalized = normalizeConnectorLabelPresets(next, []);
    if (JSON.stringify(normalized) === JSON.stringify(presets)) return;
    pushHistory();
    setSettings({ connectorLabelPresets: normalized });
  };

  const addDraft = () => {
    const next = draft.trim();
    if (!next) return;
    commit([...presets, { label: next }]);
    setDraft("");
  };

  return (
    <>
      {visiblePresets.map((preset) => (
        <button
          key={preset.label}
          type="button"
          title={preset.color
            ? `Set label to ${preset.label} and apply its default color${preset.syncConnectorColor ? " to the connector too" : ""}`
            : `Set label to ${preset.label}`}
          className={cn(
            "relative rounded-md border font-medium hover:bg-muted",
            currentLabel.trim() === preset.label && "border-primary bg-primary/5",
            variant === "toolbar" ? "h-7 px-2 text-[10px]" : "px-1 py-1 text-[9px]"
          )}
          onClick={() => onSelect(preset)}
        >
          {preset.label}
          {preset.color && (
            <span
              aria-hidden
              className="absolute inset-x-1 bottom-0.5 h-0.5 rounded-full"
              style={{ backgroundColor: preset.color }}
            />
          )}
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
          className="nodrag nopan w-80 border-border bg-background p-3 text-foreground"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold">Label shortcuts</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">Saved with this board. Set a reusable color and optionally sync the connector.</p>
            </div>

            {!!presets.length && (
              <div className="space-y-1.5">
                {presets.map((preset) => (
                  <div key={preset.label} className="flex items-center gap-1 rounded-md border bg-muted/40 p-1 text-[10px]">
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate rounded px-1.5 py-1 text-left font-medium hover:bg-muted"
                      onClick={() => onSelect(preset)}
                    >
                      {preset.label}
                    </button>
                    <PresetColorControl
                      preset={preset}
                      onChange={(nextPreset) => commit(presets.map((candidate) => (
                        candidate.label === preset.label ? nextPreset : candidate
                      )))}
                    />
                    <span
                      title={preset.color ? "Sync this default color to the connector path" : "Choose a default color before enabling sync"}
                      className="flex items-center gap-1"
                    >
                      {preset.syncConnectorColor
                        ? <Link2 className="h-3.5 w-3.5 text-primary" />
                        : <Unlink2 className="h-3.5 w-3.5 text-muted-foreground" />}
                      <Switch
                        checked={preset.syncConnectorColor === true}
                        disabled={!preset.color}
                        aria-label={`Sync ${preset.label} color to connector`}
                        onCheckedChange={(checked) => commit(presets.map((candidate) => (
                          candidate.label === preset.label
                            ? { ...candidate, syncConnectorColor: checked }
                            : candidate
                        )))}
                      />
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${preset.label} shortcut`}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => commit(presets.filter((candidate) => candidate.label !== preset.label))}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {currentLabel.trim() && !presets.some((preset) => preset.label === currentLabel.trim()) && presets.length < MAX_CONNECTOR_LABEL_PRESETS && (
              <button
                type="button"
                className="w-full rounded-md border px-2 py-1.5 text-left text-[10px] hover:bg-muted"
                onClick={() => commit([...presets, { label: currentLabel }])}
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
