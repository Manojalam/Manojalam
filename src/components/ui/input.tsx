"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    // Parent validation must not replace a partially typed number or decimal.
    const [draft, setDraft] = React.useState<string | null>(null);
    const numeric = type === "number" && props.value !== undefined;
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
        {...(numeric ? {
          value: draft ?? props.value,
          onFocus: (event: React.FocusEvent<HTMLInputElement>) => {
            setDraft(event.currentTarget.value);
            props.onFocus?.(event);
          },
          onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
            setDraft(event.currentTarget.value);
            props.onChange?.(event);
          },
          onBlur: (event: React.FocusEvent<HTMLInputElement>) => {
            props.onBlur?.(event);
            setDraft(null);
          },
        } : {})}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
