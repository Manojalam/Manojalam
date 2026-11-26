"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Inspector-only disclosure; never changes the template's rendered row visibility. */
export function TemplateRowPanel({ rowKey, focusRow, label, children }: { rowKey: string; focusRow: string | null; label: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (!focusRow || !ref.current) return;
    ref.current.open = focusRow === rowKey;
    if (focusRow !== rowKey) return;
    const frame = requestAnimationFrame(() => {
      const field = ref.current?.querySelector<HTMLElement>('[data-template-first-field], [contenteditable="true"], textarea, input:not([type="checkbox"]):not([type="number"])');
      field?.focus({ preventScroll: true });
      field?.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusRow, rowKey]);
  return <details ref={ref} className="rounded-md border p-3" aria-label={label}>
    <summary className="cursor-pointer text-sm font-medium">{label}</summary>
    <div className="mt-3 space-y-3">{children}</div>
  </details>;
}
