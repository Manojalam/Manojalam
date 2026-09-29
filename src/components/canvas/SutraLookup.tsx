"use client";

import { useEffect, useState } from "react";
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
  useEffect(() => {
    let active = true;
    loadCatalog().then(data => { if (active) { setEntries(data); setError(false); } }, () => { if (active) setError(true); });
    return () => { active = false; };
  }, [retry]);
  const results = searchSutras(entries, query);
  return <div className="space-y-1 rounded-md border p-2">
    <Input aria-label={`Find sūtra for ${label}`} placeholder="Find sūtra: 3.4.89, ३.४.८९, Sanskrit or Roman words" value={query} onChange={event => setQuery(event.target.value)} />
    {error ? <p className="text-xs">Lookup unavailable. You can enter text and a link manually. <button type="button" className="underline" onClick={() => setRetry(value => value + 1)}>Retry</button></p>
      : !entries.length ? <p className="text-xs text-muted-foreground">Loading sūtras…</p>
      : query.trim() && <div className="max-h-44 overflow-y-auto" aria-label={`Sūtra results for ${label}`}>
        {results.length ? results.map(entry => <button key={entry.number} type="button" className="block w-full rounded px-2 py-2 text-left text-sm hover:bg-muted" onClick={() => { onChoose(sutraFieldValue(entry)); setQuery(""); }}>
          <span className="mr-2 text-muted-foreground">{entry.number}</span>{" "}{entry.text}
        </button>) : <p className="p-2 text-xs text-muted-foreground">No matching sūtra. Try its number or a shorter phrase.</p>}
      </div>}
    <p className="text-[10px] text-muted-foreground">Choose a result to fill its number, text and link. Source: <a href="https://ashtadhyayi.com" target="_blank" rel="noopener noreferrer" className="underline">Ashtadhyayi.com</a></p>
  </div>;
}
