"use client";

import { useMemo } from "react";
import { Check, X } from "lucide-react";

import { AppColorPicker } from "@/components/canvas/AppColorPicker";
import {
  arrangeColorPalette,
  colorSwatchHex,
  colorSwatchMatches,
  colorsUsedOnBoard,
  GENERAL_COLOR_PALETTE,
  hexToRgb,
  isMetallicColor,
} from "@/lib/canvas/custom-colors";
import {
  surfaceEffectPresetPatch,
  surfaceEffectStyle,
} from "@/lib/canvas/surface-effects";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/store/canvas-store";
import { useUIStore } from "@/store/ui-store";

const HUE_SORTED_GENERAL_COLORS = arrangeColorPalette(GENERAL_COLOR_PALETTE);

interface ColorSwatchPickerProps {
  value?: string;
  onChange: (color: string) => void;
  /** Clears the color using caller-specific semantics. Defaults to onChange(""). */
  onClear?: () => void;
  /** Called for a color chosen through the vivid or exact custom-color panel. */
  onCustomColor?: (color: string) => void;
  /** Additional colors relevant to this control. */
  extra?: string[];
  size?: "sm" | "md";
  /** Prevents implying that Clear is selected when a multi-selection has mixed colors. */
  mixed?: boolean;
  /** Apply before pointer focus can clear an active rich-text selection. */
  selectionSafe?: boolean;
}

function DirectColorOption({
  color,
  value,
  mixed,
  compact,
  selectionSafe,
  onSelect,
}: {
  color: string;
  value?: string;
  mixed: boolean;
  compact: boolean;
  selectionSafe: boolean;
  onSelect: () => void;
}) {
  const selected = colorSwatchMatches(value, color, mixed);
  const rgb = hexToRgb(color);
  const darkForeground = !!rgb
    && (rgb.r * 0.299 + rgb.g * 0.587 + rgb.b * 0.114) > 175;
  const metallicStyle = isMetallicColor(color)
    ? surfaceEffectStyle({
        ...surfaceEffectPresetPatch("metallic"),
        surfaceEffectDepth: 2,
      })
    : {};
  return (
    <button
      type="button"
      aria-label={selected ? `Selected color ${color}` : `Select color ${color}`}
      aria-pressed={selected}
      onPointerDown={(event) => {
        if (!selectionSafe || !event.isPrimary || event.button !== 0) return;
        event.preventDefault();
        onSelect();
      }}
      onClick={(event) => {
        if (!selectionSafe || event.detail === 0) onSelect();
      }}
      className={cn(
        "group relative rounded-md border transition-transform hover:z-20 hover:scale-110",
        compact ? "h-5 w-5" : "h-6 w-6",
        selected
          ? "z-10 border-white/90 ring-[3px] ring-primary ring-offset-1 ring-offset-background shadow-lg"
          : "border-border/50"
      )}
      style={{ backgroundColor: color, ...metallicStyle }}
    >
      {selected && (
        <Check
          aria-hidden="true"
          className={cn(
            "absolute inset-0 m-auto h-3 w-3",
            darkForeground ? "text-slate-900" : "text-white"
          )}
          strokeWidth={3}
        />
      )}
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute bottom-full left-1/2 z-30 mb-1 -translate-x-1/2",
          "whitespace-nowrap rounded border border-border bg-popover px-1.5 py-0.5",
          "font-mono text-[9px] uppercase text-popover-foreground shadow-md",
          "opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        )}
      >
        {color}
      </span>
    </button>
  );
}

function PaletteSection({
  label,
  hint,
  colors,
  value,
  mixed,
  compact,
  selectionSafe,
  onChange,
}: {
  label: string;
  hint: string;
  colors: string[];
  value?: string;
  mixed: boolean;
  compact: boolean;
  selectionSafe: boolean;
  onChange: (color: string) => void;
}) {
  if (!colors.length) return null;
  return (
    <section className="space-y-1.5" aria-label={label}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="text-[8px] text-muted-foreground">{hint}</p>
      </div>
      <div className="grid grid-cols-8 gap-2">
        {colors.map((color) => (
          <DirectColorOption
            key={color}
            color={color}
            value={value}
            mixed={mixed}
            compact={compact}
            selectionSafe={selectionSafe}
            onSelect={() => onChange(color)}
          />
        ))}
      </div>
    </section>
  );
}

