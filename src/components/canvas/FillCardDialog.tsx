"use client";

import { useEffect, useRef, useState } from "react";
import { useUIStore } from "@/store/ui-store";
import { useCanvasStore } from "@/store/canvas-store";
import type { BoardCardTemplate, CardFieldValues, CardSection } from "@/lib/types";
import { cardSections, normalizeCardTemplates, safeCardLink } from "@/lib/canvas/card-templates";
import { CardTemplatePreview } from "./CardTemplatePreview";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SutraLookup } from "./SutraLookup";

/** Keep drafts mounted even when the source card is outside the rendered viewport. */
export function FillCardPanelHost() {
  const id = useUIStore(state => state.fillingCardNodeId);
  const close = useUIStore(state => state.setFillingCardNodeId);
  useEffect(() => () => close(null), [close]);
  return id ? <FillCardDialog key={id} nodeId={id} onClose={() => close(null)} /> : null;
}

export function FillCardDialog({ nodeId, onClose }: { nodeId: string; onClose: () => void }) {
  const [currentId, setCurrentId] = useState(nodeId);
  const node = useCanvasStore(state => state.nodes.find(item => item.id === currentId));
  const savedTemplate = useCanvasStore(state => state.settings.cardTemplates?.find(item => item.id === node?.data.cardTemplateId));
  const template = savedTemplate ?? normalizeCardTemplates([node?.data.cardTemplateSnapshot])[0];
  if (!node || !template) return null;
  if (node.data.freeCardLayout) return <Dialog open modal={false} onOpenChange={open => { if (!open) onClose(); }}><DialogContent onCloseAutoFocus={event => event.preventDefault()}><DialogHeader><DialogTitle>Edit this card directly</DialogTitle><DialogDescription>This card has its own layout. Cut and paste its text on the board; labels and styling stay attached.</DialogDescription></DialogHeader><Button disabled={!!node.data.locked} onClick={() => { onClose(); useCanvasStore.getState().arrangeCard(currentId); }}>Edit on card</Button></DialogContent></Dialog>;
  return <CardForm key={currentId} nodeId={currentId} template={template} initialSections={cardSections(node.data)} locked={!!node.data.locked} onClose={onClose} onNext={setCurrentId} />;
}

