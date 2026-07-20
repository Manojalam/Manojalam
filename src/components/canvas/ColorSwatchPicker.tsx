"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";

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
  /** Called only for a color chosen through the native custom picker. */
  onCustomColor?: (color: string) => void;
  /** Extra colors to show (e.g. recently used) */
  extra?: string[];
  size?: "sm" | "md";
}

export function ColorSwatchPicker({
  value,
  onChange,
  onCustomColor,
  extra = [],
  size = "md",
}: ColorSwatchPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const swatchSize = size === "sm" ? "h-5 w-5" : "h-6 w-6";
  const ringOffset = size === "sm" ? "ring-offset-[1px]" : "ring-offset-2";

  const allColors = [...new Set([...PRESET_COLORS, ...extra])];

  const handleSwatch = (hex: string) => {
    onChange(hex);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
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

      {/* Custom color + button */}
      <button
        type="button"
        title="Custom color…"
        onClick={() => {
          const input = inputRef.current;
          if (!input) return;
          try {
            if (typeof input.showPicker === "function") input.showPicker();
            else input.click();
          } catch {
            try { input.click(); } catch {}
          }
        }}
        className={cn(
          "flex-none rounded-full border border-border/40 bg-gradient-to-br from-red-400 via-green-400 to-blue-400",
          "flex items-center justify-center text-white text-[10px] font-bold hover:scale-110 transition-transform",
          swatchSize
        )}
      >+</button>

      {/* Hidden native color picker */}
      <input
        ref={inputRef}
        type="color"
        aria-label="Choose custom color"
        name="custom-swatch-color"
        value={value ?? "#6366f1"}
        onChange={(event) => {
          onCustomColor?.(event.target.value);
          onChange(event.target.value);
        }}
        className="sr-only"
      />
    </div>
  );
}
