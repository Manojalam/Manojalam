"use client";

import { useState } from "react";
import { useCanvasStore } from "@/store/canvas-store";
import type { BoardCardTemplate, CardFieldValues } from "@/lib/types";
import { normalizeCardTemplates, safeCardLink } from "@/lib/canvas/card-templates";
import { CardTemplatePreview } from "./CardTemplatePreview";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SutraLookup } from "./SutraLookup";

export function FillCardDialog({ nodeId, onClose }: { nodeId: string; onClose: () => void }) {
  const [currentId, setCurrentId] = useState(nodeId);
  const node = useCanvasStore(state => state.nodes.find(item => item.id === currentId));
  const savedTemplate = useCanvasStore(state => state.settings.cardTemplates?.find(item => item.id === node?.data.cardTemplateId));
  const template = savedTemplate ?? normalizeCardTemplates([node?.data.cardTemplateSnapshot])[0];
  if (!node || !template) return null;
  return <CardForm key={currentId} nodeId={currentId} template={template} initialValues={(node.data.cardFieldValues ?? {}) as CardFieldValues} locked={!!node.data.locked} onClose={onClose} onNext={setCurrentId} />;
}

function CardForm({ nodeId, template, initialValues, locked, onClose, onNext }: { nodeId: string; template: BoardCardTemplate; initialValues: CardFieldValues; locked: boolean; onClose: () => void; onNext: (id: string) => void }) {
  const [values, setValues] = useState<CardFieldValues>(() => structuredClone(initialValues));
  const [savingNext, setSavingNext] = useState(false);
  const update = useCanvasStore(state => state.updateCardValues);
  const create = useCanvasStore(state => state.createCardFromTemplate);
  const available = useCanvasStore(state => !!state.settings.cardTemplates?.some(item => item.id === template.id));
  const patch = (id: string, value: Partial<CardFieldValues[string]>) => setValues(current => ({ ...current, [id]: { ...(current[id] ?? { text: "" }), ...value } }));
  return <Dialog open onOpenChange={open => { if (!open && !savingNext) onClose(); }}>
    <DialogContent className="max-h-[90vh] max-w-2xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden" onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
      <DialogHeader><DialogTitle>Fill card · {template.name}</DialogTitle><DialogDescription>Enter this question’s content. Tab moves to the next input. Colors and layout come from your template.</DialogDescription></DialogHeader>
      <form className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-4" onSubmit={event => { event.preventDefault(); update(nodeId, values); onClose(); }}>
        <div className="space-y-4 overflow-y-auto pr-1">
        <fieldset disabled={locked} className="space-y-4">
          {template.rows.map(row => <div key={row.id} className="space-y-3 rounded-md border p-3">
            {row.fields.map(field => <div key={field.id} className="space-y-1">
              <label htmlFor={`card-field-${field.id}`} className="text-sm font-medium">{field.label || "Unlabelled field"}</label>
              {field.kind === "sutra" && <SutraLookup label={field.label || "Unlabelled field"} onChoose={value => patch(field.id, value)} />}
              {field.kind === "multiline" ? <textarea id={`card-field-${field.id}`} className="min-h-24 w-full rounded-md border bg-background p-2 text-sm" value={values[field.id]?.text ?? ""} onChange={event => patch(field.id, { text: event.target.value })} />
                : <Input id={`card-field-${field.id}`} value={values[field.id]?.text ?? ""} onChange={event => patch(field.id, { text: event.target.value })} />}
              {(field.kind === "link" || field.kind === "sutra") && <>
                <Input aria-label={`${field.label} link`} placeholder="Optional link (https://…)" value={values[field.id]?.href ?? ""} onChange={event => patch(field.id, { href: event.target.value })} />
                {!!values[field.id]?.href && !safeCardLink(values[field.id].href) && <p className="text-xs text-destructive">Use a full https://, http:// or mailto: link. This value will display as plain text until corrected.</p>}
              </>}
            </div>)}
          </div>)}
        </fieldset>
        <details className="rounded border p-3">
          <summary className="cursor-pointer text-sm">Preview filled card</summary>
          <div className="mt-2">
            <CardTemplatePreview template={template} values={values} />
          </div>
        </details>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" disabled={savingNext} onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={locked || savingNext}>Save card</Button>
          <Button type="button" disabled={locked || !available || savingNext} onClick={async () => {
            setSavingNext(true);
            update(nodeId, values);
            // Content sync, size reporting and React Flow measurement each run
            // on a frame. Place the next card after the saved card has expanded.
            for (let frame = 0; frame < 4; frame++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
            const id = create(template.id);
            if (id) onNext(id);
            else setSavingNext(false);
          }}>{savingNext ? "Saving…" : "Save & next question"}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}
