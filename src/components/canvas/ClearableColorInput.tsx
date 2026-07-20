"use client";

import type { InputHTMLAttributes } from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

type ClearableColorInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange"
> & {
  value: string;
  onColorChange: (color: string) => void;
  onClear: () => void;
  inputClassName?: string;
  compact?: boolean;
};

/** Native color input with an always-available action for removing the override. */
export function ClearableColorInput({
  value,
  onColorChange,
  onClear,
  inputClassName,
  compact = false,
  ...inputProps
}: ClearableColorInputProps) {
  const nativeValue = /^#[0-9a-f]{6}$/i.test(value) ? value : "#6366f1";

  return (
    <span className="relative block min-w-0">
      <input
        {...inputProps}
        type="color"
        value={nativeValue}
        onChange={(event) => onColorChange(event.target.value)}
        className={inputClassName}
      />
      <button
        type="button"
        title="Clear color"
        aria-label={`${inputProps["aria-label"] ?? "Color"}: clear color`}
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
