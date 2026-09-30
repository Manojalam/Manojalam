"use client";

import { useState } from "react";
import { useCanvasStore } from "@/store/canvas-store";
import { useUIStore } from "@/store/ui-store";
import { Button } from "@/components/ui/button";
import { CrossBoardTemplateLibrary } from "./CrossBoardTemplateLibrary";

/** Creation belongs to the canvas, not to an existing box's selection. */
export function TemplateLauncher() {
  const boardId = useCanvasStore(state => state.board?.id);
  const settings = useCanvasStore(state => state.settings);
  const [chosen, setChosen] = useState("");
  const templates = [
    ...(settings.cardTemplates ?? []).map(template => ({ key: `card:${template.id}`, kind: "card", template })),
    ...(settings.sampleTemplates ?? []).map(template => ({ key: `sample:${template.id}`, kind: "sample", template })),
  ];
  const selected = templates.find(item => item.key === chosen) ?? templates[0];
  return <>
    {selected && <section aria-label="Create from template" className="space-y-2 border-b p-3">
      <h3 className="text-sm font-semibold">Templates</h3>
      <select aria-label="Template to use" className="h-9 w-full rounded border bg-background px-2 text-xs" value={selected.key} onChange={event => setChosen(event.target.value)}>
        {templates.map(item => <option key={item.key} value={item.key}>{item.template.name}</option>)}
      </select>
      <Button size="sm" className="w-full" onClick={() => {
        const state = useCanvasStore.getState();
        if (state.board?.accessRole === "viewer") return;
        if (selected.kind === "card") {
          const id = state.createCardFromTemplate(selected.template.id);
          if (id) useUIStore.getState().setFillingCardNodeId(id);
        } else if (!state.createSampleCard(selected.template.id)) state.openTemplateSample(selected.template.id);
      }}>New card &amp; fill</Button>
    </section>}
    <CrossBoardTemplateLibrary key={boardId} />
  </>;
}
