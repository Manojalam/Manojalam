"use client";

import { X } from "lucide-react";

import { AppColorPicker } from "@/components/canvas/AppColorPicker";
import { cn } from "@/lib/utils";

type ClearableColorInputProps = {
  value: string;
  onColorChange: (color: string) => void;
  onClear: () => void;
  inputClassName?: string;
  compact?: boolean;
  id?: string;
  name?: string;
  title?: string;
  disabled?: boolean;
  "aria-label"?: string;
};

/** App color chooser with an always-available action for removing the override. */
export function ClearableColorInput({
  value,
  onColorChange,
  onClear,
  inputClassName,
  compact = false,
  id,
  name,
  title,
  disabled,
  "aria-label": ariaLabel,
}: ClearableColorInputProps) {
  return (
    <span className="relative block min-w-0">
      <AppColorPicker value={value} onChange={onColorChange}>
        <button
          id={id}
          name={name}
          type="button"
          title={title ?? ariaLabel ?? "Choose color"}
          aria-label={ariaLabel ?? "Choose color"}
          disabled={disabled}
          className={cn(
            "block cursor-pointer border border-border bg-background p-0.5 disabled:cursor-not-allowed disabled:opacity-50",
            inputClassName
          )}
        >
          <span
            className="block h-full min-h-3 w-full rounded-[inherit]"
            style={{ backgroundColor: value }}
          />
        </button>
      </AppColorPicker>
      <button
        type="button"
        title="Clear color"
        aria-label={`${ariaLabel ?? "Color"}: clear color`}
        disabled={disabled}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onClear();
        }}
        className={cn(
          "absolute flex items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground",
          compact ? "-right-1 -top-1 h-3.5 w-3.5" : "-right-1 -top-1 h-4.5 w-4.5"
        )}
      >
        <X className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} />
      </button>
    </span>
  );
}
