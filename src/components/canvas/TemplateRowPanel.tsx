"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useUIStore } from "@/store/ui-store";

/** Inspector-only disclosure; never changes the template's rendered row visibility. */
export function TemplateRowPanel({ rowKey, focusRow, revealField, label, children }: { rowKey: string; focusRow: string | null; revealField?: string; label: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const tab = useUIStore(state => state.propertiesTab);
  useEffect(() => {
    if (!revealField || !ref.current || tab !== "template") return;
    ref.current.open = true;
    const frame = requestAnimationFrame(() => {
      const field = Array.from(ref.current?.querySelectorAll<HTMLElement>("[data-template-input-field]") ?? []).find(item => item.dataset.templateInputField === revealField);
      (field ?? ref.current)?.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [revealField, tab]);
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
