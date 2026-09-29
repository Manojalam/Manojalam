"use client";

import { useState } from "react";
import type { BoardCardTemplate } from "@/lib/types";
import { generateId } from "@/lib/utils";
import { newHomeworkTemplate } from "@/lib/canvas/card-templates";
import { useCanvasStore } from "@/store/canvas-store";
import { Button } from "@/components/ui/button";
import { CardTemplateDesigner } from "./CardTemplateDesigner";
import { useUIStore } from "@/store/ui-store";

export function CardTemplatesPanel() {
  const templates = useCanvasStore(state => state.settings.cardTemplates);
  const selected = useCanvasStore(state => state.selectedNodeIds.length === 1 ? state.nodes.find(node => node.id === state.selectedNodeIds[0]) : undefined);
  const create = useCanvasStore(state => state.createCardFromTemplate);
  const detach = useCanvasStore(state => state.detachCardTemplate);
  const remove = useCanvasStore(state => state.deleteCardTemplate);
  const [chosen, setChosen] = useState("");
  const [design, setDesign] = useState<BoardCardTemplate | null>(null);
  const setFillId = useUIStore(state => state.setFillingCardNodeId);
  const [deleting, setDeleting] = useState(false);
  const template = templates?.find(item => item.id === (chosen || selected?.data.cardTemplateId)) ?? templates?.[0];
  const selectedTemplate = templates?.find(item => item.id === selected?.data.cardTemplateId);
  return <section aria-label="Fillable card templates" className="space-y-2 border-b p-3">
    <h3 className="text-xs font-semibold">Fillable card templates</h3>
    <p className="text-[10px] text-muted-foreground">Design your labels and rows once. Fill a new card for each question.</p>
    <div className="flex flex-wrap gap-1">
      <Button size="sm" className="h-8 text-xs" onClick={() => {
        const blank = newHomeworkTemplate(generateId());
        setDesign({ ...blank, name: "My card template", rows: [{ id: generateId(), indent: 0, fields: [{ id: generateId(), label: "My label", color: "#334155", kind: "text" }] }] });
      }}>Design new template</Button>
      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setDesign(newHomeworkTemplate(generateId()))}>Homework starter</Button>
    </div>
    {selected?.data.cardTemplateId ? <div className="space-y-1 rounded border p-2">
      <p className="text-xs font-medium">Selected homework card</p>
      {selectedTemplate && <p className="text-[10px] text-muted-foreground">Template: {selectedTemplate.name}</p>}
      <p className="text-[10px] text-muted-foreground">Double-click this card or use Fill / edit card.</p>
      <Button size="sm" disabled={!!selected.data.locked} onClick={() => setFillId(selected.id)}>Fill / edit card</Button>
      {selectedTemplate && <Button size="sm" variant="outline" onClick={() => setDesign(structuredClone(selectedTemplate))}>Edit this card’s design</Button>}
      <Button size="sm" variant="ghost" disabled={!!selected.data.locked} onClick={() => detach(selected.id)}>Convert to ordinary box</Button>
    </div> : null}
    {template && <>
      <p className="text-[10px] font-medium">Template library</p>
      <select aria-label="Fillable card template" className="h-8 w-full rounded border bg-background px-2 text-xs" value={template.id} onChange={event => { setChosen(event.target.value); setDeleting(false); }}>
        {templates?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <div className="flex flex-wrap gap-1">
        <Button size="sm" onClick={() => { const id = create(template.id); if (id) setFillId(id); }}>New card &amp; fill</Button>
        <Button size="sm" variant="outline" onClick={() => setDesign(structuredClone(template))}>Edit design</Button>
        <Button size="sm" variant="ghost" onClick={() => setDesign({ ...structuredClone(template), id: generateId(), name: `${template.name} copy` })}>Duplicate design</Button>
      </div>
      {deleting ? <div className="space-y-1 text-xs"><p>Delete the template? Existing cards become ordinary boxes and keep their displayed content.</p><Button size="sm" variant="destructive" onClick={() => { remove(template.id); setDeleting(false); setChosen(""); }}>Delete template</Button><Button size="sm" variant="ghost" onClick={() => setDeleting(false)}>Cancel</Button></div>
        : <button className="text-[10px] text-muted-foreground underline" onClick={() => setDeleting(true)}>Delete card template…</button>}
    </>}
    {design && <CardTemplateDesigner key={design.id} initial={design} onClose={() => setDesign(null)} onSaved={id => { setChosen(id); setDesign(null); }} />}
  </section>;
}
