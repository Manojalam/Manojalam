"use client";

import { Check, X } from "lucide-react";
import { AppColorPicker } from "@/components/canvas/AppColorPicker";
import {
  arrangeColorPalette,
  colorSwatchHex,
  colorSwatchMatches,
} from "@/lib/canvas/custom-colors";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/store/canvas-store";

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
  /** Prevents implying that Clear is selected when a multi-selection has mixed colors. */
  mixed?: boolean;
}

export function ColorSwatchPicker({
  value,
  onChange,
  onClear,
  onCustomColor,
  extra = [],
  size = "md",
  mixed = false,
}: ColorSwatchPickerProps) {
  const sharedCustomColors = useCanvasStore((state) => state.settings.customColors ?? []);
  const legacyTextColors = useCanvasStore((state) => state.settings.customTextColors ?? []);
  const legacyHighlightColors = useCanvasStore((state) => state.settings.customHighlightColors ?? []);
  const swatchSize = size === "sm" ? "h-5 w-5" : "h-6 w-6";
  const normalizedValue = colorSwatchHex(value);

  const colors = arrangeColorPalette([
    ...PRESET_COLORS,
    ...sharedCustomColors,
    ...legacyTextColors,
    ...legacyHighlightColors,
    ...extra,
    ...(normalizedValue ? [normalizedValue] : []),
  ]);

  const handleSwatch = (hex: string) => {
    onChange(hex);
  };
  const isCleared = !mixed && (!value || value.trim().toLowerCase() === "transparent");

  const applyCustomColor = (color: string) => {
    onCustomColor?.(color);
    onChange(color);
  };

  return (
    <div className="grid grid-cols-8 gap-2" aria-label="Colors">
      <button
        type="button"
        title="Clear color"
        aria-label="Clear color"
        aria-pressed={isCleared}
        onClick={() => (onClear ?? (() => onChange("")))()}
        className={cn(
          "relative flex items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-transform hover:z-10 hover:scale-110 hover:text-foreground",
          swatchSize,
          isCleared && [
            "z-10 scale-110 border-white/90 ring-[3px] ring-primary ring-offset-background shadow-lg",
            size === "sm" ? "ring-offset-[1px]" : "ring-offset-2",
          ]
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

      {colors.map((hex) => {
        const selected = colorSwatchMatches(value, hex, mixed);
        return (
          <button
            type="button"
            key={hex}
            title={selected ? `Selected color ${hex}` : hex}
            aria-label={selected ? `Selected color ${hex}` : `Select color ${hex}`}
            aria-pressed={selected}
            onClick={() => handleSwatch(hex)}
            className={cn(
              "relative rounded-full border transition-transform hover:z-10 hover:scale-110",
              swatchSize,
              selected
                ? [
                    "z-10 scale-110 border-white/90 ring-[3px] ring-primary ring-offset-background shadow-lg",
                    size === "sm" ? "ring-offset-[1px]" : "ring-offset-2",
                  ]
                : "border-border/40"
            )}
            style={{ backgroundColor: hex }}
          >
            {selected && (
              <Check
                aria-hidden="true"
                className={cn(
                  "absolute inset-0 m-auto text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]",
                  size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"
                )}
                strokeWidth={3}
              />
            )}
          </button>
        );
      })}

      <AppColorPicker
        value={normalizedValue ?? value}
        extraColors={[...legacyTextColors, ...legacyHighlightColors, ...extra]}
        onChange={applyCustomColor}
      >
        <button
          type="button"
          title="More colors"
          aria-label="More colors"
          className={cn(
            "flex items-center justify-center rounded-full border border-border/40",
            "bg-gradient-to-br from-red-500 via-green-500 to-blue-600 text-[10px] font-bold text-white",
            "transition-transform hover:scale-110",
            swatchSize
          )}
        >
          +
        </button>
      </AppColorPicker>
    </div>
  );
}
