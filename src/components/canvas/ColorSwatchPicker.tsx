"use client";

import { useId, useState } from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  colorInputValue,
  normalizeHexColor,
  rememberCustomColor,
  VIVID_CHART_COLORS,
} from "@/lib/canvas/custom-colors";
import { useCanvasStore } from "@/store/canvas-store";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const PRESET_COLORS = [
  "#ffffff", // White
  "#f1f5f9", // Light gray
  "#6b7280", // Gray
  "#111827", // Black
  "#ef4444", // Red
  "#f97316", // Orange
  "#eab308", // Yellow
  "#22c55e", // Green
  "#14b8a6", // Teal
  "#3b82f6", // Blue
  "#8b5cf6", // Purple
  "#ec4899", // Pink
  "#b45309", // Amber / Brown
];

interface ColorSwatchPickerProps {
  value?: string;
  onChange: (color: string) => void;
  /** Clears the color using caller-specific semantics. Defaults to onChange(""). */
  onClear?: () => void;
  /** Called for a color chosen through the vivid or exact custom-color panel. */
  onCustomColor?: (color: string) => void;
  /** Extra colors to show (e.g. recently used) */
  extra?: string[];
  size?: "sm" | "md";
}

export function ColorSwatchPicker({
  value,
  onChange,
  onClear,
  onCustomColor,
  extra = [],
  size = "md",
}: ColorSwatchPickerProps) {
  const [moreColorsOpen, setMoreColorsOpen] = useState(false);
  const [hexDraft, setHexDraft] = useState("");
  const exactColorInputId = useId();
  const sharedCustomColors = useCanvasStore((state) => state.settings.customColors ?? []);
  const legacyTextColors = useCanvasStore((state) => state.settings.customTextColors ?? []);
  const legacyHighlightColors = useCanvasStore((state) => state.settings.customHighlightColors ?? []);
  const setSettings = useCanvasStore((state) => state.setSettings);
  const swatchSize = size === "sm" ? "h-5 w-5" : "h-6 w-6";
  const ringOffset = size === "sm" ? "ring-offset-[1px]" : "ring-offset-2";

  const allColors = [...new Set([
    ...PRESET_COLORS,
    ...sharedCustomColors,
    ...legacyTextColors,
    ...legacyHighlightColors,
    ...extra,
  ])];

  const handleSwatch = (hex: string) => {
    onChange(hex);
  };
  const nativeValue = colorInputValue(value, "#6366f1");
  const isCleared = !value || value === "transparent";
  const exactColor = normalizeHexColor(hexDraft);

  const applyCustomColor = (color: string) => {
    const normalized = normalizeHexColor(color);
    if (!normalized) return;
    setSettings({ customColors: rememberCustomColor(sharedCustomColors, normalized) });
    onCustomColor?.(normalized);
    onChange(normalized);
    setMoreColorsOpen(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        title="Clear color"
        aria-label="Clear color"
        onClick={() => (onClear ?? (() => onChange("")))()}
        className={cn(
          "flex flex-none items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-transform hover:scale-110 hover:text-foreground",
          swatchSize,
          isCleared && `ring-2 ring-primary ${ringOffset}`
        )}
        style={{
          backgroundColor: "#ffffff",
          backgroundImage: "linear-gradient(45deg,#e2e8f0 25%,transparent 25%),linear-gradient(-45deg,#e2e8f0 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e2e8f0 75%),linear-gradient(-45deg,transparent 75%,#e2e8f0 75%)",
          backgroundPosition: "0 0,0 4px,4px -4px,-4px 0",
          backgroundSize: "8px 8px",
        }}
      >
        <X className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
      </button>

      {allColors.map((hex) => (
        <button
          type="button"
          key={hex}
          title={hex}
          onClick={() => handleSwatch(hex)}
          className={cn(
            "flex-none rounded-full border transition-transform hover:scale-110",
            swatchSize,
            value === hex
              ? `ring-2 ring-primary ${ringOffset} border-foreground/30 scale-110`
              : "border-border/40"
          )}
          style={{ backgroundColor: hex }}
        />
      ))}

      <Popover
        open={moreColorsOpen}
        onOpenChange={(open) => {
          setMoreColorsOpen(open);
          if (open) setHexDraft(nativeValue);
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            title="More vivid and exact colors"
            aria-label="More vivid and exact colors"
            className={cn(
              "flex flex-none items-center justify-center rounded-full border border-border/40",
              "bg-gradient-to-br from-red-500 via-green-500 to-blue-600 text-[10px] font-bold text-white",
              "transition-transform hover:scale-110",
              swatchSize
            )}
          >
            +
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={6} className="w-64 space-y-3 p-3">
          <div>
            <p className="text-[11px] font-semibold text-foreground">Vivid chart colors</p>
            <p className="mt-0.5 text-[9px] leading-snug text-muted-foreground">
              Saturated colors designed for high-contrast diagrams.
            </p>
          </div>
          <div className="grid grid-cols-8 gap-1.5" role="list" aria-label="Vivid chart colors">
            {VIVID_CHART_COLORS.map(({ name, value: color }) => (
              <button
                key={color}
                type="button"
                title={`${name} · ${color}`}
                aria-label={`${name} ${color}`}
                onClick={() => applyCustomColor(color)}
                className={cn(
                  "relative h-5 w-5 rounded-full border border-white/25 shadow-sm transition-transform hover:scale-110",
                  value?.toLowerCase() === color && "ring-2 ring-primary ring-offset-1 ring-offset-background"
                )}
                style={{ backgroundColor: color }}
              >
                {value?.toLowerCase() === color && (
                  <Check className="absolute inset-0 m-auto h-3 w-3 text-white drop-shadow" />
                )}
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            <label htmlFor={exactColorInputId} className="text-[10px] font-medium text-foreground">
              Exact hex color
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="color"
                aria-label="Choose exact color visually"
                value={colorInputValue(exactColor, nativeValue)}
                onChange={(event) => setHexDraft(event.target.value)}
                className="h-8 w-9 cursor-pointer rounded-md border border-input bg-background p-0.5"
              />
              <input
                id={exactColorInputId}
                type="text"
                value={hexDraft}
                spellCheck={false}
                inputMode="text"
                placeholder="#F0443E"
                onChange={(event) => setHexDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && exactColor) applyCustomColor(exactColor);
                }}
                className={cn(
                  "h-8 min-w-0 flex-1 rounded-md border bg-background px-2 font-mono text-[11px] uppercase outline-none",
                  exactColor ? "border-input focus:border-primary" : "border-destructive/70"
                )}
              />
              <button
                type="button"
                disabled={!exactColor}
                title="Apply exact color"
                aria-label="Apply exact color"
                onClick={() => exactColor && applyCustomColor(exactColor)}
                className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Check className="h-4 w-4" />
              </button>
            </div>
            <p className="text-[9px] text-muted-foreground">
              Enter six hex digits, with or without #.
            </p>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
