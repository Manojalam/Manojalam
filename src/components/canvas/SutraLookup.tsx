"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { searchSutras, sutraFieldValue, type SutraEntry } from "@/lib/sanskrit/sutra-search";

let catalog: Promise<SutraEntry[]> | undefined;
function loadCatalog() {
  if (!catalog) catalog = fetch("/sanskrit/sutras.json").then(async response => {
    if (!response.ok) throw new Error("Could not load the sūtra list");
    return (await response.json()).data as SutraEntry[];
  }).catch(error => { catalog = undefined; throw error; });
  return catalog;
}

export function SutraLookup({ label, onChoose }: { label: string; onChoose: (value: { text: string; href: string }) => void }) {
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState<SutraEntry[]>([]);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || !query.trim()) return;
    // Handle the search popup before a containing Radix dialog's document listener.
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing || event.target !== inputRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      setActiveIndex(-1);
    };
    window.addEventListener("keydown", dismiss, true);
    return () => window.removeEventListener("keydown", dismiss, true);
  }, [open, query]);
  useEffect(() => {
    let active = true;
    loadCatalog().then(data => { if (active) { setEntries(data); setError(false); } }, () => { if (active) setError(true); });
    return () => { active = false; };
  }, [retry]);
  const results = searchSutras(entries, query);
  const expanded = open && !!query.trim() && !!entries.length && !error;
  const active = expanded ? results[activeIndex] : undefined;
  const choose = (entry: SutraEntry) => {
    onChoose(sutraFieldValue(entry));
    setQuery("");
    setActiveIndex(-1);
    setOpen(false);
  };
  useEffect(() => {
    if (expanded) listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, expanded]);
  return <div className="space-y-1 rounded-md border p-2">
    <Input ref={inputRef} aria-label={`Find sūtra for ${label}`} placeholder="Find sūtra: 3.4.89, ३.४.८९, Sanskrit or Roman words" value={query}
      role="combobox" aria-autocomplete="list" aria-expanded={expanded} aria-controls={expanded ? listId : undefined}
      aria-activedescendant={active ? `${listId}-${active.number}` : undefined}
      onChange={event => { setQuery(event.target.value); setActiveIndex(-1); setOpen(true); }}
      onFocus={() => setOpen(true)} onBlur={() => { setOpen(false); setActiveIndex(-1); }}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
          if (results.length) setActiveIndex(index => event.key === "ArrowDown"
            ? Math.min(index + 1, results.length - 1)
            : index < 0 ? results.length - 1 : Math.max(index - 1, 0));
        } else if (event.key === "Enter" && query.trim()) {
          event.preventDefault();
          event.stopPropagation();
          if (active) choose(active);
        }
      }} />
    {error ? <p className="text-xs">Lookup unavailable. You can enter text and a link manually. <button type="button" className="underline" onClick={() => setRetry(value => value + 1)}>Retry</button></p>
      : !entries.length ? <p className="text-xs text-muted-foreground">Loading sūtras…</p>
      : expanded && <div ref={listRef} id={listId} role="listbox" className="max-h-44 overflow-y-auto" aria-label={`Sūtra results for ${label}`}>
        {results.length ? results.map((entry, index) => <button key={entry.number} id={`${listId}-${entry.number}`} type="button" role="option" aria-selected={index === activeIndex} tabIndex={-1}
          className={`block w-full rounded px-2 py-2 text-left text-sm hover:bg-muted ${index === activeIndex ? "bg-muted ring-1 ring-inset ring-primary" : ""}`}
          onMouseDown={event => event.preventDefault()} onClick={() => choose(entry)}>
          <span className="mr-2 text-muted-foreground">{entry.number}</span>{" "}{entry.text}
        </button>) : <p role="status" className="p-2 text-xs text-muted-foreground">No matching sūtra. Try its number or a shorter phrase.</p>}
      </div>}
    <p className="text-[10px] text-muted-foreground">Choose a result to fill its number, text and link. Source: <a href="https://ashtadhyayi.com" target="_blank" rel="noopener noreferrer" className="underline">Ashtadhyayi.com</a></p>
  </div>;
}