export function ColorSwatchPicker({
  value,
  onChange,
  onClear,
  onCustomColor,
  extra = [],
  size = "md",
  mixed = false,
  selectionSafe = false,
}: ColorSwatchPickerProps) {
  const savedColors = useUIStore((state) => state.appSettings.customColors);
  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);
  const normalizedValue = colorSwatchHex(value);
  const hueSortedSavedColors = useMemo(
    () => arrangeColorPalette(savedColors),
    [savedColors]
  );
  const usedBoardColors = colorsUsedOnBoard(nodes, edges);
  const hueSortedUsedColors = useMemo(() => {
    const saved = new Set(hueSortedSavedColors);
    return arrangeColorPalette([
      ...usedBoardColors,
      ...extra,
      ...(normalizedValue ? [normalizedValue] : []),
    ]).filter((color) => !saved.has(color));
  }, [extra, hueSortedSavedColors, normalizedValue, usedBoardColors]);
  const compact = size === "sm";
  const isCleared = !mixed && (!value || value.trim().toLowerCase() === "transparent");

  const applyCustomColor = (color: string) => {
    onCustomColor?.(color);
    onChange(color);
  };
  const clearColor = () => (onClear ?? (() => onChange("")))();

  return (
    <div data-app-color-picker="true" className="space-y-2" aria-label="Colors">
      <PaletteSection
        label="General colors"
        hint="Distinct + metallic"
        colors={HUE_SORTED_GENERAL_COLORS}
        value={value}
        mixed={mixed}
        compact={compact}
        selectionSafe={selectionSafe}
        onChange={onChange}
      />

      <PaletteSection
        label="Saved palette"
        hint="Hue order"
        colors={hueSortedSavedColors}
        value={value}
        mixed={mixed}
        compact={compact}
        selectionSafe={selectionSafe}
        onChange={onChange}
      />

      <PaletteSection
        label="Used colors"
        hint="This board"
        colors={hueSortedUsedColors}
        value={value}
        mixed={mixed}
        compact={compact}
        selectionSafe={selectionSafe}
        onChange={onChange}
      />

      <div className="grid grid-cols-2 gap-1">
        <button
          type="button"
          title="Clear color"
          aria-label="Clear color"
          aria-pressed={isCleared}
          onPointerDown={(event) => {
            if (!selectionSafe || !event.isPrimary || event.button !== 0) return;
            event.preventDefault();
            clearColor();
          }}
          onClick={(event) => {
            if (!selectionSafe || event.detail === 0) clearColor();
          }}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-md border px-2 text-[9px] font-medium",
            compact ? "h-6" : "h-7",
            isCleared
              ? "border-primary bg-primary/10 text-primary"
              : "border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <X className="h-3 w-3" />
          Clear
        </button>

        <AppColorPicker
          value={normalizedValue ?? value}
          extraColors={hueSortedUsedColors}
          onChange={applyCustomColor}
          preserveCurrentFocus={selectionSafe}
        >
          <button
            type="button"
            title="Create or save another color"
            aria-label="Create or save another color"
            onPointerDown={(event) => {
              if (selectionSafe) event.preventDefault();
            }}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-md border border-border/60 px-2",
              "text-[9px] font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-muted",
              compact ? "h-6" : "h-7"
            )}
          >
            <span
              className="flex h-3.5 w-3.5 items-center justify-center rounded-sm bg-gradient-to-br from-red-500 via-green-500 to-blue-600 text-[9px] font-bold text-white"
              aria-hidden="true"
            >
              +
            </span>
            More colors
          </button>
        </AppColorPicker>
      </div>
    </div>
  );
}
