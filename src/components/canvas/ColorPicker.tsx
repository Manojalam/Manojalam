"use client";

import { useState, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Palette organised in columns: each row = one hue, each col = darker shade */
const PALETTE: string[][] = [
  // Whites & Grays & Blacks
  ["#ffffff", "#f1f5f9", "#cbd5e1", "#64748b", "#1e293b", "#020617"],
  // Reds
  ["#fee2e2", "#fca5a5", "#ef4444", "#dc2626", "#991b1b", "#450a0a"],
  // Oranges
  ["#ffedd5", "#fdba74", "#f97316", "#ea580c", "#9a3412", "#431407"],
  // Yellows
  ["#fefce8", "#fde047", "#eab308", "#ca8a04", "#854d0e", "#422006"],
  // Limes / Greens
  ["#f0fdf4", "#86efac", "#22c55e", "#16a34a", "#14532d", "#052e16"],
  // Teals
  ["#f0fdfa", "#5eead4", "#14b8a6", "#0d9488", "#134e4a", "#022c22"],
  // Blues
  ["#eff6ff", "#93c5fd", "#3b82f6", "#2563eb", "#1e3a8a", "#172554"],
  // Indigo / Purples
  ["#eef2ff", "#c4b5fd", "#8b5cf6", "#7c3aed", "#4c1d95", "#2e1065"],
  // Pinks
  ["#fdf2f8", "#f9a8d4", "#ec4899", "#db2777", "#831843", "#500724"],
];

interface ColorPickerProps {
  value?: string;
  onChange: (color: string) => void;
  onClear?: () => void;
  label?: string;
  className?: string;
}

export function ColorPicker({ value, onChange, onClear, label, className }: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleNative = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>}

      {/* Swatch toggle */}
      <div className="flex items-center gap-2">
        <button
          className="h-7 w-7 flex-none rounded-lg border-2 border-border shadow-sm transition-transform hover:scale-110"
          style={{ backgroundColor: value ?? "#6366f1" }}
          onClick={() => setOpen((o) => !o)}
          title="Open color picker"
        />
        <span className="text-xs text-muted-foreground font-mono">{value ?? "—"}</span>
        <button
          type="button"
          className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
          title="Clear color"
          onClick={() => (onClear ?? (() => onChange("")))()}
        >
          <X className="h-3 w-3" /> Clear color
        </button>
      </div>

      {open && (
        <div className="rounded-xl border border-border bg-background p-2 shadow-xl">
          {/* Grid */}
          <div className="flex gap-1">
            {PALETTE.map((col, ci) => (
              <div key={ci} className="flex flex-col gap-1">
                {col.map((hex) => (
                  <button
                    key={hex}
                    title={hex}
                    className={cn(
                      "h-4.5 w-4.5 rounded-sm border transition-transform hover:scale-125",
                      value === hex ? "border-foreground scale-110 shadow" : "border-transparent"
                    )}
                    style={{ backgroundColor: hex, width: 18, height: 18 }}
                    onClick={() => { onChange(hex); setOpen(false); }}
                  />
                ))}
              </div>
            ))}
          </div>

          <div className="mt-2 border-t border-border pt-2 flex items-center gap-2">
            <button
              className="flex-1 rounded-lg border border-border bg-muted px-3 py-1.5 text-xs hover:bg-accent"
              onClick={() => inputRef.current?.click()}
            >
              Custom color…
            </button>
            <input
              ref={inputRef}
              type="color"
              aria-label="Choose custom color"
              name="custom-color"
              value={typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : "#6366f1"}
              onChange={handleNative}
              onBlur={() => setOpen(false)}
              className="sr-only"
            />
            <div
              className="h-6 w-6 flex-none rounded-md border border-border"
              style={{ backgroundColor: value ?? "#6366f1" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
