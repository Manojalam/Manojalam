"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { searchTextOffsets } from "@/lib/canvas/search-highlight";
import { boardSearchText } from "@/lib/canvas/board-search";
import { nextSearchIndex, searchOccurrenceText, orderSearchResults, searchScopeIds } from "@/lib/canvas/search-navigation";
import { Input } from "@/components/ui/input";
import { useUIStore } from "@/store/ui-store";
import { useCanvasStore } from "@/store/canvas-store";

type Match = { id: string; occurrence: number };

export function SearchPanel() {
  const { searchPanelOpen, setSearchPanelOpen } = useUIStore();
  const { searchQuery, searchResults, performSearch, nodes, edges, board } = useCanvasStore();
  const [active, setActive] = useState<Match | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [selection, setSelection] = useState<string[]>([]);
  const [scope, setScope] = useState<"selection" | "board">("board");
  const [composing, setComposing] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const lastAutomatic = useRef("");

  const clearHighlight = useCallback(() => {
    setActive(null);
    lastAutomatic.current = "";
    window.dispatchEvent(new Event("vidya:clear-search"));
  }, []);
  const close = useCallback(() => {
    clearHighlight();
    setSearchPanelOpen(false);
  }, [clearHighlight, setSearchPanelOpen]);

  // Freeze the user's selection when search opens. Visiting matches changes canvas
  // selection, but must never silently shrink or change the search scope.
  useEffect(() => {
    if (!searchPanelOpen) return;
    const store = useCanvasStore.getState();
    const selected = [...store.selectedNodeIds, ...store.selectedEdgeIds];
    setSelection(selected);
    setScope(selected.length ? "selection" : "board");
    clearHighlight();
    input.current?.focus();
    input.current?.select();
  }, [searchPanelOpen, board?.id, clearHighlight]);

  useEffect(() => {
    if (searchPanelOpen) performSearch(searchQuery);
  }, [searchPanelOpen, searchQuery, nodes, edges, performSearch]);
  useEffect(() => {
    clearHighlight();
    setCounts({});
  }, [searchQuery, scope, board?.id, clearHighlight]);

  const scopeIds = useMemo(() => scope === "selection" ? searchScopeIds(selection, nodes) : null, [scope, selection, nodes]);
  const results = useMemo(() => orderSearchResults(searchResults, nodes, edges).flatMap(id => {
    const node = nodes.find(item => item.id === id);
    const edge = edges.find(item => item.id === id);
    if (!node && !edge) return [];
    if (scopeIds && !scopeIds.has(id) && !(edge && scopeIds.has(edge.source) && scopeIds.has(edge.target))) return [];
    const text = node ? boardSearchText(node.data) : String(edge?.data?.label ?? edge?.label ?? "Connector");
    return [{ id, count: counts[id] ?? Math.max(1, searchTextOffsets(node ? searchOccurrenceText(node.data) : text, searchQuery).length) }];
  }), [searchResults, nodes, edges, searchQuery, counts, scopeIds]);
  const matches = useMemo(() => results.flatMap(result => Array.from({ length: result.count }, (_, occurrence) => ({ id: result.id, occurrence }))), [results]);
  const activeIndex = active ? matches.findIndex(match => match.id === active.id && match.occurrence === active.occurrence) : -1;
  const navigate = useCallback((match: Match | undefined) => {
    if (!match) return;
    const node = nodes.find(item => item.id === match.id);
    const edge = edges.find(item => item.id === match.id);
    if (!node && !edge) return;
    lastAutomatic.current = JSON.stringify([board?.id, searchQuery, scope, selection]);
    setActive(match);
    const store = useCanvasStore.getState();
    store.setSelectedNodeIds(node ? [match.id] : []);
    store.setSelectedEdgeIds(edge ? [match.id] : []);
    window.dispatchEvent(new CustomEvent("vidya:fitview", {
      detail: { searchFocus: true, query: searchQuery, occurrence: match.occurrence, nodeIds: node ? [match.id] : edge ? [edge.source, edge.target] : [] },
    }));
  }, [nodes, edges, searchQuery, board?.id, scope, selection]);
  const step = useCallback((direction: number) => {
    navigate(matches[activeIndex < 0 ? 0 : nextSearchIndex(activeIndex, direction, matches.length)]);
  }, [navigate, matches, activeIndex]);

  useEffect(() => {
    const key = JSON.stringify([board?.id, searchQuery, scope, selection]);
    if (!searchPanelOpen || composing || !searchQuery.trim() || !matches.length || lastAutomatic.current === key) return;
    const timer = window.setTimeout(() => {
      if (lastAutomatic.current === key) return;
      lastAutomatic.current = key;
      navigate(matches[0]);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchPanelOpen, composing, searchQuery, scope, selection, board?.id, matches, navigate]);

  useEffect(() => {
    const onCount = (event: Event) => {
      const detail = (event as CustomEvent<{ nodeId: string; query: string; count: number }>).detail;
      if (detail.query !== searchQuery) return;
      setCounts(previous => previous[detail.nodeId] === detail.count ? previous : { ...previous, [detail.nodeId]: detail.count });
      setActive(previous => previous?.id === detail.nodeId && previous.occurrence >= detail.count
        ? { ...previous, occurrence: Math.max(0, detail.count - 1) } : previous);
    };
    const onKey = (event: KeyboardEvent) => {
      if (!searchPanelOpen || event.isComposing) return;
      if (event.key === "Escape") {
        event.preventDefault(); event.stopPropagation(); close();
      } else if (event.key === "Tab" || event.key === "F3") {
        // Capture before canvas shortcuts or native focus traversal can create nodes.
        event.preventDefault(); event.stopPropagation();
        step(event.shiftKey ? -1 : 1);
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault(); event.stopPropagation(); input.current?.focus(); input.current?.select();
      }
    };
    window.addEventListener("vidya:search-match-count", onCount);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("vidya:search-match-count", onCount);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [searchPanelOpen, searchQuery, step, close]);

  if (!searchPanelOpen) return null;
  return <div role="search" aria-label="Board match navigation"
    className="fixed left-20 top-24 z-50 flex max-w-[calc(100vw-6rem)] flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2 text-sm shadow-lg">
    <Input ref={input} className="mr-8 w-52" placeholder="Search this board..." aria-label="Search board" name="board-search"
      value={searchQuery} onChange={event => performSearch(event.target.value)}
      onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)}
      onKeyDown={event => {
        if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); step(event.shiftKey ? -1 : 1); }
      }} />
    <select aria-label="Search scope" className="rounded border border-border bg-card px-2 py-1" value={scope} onChange={event => setScope(event.target.value as "selection" | "board")}>
      <option value="selection" disabled={!selection.length}>Selected object{selection.length > 1 ? "s" : ""}</option>
      <option value="board">Entire board</option>
    </select>
    <span role="status" aria-live="polite" className="whitespace-nowrap">{activeIndex >= 0 ? `${activeIndex + 1} of ${matches.length}` : searchQuery.trim() ? "No matches" : "Type to search"}</span>
    <button disabled={!matches.length} className="rounded border px-2 py-1 disabled:opacity-40" aria-label="Previous match" title="Previous match (Shift+Tab or Shift+F3)" onClick={() => step(-1)}>Previous</button>
    <button disabled={!matches.length} className="rounded border px-2 py-1 disabled:opacity-40" aria-label="Next match" title="Next match (Tab or F3)" onClick={() => step(1)}>Next</button>
    <button className="px-2 py-1" aria-label="Close search" title="Close search (Escape)" onClick={close}>×</button>
  </div>;
}
