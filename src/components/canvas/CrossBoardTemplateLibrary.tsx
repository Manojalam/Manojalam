"use client";

import { useEffect, useState } from "react";
import { listTemplateSources } from "@/lib/storage/template-library";
import { collectBoardTemplates, importLibraryTemplate, type LibraryTemplate } from "@/lib/templates/board-library";
import { useCanvasStore } from "@/store/canvas-store";
import { useUIStore } from "@/store/ui-store";
import { Button } from "@/components/ui/button";

export function CrossBoardTemplateLibrary() {
  const boardId = useCanvasStore(state => state.board?.id);
  const viewer = useCanvasStore(state => state.board?.accessRole === "viewer");
  const settings = useCanvasStore(state => state.settings);
  const [entries, setEntries] = useState<LibraryTemplate[]>([]);
  const [chosen, setChosen] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    listTemplateSources().then(sources => {
      if (active) { setEntries(collectBoardTemplates(sources, boardId)); setError(false); setLoading(false); }
    }, () => { if (active) { setError(true); setLoading(false); } });
    return () => { active = false; };
  }, [boardId, refresh]);
  const selected = entries.find(entry => entry.key === chosen) ?? entries[0];
  const localCopy = selected && (selected.kind === "card" ? settings.cardTemplates : selected.kind === "sample" ? settings.sampleTemplates : settings.styleTemplates)?.some(item => item.id === selected.template.id);
  const useTemplate = () => {
    const state = useCanvasStore.getState();
    if (!selected || state.board?.id !== boardId || state.board?.accessRole === "viewer") return;
    state.pushHistory();
    state.setSettings(importLibraryTemplate(state.settings, selected));
    const id = selected.template.id;
    if (selected.kind === "card") {
      const nodeId = state.createCardFromTemplate(id);
      if (nodeId) useUIStore.getState().setFillingCardNodeId(nodeId);
    } else if (selected.kind === "sample") {
      if (!state.createSampleCard(id)) state.openTemplateSample(id);
    } else state.createFromStyleTemplate(id);
  };
  return <details aria-label="Templates from all boards" className="space-y-2 border-b p-3">
    <summary className="cursor-pointer text-xs font-semibold">Templates from all boards</summary>
    <p className="text-[10px] text-muted-foreground">Reuse saved templates and linked styles from your other boards. Each board keeps its own editable copy.</p>
    {loading ? <p className="text-xs">Loading your templates...</p> : error ? <p role="alert" className="text-xs">Could not load your templates. Try refreshing.</p> : selected ? <>
      <select aria-label="Template from any board" className="h-8 w-full rounded border bg-background px-2 text-xs" value={selected.key} onChange={event => setChosen(event.target.value)}>
        {entries.map(entry => <option key={entry.key} value={entry.key}>{entry.template.name} - {entry.kind === "style" ? "Linked style" : entry.kind === "card" ? "Fillable card" : "Sample"} ({entry.sourceTitle})</option>)}
      </select>
      {localCopy && <p className="text-[10px] text-muted-foreground">This board already has a copy. Using it keeps your local design edits.</p>}
      <Button size="sm" disabled={viewer} onClick={useTemplate}>Use on this board</Button>
    </> : <p className="text-xs text-muted-foreground">No saved templates on your other boards yet.</p>}
    <Button size="sm" variant="ghost" disabled={loading} onClick={() => { setLoading(true); setRefresh(value => value + 1); }}>Refresh library</Button>
  </details>;
}
