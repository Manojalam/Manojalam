"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCallback, useEffect, useMemo, useState } from "react";
import { searchTextOffsets } from "@/lib/canvas/search-highlight";
import { boardSearchText } from "@/lib/canvas/board-search";
import { nextSearchIndex, searchOccurrenceText, orderSearchResults } from "@/lib/canvas/search-navigation";
import { Input } from "@/components/ui/input";
import { useUIStore } from "@/store/ui-store";
import { useCanvasStore } from "@/store/canvas-store";

type Match = { id: string; occurrence: number };

export function SearchPanel() {
  const { searchPanelOpen, setSearchPanelOpen } = useUIStore();
  const { searchQuery, searchResults, performSearch, nodes, edges, board } = useCanvasStore();
  const [active, setActive] = useState<Match | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (searchPanelOpen) performSearch(searchQuery);
  }, [searchPanelOpen, searchQuery, nodes, edges, performSearch]);

  const clear = useCallback(() => {
    setActive(null);
    window.dispatchEvent(new Event("vidya:clear-search"));
  }, []);

  useEffect(() => {
    clear();
    setCounts({});
  }, [searchQuery, board?.id, clear]);

  const results = useMemo(() => orderSearchResults(searchResults, nodes, edges).flatMap(id => {
    const node = nodes.find(item => item.id === id);
    const edge = edges.find(item => item.id === id);
    if (!node && !edge) return [];
    const text = node ? boardSearchText(node.data) : String(edge?.data?.label ?? edge?.label ?? "Connector");
    const visibleText = node ? searchOccurrenceText(node.data) : text;
    return [{ id, node, edge, text, count: counts[id] ?? Math.max(1, searchTextOffsets(visibleText, searchQuery).length) }];
  }), [searchResults, nodes, edges, searchQuery, counts]);
  const matches = useMemo(() => results.flatMap(result => Array.from({ length: result.count }, (_, occurrence) => ({ id: result.id, occurrence }))), [results]);
  const activeIndex = active ? matches.findIndex(match => match.id === active.id && match.occurrence === active.occurrence) : -1;

  const navigate = useCallback((match: Match | undefined) => {
    if (!match) return;
    const node = nodes.find(item => item.id === match.id);
    const edge = edges.find(item => item.id === match.id);
    if (!node && !edge) return;
    setActive(match);
    setSearchPanelOpen(false);
    const store = useCanvasStore.getState();
    store.setSelectedNodeIds(node ? [match.id] : []);
    store.setSelectedEdgeIds(edge ? [match.id] : []);
    window.dispatchEvent(new CustomEvent("vidya:fitview", {
      detail: { searchFocus: true, query: searchQuery, occurrence: match.occurrence, nodeIds: node ? [match.id] : edge ? [edge.source, edge.target] : [] },
    }));
  }, [nodes, edges, searchQuery, setSearchPanelOpen]);
  const step = useCallback((direction: number) => {
    navigate(matches[nextSearchIndex(activeIndex, direction, matches.length)]);
  }, [navigate, matches, activeIndex]);

  useEffect(() => {
    const onCount = (event: Event) => {
      const detail = (event as CustomEvent<{ nodeId: string; query: string; count: number }>).detail;
      if (detail.query !== searchQuery) return;
      setCounts(previous => previous[detail.nodeId] === detail.count ? previous : { ...previous, [detail.nodeId]: detail.count });
      setActive(previous => previous?.id === detail.nodeId && previous.occurrence >= detail.count
        ? { ...previous, occurrence: Math.max(0, detail.count - 1) } : previous);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") clear();
      if (event.key === "F3" && active) {
        event.preventDefault();
        step(event.shiftKey ? -1 : 1);
      }
    };
    window.addEventListener("vidya:search-match-count", onCount);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("vidya:search-match-count", onCount);
      window.removeEventListener("keydown", onKey);
    };
  }, [searchQuery, active, step, clear]);

  return <>
    {!searchPanelOpen && activeIndex >= 0 && <div
      role="search" aria-label="Board match navigation"
      className="fixed left-20 top-24 z-50 flex max-w-[calc(100vw-6rem)] items-center gap-2 rounded-lg border border-border bg-card p-2 text-sm shadow-lg"
      onKeyDown={event => {
        if (event.key === "Enter") { event.preventDefault(); step(event.shiftKey ? -1 : 1); }
      }}
    >
      <button className="max-w-40 truncate px-2" title="Edit search" onClick={() => setSearchPanelOpen(true)}>{searchQuery}</button>
      <span role="status" aria-live="polite" className="whitespace-nowrap">{activeIndex + 1} of {matches.length}</span>
      <button className="rounded border px-2 py-1" aria-label="Previous match" title="Previous match (Shift+F3)" onClick={() => step(-1)}>Previous</button>
      <button className="rounded border px-2 py-1" aria-label="Next match" title="Next match (F3)" onClick={() => step(1)}>Next</button>
      <button className="px-2 py-1" aria-label="Close search" title="Close search (Escape)" onClick={clear}>×</button>
    </div>}
    <Dialog open={searchPanelOpen} onOpenChange={setSearchPanelOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Search Board</DialogTitle></DialogHeader>
        <Input
          placeholder="Search nodes, tags, Sanskrit text..." aria-label="Search board" name="board-search"
          value={searchQuery} onChange={event => performSearch(event.target.value)} autoFocus
          onKeyDown={event => {
            if (event.key === "Enter") { event.preventDefault(); navigate(matches[0]); }
          }}
        />
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {results.length === 0 && searchQuery && <p className="py-4 text-center text-sm text-muted-foreground">No matches</p>}
          {results.map(({ id, node, text, count }) => {
            const match = searchTextOffsets(text, searchQuery)[0];
            const start = match ? Math.max(0, match[0] - 45) : 0;
            return <button key={id} className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-accent" onClick={() => navigate({ id, occurrence: 0 })}>
              <span className="text-xs text-muted-foreground">{node?.type ?? "connector"} · {count} {count === 1 ? "match" : "matches"}</span>
              <p className="truncate">
                {start > 0 ? "…" : ""}
                {match ? <>{text.slice(start, match[0])}<mark className="bg-yellow-200 text-black">{text.slice(match[0], match[1])}</mark>{text.slice(match[1], match[1] + 80)}</> : text.slice(0, 120)}
              </p>
            </button>;
          })}
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
