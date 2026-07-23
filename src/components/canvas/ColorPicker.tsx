"use client";

import { X } from "lucide-react";

import { AppColorPicker } from "@/components/canvas/AppColorPicker";
import { cn } from "@/lib/utils";

interface ColorPickerProps {
  value?: string;
  onChange: (color: string) => void;
  onClear?: () => void;
  label?: string;
  className?: string;
}

/** Labeled form-field variant of the app-wide color chooser. */
export function ColorPicker({ value, onChange, onClear, label, className }: ColorPickerProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
      )}
      <div className="flex items-center gap-2">
        <AppColorPicker value={value} onChange={onChange}>
          <button
            type="button"
            className="h-7 w-7 flex-none rounded-lg border-2 border-border bg-background p-0.5 shadow-sm transition-transform hover:scale-110"
            title="Choose color"
            aria-label={label ? `Choose ${label.toLowerCase()}` : "Choose color"}
          >
            <span
              className="block h-full w-full rounded-md"
              style={{ backgroundColor: value ?? "#6366f1" }}
            />
          </button>
        </AppColorPicker>
        <span className="font-mono text-xs text-muted-foreground">{value ?? "—"}</span>
        <button
          type="button"
          className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
          title="Clear color"
          onClick={() => (onClear ?? (() => onChange("")))()}
        >
          <X className="h-3 w-3" /> Clear color
        </button>
      </div>
    </div>
  );
}
