"use client";

import { TemplateUseActions } from "./TemplateUseActions";
import { useState } from "react";
import type { BoardCardTemplate } from "@/lib/types";
import { generateId } from "@/lib/utils";
import { newHomeworkTemplate } from "@/lib/canvas/card-templates";
import { useCanvasStore } from "@/store/canvas-store";
import { Button } from "@/components/ui/button";
import { CardTemplateDesigner } from "./CardTemplateDesigner";

export function CardTemplatesPanel() {
  const templates = useCanvasStore(state => state.settings.cardTemplates);
  const selected = useCanvasStore(state => state.selectedNodeIds.length === 1 ? state.nodes.find(node => node.id === state.selectedNodeIds[0]) : undefined);
  const remove = useCanvasStore(state => state.deleteCardTemplate);
  const [chosen, setChosen] = useState("");
  const [design, setDesign] = useState<BoardCardTemplate | null>(null);
  const [deleting, setDeleting] = useState(false);
  const template = templates?.find(item => item.id === (chosen || selected?.data.cardTemplateId)) ?? templates?.[0];
  return <section aria-label="Templates" className="space-y-2 border-b p-3">
    <p className="text-[10px] text-muted-foreground">Create repeatable sets of text fields. Use them in an object or table column; style the object separately.</p>
    <div className="flex flex-wrap gap-1">
      <Button size="sm" className="h-8 text-xs" onClick={() => {
        const blank = newHomeworkTemplate(generateId());
        setDesign({ ...blank, starter: undefined, name: "My template", rows: [{ id: generateId(), indent: 0, fields: [{ id: generateId(), label: "My label", color: "#334155", kind: "text" }] }] });
      }}>Create template</Button>
    </div>
    {template && <>
      <p className="text-[10px] font-medium">Choose template</p>
      <select aria-label="Template" className="h-8 w-full rounded border bg-background px-2 text-xs" value={template.id} onChange={event => { setChosen(event.target.value); setDeleting(false); }}>
        {templates?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <div className="flex flex-wrap gap-1">
        <TemplateUseActions kind="card" template={template} />
        <Button size="sm" variant="outline" onClick={() => setDesign(structuredClone(template))}>Edit template</Button>
        <Button size="sm" variant="ghost" onClick={() => setDesign({ ...structuredClone(template), id: generateId(), name: `${template.name} copy` })}>Duplicate template</Button>
      </div>
      {deleting ? <div className="space-y-1 text-xs"><p>Delete the template? Existing objects keep their displayed content.</p><Button size="sm" variant="destructive" onClick={() => { remove(template.id); setDeleting(false); setChosen(""); }}>Delete template</Button><Button size="sm" variant="ghost" onClick={() => setDeleting(false)}>Cancel</Button></div>
        : <button className="text-[10px] text-muted-foreground underline" onClick={() => setDeleting(true)}>Delete template…</button>}
    </>}
    {design && <CardTemplateDesigner key={design.id} initial={design} onClose={() => setDesign(null)} onSaved={id => { setChosen(id); setDesign(null); }} />}
  </section>;
}
