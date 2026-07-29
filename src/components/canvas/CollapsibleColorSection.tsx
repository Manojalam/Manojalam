"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

interface CollapsibleColorSectionProps {
  label: string;
  hint?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  preserveCurrentFocus?: boolean;
  className?: string;
  contentClassName?: string;
}

export function CollapsibleColorSection({
  label,
  hint,
  children,
  defaultOpen = true,
  preserveCurrentFocus = false,
  className,
  contentClassName,
}: CollapsibleColorSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();

  return (
    <section className={cn("space-y-1.5", className)} aria-label={label}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        aria-label={`${open ? "Collapse" : "Expand"} ${label}`}
        onPointerDown={(event) => {
          if (preserveCurrentFocus) event.preventDefault();
        }}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-sm text-left",
          "text-muted-foreground transition-colors hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        )}
      >
        <span className="text-[9px] font-semibold uppercase tracking-wider">
          {label}
        </span>
        <span className="flex min-w-0 items-center gap-1">
          {hint && <span className="truncate text-[8px]">{hint}</span>}
          {open
            ? <ChevronDown aria-hidden="true" className="h-3 w-3 flex-none" />
            : <ChevronRight aria-hidden="true" className="h-3 w-3 flex-none" />}
        </span>
      </button>
      {open && (
        <div id={contentId} className={contentClassName}>
          {children}
        </div>
      )}
    </section>
  );
}
