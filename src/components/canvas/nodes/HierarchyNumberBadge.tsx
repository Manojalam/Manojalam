import { cn } from "@/lib/utils";

export function HierarchyNumberBadge({
  number,
  className,
}: {
  number?: string;
  className?: string;
}) {
  if (!number) return null;

  return (
    <span
      data-hierarchy-number-badge="true"
      aria-label={`Hierarchy number ${number}`}
      className={cn(
        "pointer-events-none absolute left-1.5 top-1.5 z-[25] max-w-[calc(100%-0.75rem)] select-none truncate rounded-md border border-slate-500/25 bg-white/75 px-1 py-0.5 font-sans text-[9px] font-semibold leading-none text-slate-700 shadow-sm backdrop-blur-[1px] dark:border-slate-300/20 dark:bg-slate-950/65 dark:text-slate-200",
        className
      )}
      style={{ fontVariantNumeric: "tabular-nums" }}
    >
      {number}
    </span>
  );
}
