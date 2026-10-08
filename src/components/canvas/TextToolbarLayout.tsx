"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function TextToolGroup({ docked, label, children }: { docked: boolean; label: string; children: ReactNode }) {
  if (!docked) return <>{children}</>;
  return <section aria-label={label} className="w-full min-w-0 border-b border-border/60 pb-3 last:border-0">
    <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</h3>
    <div className="flex min-w-0 flex-wrap items-center gap-1">{children}</div>
  </section>;
}

/** Detailed editor options share the inspector's scroll area when docked. */
export function TextToolPanel({ host, open, onClose, title, description, children, onOpenAutoFocus }: {
  host: HTMLElement | null; open: boolean; onClose: () => void; title: string; description: string; children: ReactNode;
  onOpenAutoFocus?: (event: Event) => void;
}) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => { if (host && open) panel.current?.scrollIntoView({ block: "nearest" }); }, [host, open]);
  if (host) return open ? createPortal(<section ref={panel} data-universal-text-tools="editor-toolbar" data-text-option-panel aria-label={title}
    className="mt-3 w-full min-w-0 space-y-3 rounded border p-3"
    onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); onClose(); } }}>
    <div className="flex items-center justify-between gap-2"><h3 className="text-xs font-semibold">{title}</h3><button type="button" aria-label={`Close ${title}`} onClick={onClose} className="rounded px-2 py-1 hover:bg-muted">×</button></div>
    <p className="text-xs text-muted-foreground">{description}</p>{children}
  </section>, host) : null;
  return <Dialog open={open} onOpenChange={value => { if (!value) onClose(); }}><DialogContent className="max-h-[88vh] w-[min(92vw,28rem)] overflow-y-auto" onOpenAutoFocus={onOpenAutoFocus} onCloseAutoFocus={event => event.preventDefault()}>
    <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>{children}
  </DialogContent></Dialog>;
}
