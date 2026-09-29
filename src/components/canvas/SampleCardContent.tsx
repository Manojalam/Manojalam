"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { SampleCardEntry, SampleCardTemplate, SampleLabel } from "@/lib/types";
import { normalizeSampleTemplates, sampleEntryHtml, sampleFields } from "@/lib/canvas/sample-templates";
import { useCanvasStore } from "@/store/canvas-store";
import { safeCardLink } from "@/lib/canvas/card-templates";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SutraLookup } from "./SutraLookup";

function SampleInput({ nodeId, entryId, fieldId, label, value, locked }: { nodeId: string; entryId: string; fieldId: string; label: SampleLabel; value: { text: string; href?: string }; locked: boolean }) {
  const input = useRef<HTMLTextAreaElement>(null);
  const dirty = useRef(false);
  const [lookup, setLookup] = useState(false);
  useLayoutEffect(() => {
    if (input.current) { input.current.style.height = "0px"; input.current.style.height = `${input.current.scrollHeight}px`; }
  }, [value.text, label.fontSize, label.lineHeight]);
  const change = (next: { text: string; href?: string }) => {
    const state = useCanvasStore.getState();
    if (!dirty.current) { state.pushHistory(); dirty.current = true; }
    const entries = state.nodes.find(node => node.id === nodeId)?.data.sampleEntries as SampleCardEntry[] ?? [];
    state.updateSampleEntries(nodeId, entries.map(entry => entry.id === entryId ? { ...entry, values: { ...entry.values, [fieldId]: next } } : entry));
  };
  const id = `${nodeId}-${entryId}-${fieldId}`;
  return <span className="nodrag nopan block w-full text-left" onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}>
    <label htmlFor={id} data-export-ignore className="sr-only">{label.name}</label>
    <textarea ref={input} id={id} data-sample-input data-sample-href={safeCardLink(value.href)} aria-label={label.name} rows={1} readOnly={locked} placeholder={label.name} value={value.text}
      className="block w-full min-w-0 resize-none overflow-hidden border-0 bg-transparent p-0 outline-none placeholder:opacity-40" style={{ font: "inherit", color: "inherit", lineHeight: "inherit", textDecoration: "inherit" }}
      onChange={event => change({ ...value, text: event.target.value })} onBlur={() => { dirty.current = false; }}
      onKeyDown={event => {
        event.stopPropagation();
        if (event.key === "Tab") {
          const fields = Array.from(event.currentTarget.closest("[data-sample-card]")?.querySelectorAll<HTMLTextAreaElement>("textarea[data-sample-input]") ?? []);
          const next = fields[fields.indexOf(event.currentTarget) + (event.shiftKey ? -1 : 1)];
          if (next) { event.preventDefault(); next.focus(); }
        }
      }} />
    {label.kind === "sutra" && !locked && <button type="button" data-export-ignore className="block text-[10px] leading-4 underline" onClick={() => setLookup(true)}>Find sūtra</button>}
    {safeCardLink(value.href) && <a data-export-ignore className="block text-[10px] leading-4 underline" href={safeCardLink(value.href)} target="_blank" rel="noopener noreferrer">Open source</a>}
    {lookup && <Dialog open onOpenChange={setLookup}><DialogContent onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}><DialogHeader><DialogTitle>Find sūtra · {label.name}</DialogTitle><DialogDescription>Choose a result to insert its number, text and link into this field.</DialogDescription></DialogHeader><SutraLookup label={label.name} onChoose={next => { change(next); setLookup(false); }} /></DialogContent></Dialog>}
  </span>;
}

function EntryContent({ nodeId, template, entry, index, locked }: { nodeId: string; template: SampleCardTemplate; entry: SampleCardEntry; index: number; locked: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const [slots, setSlots] = useState<HTMLElement[]>([]);
  const html = sampleEntryHtml(template, entry, index, true);
  useLayoutEffect(() => {
    if (!root.current) return;
    root.current.innerHTML = html;
    setSlots(Array.from(root.current.querySelectorAll<HTMLElement>("[data-sample-slot]")));
  }, [html]);
  const fields = sampleFields(template.richText);
  return <>
    <div ref={root} className="sample-card-entry whitespace-pre-wrap [&_p]:m-0" />
    {slots.map(slot => {
      const field = fields.find(item => `${entry.id}:${item.id}` === slot.dataset.sampleSlot);
      const label = template.labels.find(item => item.id === field?.labelId);
      return field && label ? createPortal(<SampleInput nodeId={nodeId} entryId={entry.id} fieldId={field.id} label={label} value={entry.values[field.id] ?? { text: "" }} locked={locked} />, slot, field.id) : null;
    })}
  </>;
}

export function SampleCardContent({ nodeId }: { nodeId: string }) {
  const node = useCanvasStore(state => state.nodes.find(item => item.id === nodeId));
  const saved = useCanvasStore(state => state.settings.sampleTemplates?.find(item => item.id === node?.data.sampleTemplateId));
  const template = saved ?? normalizeSampleTemplates([node?.data.sampleTemplateSnapshot])[0];
  const entries = (node?.data.sampleEntries ?? []) as SampleCardEntry[];
  const update = useCanvasStore(state => state.updateSampleEntries);
  const fit = useCanvasStore(state => state.fitNodeToContent);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!root.current) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const element = root.current;
        if (element) fit(nodeId, { width: element.scrollWidth, height: element.scrollHeight }, "input");
      });
    });
    observer.observe(root.current);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [fit, nodeId]);
  if (!template || !node) return null;
  const locked = !!node.data.locked;
  return <div ref={root} data-sample-card data-fillable-card className="w-full text-left" style={{ fontSize: Number(template.style.fontSize) || 20, color: String(template.style.textColor || "#111827") } as CSSProperties}>
    {entries.map((entry, index) => <section key={entry.id} className="group/sample mb-4">
      <EntryContent nodeId={nodeId} template={template} entry={entry} index={index} locked={locked} />
      {!locked && entries.length > 1 && <div data-export-ignore className="nodrag nopan flex gap-2 text-[10px] opacity-0 focus-within:opacity-100 group-hover/sample:opacity-100" onPointerDown={event => event.stopPropagation()}>
        <button type="button" disabled={index === 0} onClick={() => { const next = [...entries]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; update(nodeId, next, true); }}>Move section up</button>
        <button type="button" onClick={() => update(nodeId, entries.filter(item => item.id !== entry.id), true)}>Remove section</button>
      </div>}
    </section>)}
    {!locked && <button type="button" data-export-ignore className="nodrag nopan rounded border bg-background px-2 py-1 text-xs text-foreground" onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()} onClick={() => update(nodeId, [...entries, { id: crypto.randomUUID(), values: {} }], true)}>Add another</button>}
  </div>;
}