function CardForm({ nodeId, template, initialSections, locked, onClose, onNext }: { nodeId: string; template: BoardCardTemplate; initialSections: CardSection[]; locked: boolean; onClose: () => void; onNext: (id: string) => void }) {
  const [sections, setSections] = useState(() => structuredClone(initialSections));
  const [activeId, setActiveId] = useState(initialSections[0].id);
  const fieldsRef = useRef<HTMLFieldSetElement>(null);
  const section = sections.find(item => item.id === activeId) ?? sections[0];
  const values = section.values;
  const extraRows = section.extraRows;
  const setExtraRows = (change: (rows: string[]) => string[]) => setSections(current => current.map(item => item.id === section.id ? { ...item, extraRows: change(item.extraRows) } : item));
  const addSection = () => {
    const id = crypto.randomUUID();
    setSections(current => [...current, { id, values: {}, extraRows: [] }]);
    setActiveId(id);
  };
  useEffect(() => {
    fieldsRef.current?.querySelector<HTMLElement>("textarea,input")?.focus();
  }, [activeId]);
  const [savingNext, setSavingNext] = useState(false);
  const [side, setSide] = useState<"left" | "right">("right");
  const update = useCanvasStore(state => state.updateCardSections);
  const create = useCanvasStore(state => state.createCardFromTemplate);
  const available = useCanvasStore(state => !!state.settings.cardTemplates?.some(item => item.id === template.id));
  const patch = (id: string, value: Partial<CardFieldValues[string]>) => setSections(current => current.map(item => item.id === section.id ? { ...item, values: { ...item.values, [id]: { ...(item.values[id] ?? { text: "" }), ...value } } } : item));
  return <Dialog open modal={false} onOpenChange={open => { if (!open && !savingNext) onClose(); }}>
    <DialogContent data-card-fill-panel onCloseAutoFocus={event => event.preventDefault()}
      className="top-4 bottom-4 w-[calc(100vw-2rem)] max-w-md translate-x-0 translate-y-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden"
      style={{ left: side === "left" ? 16 : "auto", right: side === "right" ? 16 : "auto" }}
      onInteractOutside={event => event.preventDefault()}
      onEscapeKeyDown={event => { if (!document.activeElement?.closest("[data-card-fill-panel]")) event.preventDefault(); }}
      onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}
    >
      <DialogHeader><DialogTitle>Fill card · {template.name}</DialogTitle><DialogDescription>Keep this panel open while you navigate the board and copy text. Your draft stays here until you save or cancel. Tab moves between inputs.</DialogDescription><Button type="button" size="sm" variant="ghost" className="self-start" onClick={() => setSide(side === "right" ? "left" : "right")}>Move panel to {side === "right" ? "left" : "right"}</Button></DialogHeader>
      <form className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-4" onSubmit={event => { event.preventDefault(); update(nodeId, sections); onClose(); }}>
        <div className="space-y-4 overflow-y-auto pr-1">
        <div className="space-y-2 rounded-md border p-3">
          <label className="block text-sm font-medium">Section to fill<select aria-label="Section to fill" className="mt-1 h-9 w-full rounded-md border bg-background px-2" value={section.id} onChange={event => setActiveId(event.target.value)}>{sections.map((item, index) => <option key={item.id} value={item.id}>Section {index + 1} of {sections.length}</option>)}</select></label>
          <p className="text-xs text-muted-foreground">All sections appear in this same box. Save card saves them together.</p>
        </div>
        <fieldset ref={fieldsRef} disabled={locked} className="space-y-4">
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
          {extraRows.map((row, index) => <div key={index} className="space-y-2 rounded-md border p-3">
            <label className="block text-sm">My row {index + 1}<textarea aria-label={"My row " + (index + 1)} className="min-h-20 w-full rounded-md border bg-background p-2" value={row} onChange={event => setExtraRows(current => current.map((value, i) => i === index ? event.target.value : value))} /></label>
            <Button type="button" size="sm" variant="ghost" onClick={() => setExtraRows(current => current.filter((_, i) => i !== index))}>Remove my row {index + 1}</Button>
          </div>)}
          <Button type="button" variant="outline" onClick={() => setExtraRows(current => [...current, ""])}>Add my own row</Button>
          <p className="text-xs text-muted-foreground">Your extra rows belong to this card only. Use Arrange / edit on card to move text anywhere and assign labels.</p>
        </fieldset>
        <details className="rounded border p-3">
          <summary className="cursor-pointer text-sm">Preview filled card</summary>
          <div className="mt-2">
            <CardTemplatePreview template={template} sections={sections} />
          </div>
        </details>
        <details className="rounded border p-3">
          <summary className="cursor-pointer text-sm">Advanced: switch to free text</summary>
          <p className="my-2 text-xs text-muted-foreground">This switches this card from filling fields in this panel to editing text directly on the board. To keep using fields and sections, use Save card.</p>
          <Button type="button" variant="outline" disabled={locked || savingNext} onClick={() => { update(nodeId, sections); onClose(); useCanvasStore.getState().arrangeCard(nodeId); }}>Arrange / edit on card</Button>
        </details>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" disabled={savingNext} onClick={onClose}>Cancel</Button>
          <Button type="button" variant="outline" disabled={locked || savingNext} onClick={addSection}>Add another section</Button>
          <Button type="submit" disabled={locked || savingNext}>Save card</Button>
          <Button type="button" disabled={locked || !available || savingNext} onClick={async () => {
            setSavingNext(true);
            update(nodeId, sections);
            // Content sync, size reporting and React Flow measurement each run
            // on a frame. Place the next card after the saved card has expanded.
            for (let frame = 0; frame < 4; frame++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
            const id = create(template.id);
            if (id) onNext(id);
            else setSavingNext(false);
          }}>{savingNext ? "Saving…" : "Save & new box"}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}
