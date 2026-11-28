"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useUIStore } from "@/store/ui-store";

/** Inspector-only disclosure; never changes the template's rendered row visibility. */
export function TemplateRowPanel({ groupName, rowKey, focusRow, revealField, label, children }: { groupName: string; rowKey: string; focusRow: string | null; revealField?: string; label: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);
  const tab = useUIStore(state => state.propertiesTab);
  useEffect(() => {
    if (revealField && tab === "template") setOpen(true);
  }, [revealField, tab]);
  useEffect(() => {
    if (focusRow) setOpen(focusRow === rowKey);
  }, [focusRow, rowKey]);
  useEffect(() => {
    if (!open || !revealField || !ref.current || tab !== "template") return;
    const frame = requestAnimationFrame(() => {
      const field = Array.from(ref.current?.querySelectorAll<HTMLElement>("[data-template-input-field]") ?? []).find(item => item.dataset.templateInputField === revealField);
      (field ?? ref.current)?.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, revealField, tab]);
  useEffect(() => {
    if (!open || !focusRow || !ref.current || focusRow !== rowKey) return;
    const frame = requestAnimationFrame(() => {
      const field = ref.current?.querySelector<HTMLElement>('[data-template-first-field], [contenteditable="true"], textarea, input:not([type="checkbox"]):not([type="number"])');
      field?.focus({ preventScroll: true });
      field?.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, focusRow, rowKey]);
  return <details ref={ref} name={groupName} open={open} onToggle={event => setOpen(event.currentTarget.open)} className="rounded-md border p-3" aria-label={label}>
    <summary className="cursor-pointer text-sm font-medium">{label}</summary>
    {open && <div className="mt-3 space-y-3">{children}</div>}
  </details>;
}
