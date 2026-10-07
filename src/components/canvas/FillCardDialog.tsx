"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUIStore } from "@/store/ui-store";
import { useCanvasStore } from "@/store/canvas-store";
import type { BoardCardTemplate, CardFieldValues, CardSection } from "@/lib/types";
import { cardSections, expandedCardRows, insertCardRowRepeat, normalizeCardTemplates, safeCardLink } from "@/lib/canvas/card-templates";
import { columnSections, normalizeTable, tablePlainText, updateColumnSections } from "@/lib/canvas/table";
import { CardTemplatePreview } from "./CardTemplatePreview";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SutraLookup } from "./SutraLookup";

export function FillCardDialog({ nodeId, onClose, embedded = false }: { nodeId: string; onClose: () => void; embedded?: boolean }) {
  const [currentId, setCurrentId] = useState(nodeId);
  const node = useCanvasStore(state => state.nodes.find(item => item.id === currentId));
  const savedTemplate = useCanvasStore(state => state.settings.cardTemplates?.find(item => item.id === node?.data.cardTemplateId));
  const template = savedTemplate ?? normalizeCardTemplates([node?.data.cardTemplateSnapshot])[0];
  if (!node || !template) return null;
  if (node.data.freeCardLayout && embedded) return <div className="space-y-2 p-3"><p className="text-sm">This object uses a free layout. Edit its text directly on the board.</p><Button disabled={!!node.data.locked} onClick={() => { onClose(); useCanvasStore.getState().arrangeCard(currentId); }}>Edit text on object</Button></div>;
  if (node.data.freeCardLayout) return <Dialog open modal={false} onOpenChange={open => { if (!open) onClose(); }}><DialogContent onCloseAutoFocus={event => event.preventDefault()}><DialogHeader><DialogTitle>Edit this object directly</DialogTitle><DialogDescription>This object has its own layout. Cut and paste its text on the board; labels and styling stay attached.</DialogDescription></DialogHeader><Button disabled={!!node.data.locked} onClick={() => { onClose(); useCanvasStore.getState().arrangeCard(currentId); }}>Edit text on object</Button></DialogContent></Dialog>;
  return <CardForm embedded={embedded} key={currentId} nodeId={currentId} template={template} sections={cardSections(node.data)} locked={!!node.data.locked} onClose={onClose} onNext={id => { setCurrentId(id); if (useUIStore.getState().fillingCardNodeId) useUIStore.getState().setFillingCardNodeId(id); }} />;
}

export function CardForm({ columnId, initialSectionId, nodeId, template, sections, locked, onClose, onNext, embedded = false }: { columnId?: string; initialSectionId?: string; embedded?: boolean; nodeId: string; template: BoardCardTemplate; sections: CardSection[]; locked: boolean; onClose: () => void; onNext: (id: string) => void }) {
  const lastEdit = useRef<{ key: string; at: number; sections: unknown } | null>(null);
  const setSections = useCallback((change: (current: CardSection[]) => CardSection[], editKey?: string) => {
    const state = useCanvasStore.getState();
    const node = state.nodes.find(item => item.id === nodeId);
    if (!node || node.data.locked || node.data.freeCardLayout || state.board?.accessRole === "viewer" || state.layers.some(layer => layer.id === node.data.layerId && layer.locked)) return;
    const current = columnId ? columnSections(normalizeTable(node.data.table), columnId) : cardSections(node.data);
    const next = change(current);
    if (JSON.stringify(next) === JSON.stringify(current)) return;
    const now = Date.now();
    const previous = lastEdit.current;
    const history = !editKey || previous?.key !== editKey || now - previous.at > 750 || previous.sections !== (columnId ? node.data.table : node.data.cardSections);
    if (columnId) {
      const table = updateColumnSections(normalizeTable(node.data.table), columnId, next);
      table.columns = table.columns.map(column => column.id === columnId && column.card ? { ...column, card: { ...column.card, template: structuredClone(template) } } : column);
      if (history) state.pushHistory();
      state.updateNodeData(nodeId, { table, text: tablePlainText(table) });
    } else state.updateCardSections(nodeId, next, history);
    lastEdit.current = editKey ? { key: editKey, at: now, sections: useCanvasStore.getState().nodes.find(item => item.id === nodeId)?.data[columnId ? "table" : "cardSections"] } : null;
  }, [nodeId, columnId, template]);
  const [activeId, setActiveId] = useState(initialSectionId ?? sections[0].id);
  const fieldsRef = useRef<HTMLFieldSetElement>(null);
  const section = sections.find(item => item.id === activeId) ?? sections[0];
  const sectionIndex = sections.findIndex(item => item.id === section.id);
  const moveSection = (direction: -1 | 1) => {
    if (locked || savingNext) return;
    setSections(current => {
      const index = current.findIndex(item => item.id === section.id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const reordered = [...current];
      [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
      return reordered;
    });
  };
  const extraRows = section.extraRows;
  const setExtraRows = (change: (rows: string[]) => string[], editKey?: string) => setSections(current => current.map(item => item.id === section.id ? { ...item, extraRows: change(item.extraRows) } : item), editKey);
  const addSection = () => {
    const id = crypto.randomUUID();
    setSections(current => [...current, { id, values: {}, extraRows: [] }]);
    setActiveId(id);
  };
  useEffect(() => {
    fieldsRef.current?.querySelector<HTMLElement>("textarea,input")?.focus();
  }, [activeId]);
  const [savingNext, setSavingNext] = useState(false);
  const create = useCanvasStore(state => state.createCardFromTemplate);
  const available = useCanvasStore(state => !!state.settings.cardTemplates?.some(item => item.id === template.id));
  const patch = (id: string, value: Partial<CardFieldValues[string]>, repeatId: string) => setSections(current => current.map(item => {
    if (item.id !== section.id) return item;
    const patchValues = (values: CardFieldValues) => ({ ...values, [id]: { ...(values[id] ?? { text: "" }), ...value } });
    return repeatId
      ? { ...item, rowRepeats: item.rowRepeats?.map(repeat => repeat.id === repeatId ? { ...repeat, values: patchValues(repeat.values) } : repeat) }
      : { ...item, values: patchValues(item.values) };
  }), section.id + ":" + repeatId + ":" + id);
  const repeatRow = (rowId: string, anchorId: string, side: "before" | "after") => setSections(current => current.map(item => item.id === section.id
    ? { ...item, rowRepeats: insertCardRowRepeat(item.rowRepeats ?? [], rowId, anchorId, side, crypto.randomUUID()) } : item));
  const removeRepeat = (id: string) => setSections(current => current.map(item => item.id === section.id
    ? { ...item, rowRepeats: item.rowRepeats?.filter(repeat => repeat.id !== id) } : item));
  const content = <>
    <header className="space-y-1"><h3 className="text-sm font-semibold">{columnId ? "Fill column" : "Fill template"} · {template.name}</h3><p className="text-xs text-muted-foreground">Changes save automatically. Enter adds a line; Tab moves between fields.</p></header>
      <form className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-4" onSubmit={event => event.preventDefault()}>
        <div className="space-y-4 overflow-y-auto pr-1">
        <div className="space-y-2 rounded-md border p-3">
          <label className="block text-sm font-medium">Section to fill<select aria-label="Section to fill" className="mt-1 h-9 w-full rounded-md border bg-background px-2" value={section.id} onChange={event => setActiveId(event.target.value)}>{sections.map((item, index) => <option key={item.id} value={item.id}>Section {index + 1} of {sections.length}</option>)}</select></label>
          <details><summary className="cursor-pointer text-xs font-medium">Reorder or move sections</summary><div className="mt-2 flex gap-2">
            <Button type="button" size="sm" variant="outline" disabled={locked || savingNext || sectionIndex === 0} onClick={() => moveSection(-1)}>Move up</Button>
            <Button type="button" size="sm" variant="outline" disabled={locked || savingNext || sectionIndex === sections.length - 1} onClick={() => moveSection(1)}>Move down</Button>
          </div>
          <p role="status" className="text-xs text-muted-foreground">Section {sectionIndex + 1} of {sections.length}. Move this section with all its values and extra rows. Changes save automatically.</p>
          {!columnId && <><Button type="button" size="sm" variant="outline" disabled={locked || savingNext} onClick={() => {
            const id = useCanvasStore.getState().moveCardSectionsToNewBox(nodeId, section.id);
            if (id) onNext(id);
          }}>Move from this section to new box</Button>
          <p className="text-xs text-muted-foreground">Moves section {sectionIndex + 1} and all following sections into a new box. Earlier sections stay here.{sectionIndex === 0 ? " This box will be left empty." : ""}</p></>}</details>
        </div>
        <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">How repeated fields work</summary>Repeat before or after to add fields on the same line. Press Enter inside a field for a new line.</details>
        <fieldset ref={fieldsRef} disabled={locked || savingNext} className="space-y-4">
          {expandedCardRows(template, section.values, section.rowRepeats).map(({ row, rowNumber, values, repeatId, copyNumber }) => <div key={repeatId || row.id} role="group" aria-label={`Row ${rowNumber}${repeatId ? ` repeat ${copyNumber}` : ""}`} className="space-y-3 rounded-md border p-3">
            <div className="space-y-2"><span className="text-sm font-medium">Row {rowNumber}{repeatId ? ` - Repeat ${copyNumber}` : ""}</span>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => repeatRow(row.id, repeatId, "before")}>Repeat before</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => repeatRow(row.id, repeatId, "after")}>Repeat after</Button>
                {repeatId && <Button type="button" size="sm" variant="ghost" onClick={() => removeRepeat(repeatId)}>Remove repeat</Button>}
              </div>
            </div>
            {row.fields.filter(field => field.kind !== "constant").map(field => <div key={field.id} className="space-y-1">
              <label htmlFor={`card-field-${field.id}${repeatId ? `-${repeatId}` : ""}`} className="text-sm font-medium">{field.label || "Unlabelled field"}</label>
              {field.kind === "sutra" && <SutraLookup label={field.label || "Unlabelled field"} onChoose={value => patch(field.id, value, repeatId)} />}
              <textarea id={`card-field-${field.id}${repeatId ? `-${repeatId}` : ""}`} rows={Math.min(8, Math.max(field.kind === "multiline" ? 3 : 1, (values[field.id]?.text ?? "").split("\n").length))}
                className={`${field.kind === "multiline" ? "min-h-24" : "min-h-9"} w-full resize-y rounded-md border bg-background p-2 text-sm`}
                value={values[field.id]?.text ?? ""} onChange={event => patch(field.id, { text: event.target.value }, repeatId)} />
              {(field.kind === "link" || field.kind === "sutra") && <>
                <Input aria-label={`${field.label} link`} placeholder="Optional link (https://…)" value={values[field.id]?.href ?? ""} onChange={event => patch(field.id, { href: event.target.value }, repeatId)} />
                {!!values[field.id]?.href && !safeCardLink(values[field.id].href) && <p className="text-xs text-destructive">Use a full https://, http:// or mailto: link. This value will display as plain text until corrected.</p>}
              </>}
            </div>)}
          </div>)}
          {extraRows.map((row, index) => <div key={index} className="space-y-2 rounded-md border p-3">
            <label className="block text-sm">My row {index + 1}<textarea aria-label={"My row " + (index + 1)} className="min-h-20 w-full rounded-md border bg-background p-2" value={row} onChange={event => setExtraRows(current => current.map((value, i) => i === index ? event.target.value : value), section.id + ":extra:" + index)} /></label>
            <Button type="button" size="sm" variant="ghost" onClick={() => setExtraRows(current => current.filter((_, i) => i !== index))}>Remove my row {index + 1}</Button>
          </div>)}
          <Button type="button" variant="outline" onClick={() => setExtraRows(current => [...current, ""])}>Add my own row</Button>
          <p className="text-xs text-muted-foreground">Your extra rows belong to this object only. {!columnId && "Use Arrange / edit text to move text anywhere and assign labels."}</p>
        </fieldset>
        <details className="rounded border p-3">
          <summary className="cursor-pointer text-sm">Preview text</summary>
          <div className="mt-2">
            <CardTemplatePreview template={template} sections={sections} />
          </div>
        </details>
        {!columnId && <details className="rounded border p-3">
          <summary className="cursor-pointer text-sm">Advanced: switch to free text</summary>
          <p className="my-2 text-xs text-muted-foreground">This switches this object from filling fields in this panel to editing text directly on the board. Close this panel to continue using fields and sections later.</p>
          <Button type="button" variant="outline" disabled={locked || savingNext} onClick={() => { onClose(); useCanvasStore.getState().arrangeCard(nodeId); }}>Arrange / edit text</Button>
          <Button type="button" variant="ghost" disabled={locked || savingNext} onClick={() => { useCanvasStore.getState().detachCardTemplate(nodeId); onClose(); }}>Detach template, keep text</Button>
        </details>}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" disabled={savingNext} onClick={onClose}>Close</Button>
          <Button type="button" variant="outline" disabled={locked || savingNext} onClick={addSection}>Add another section</Button>
          {!columnId && <Button type="button" disabled={locked || !available || savingNext} onClick={async () => {
            setSavingNext(true);
            // Content sync, size reporting and React Flow measurement each run
            // on a frame. Place the next card after the current card has expanded.
            for (let frame = 0; frame < 4; frame++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
            const id = create(template.id);
            if (id) onNext(id);
            else setSavingNext(false);
          }}>{savingNext ? "Creating..." : "New text object"}</Button>}
        </div>
      </form>
  </>;
  if (embedded) return <section data-card-fill-panel aria-label="Fill template" className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3 p-3" onKeyDown={event => event.stopPropagation()}>{content}</section>;
  return <Dialog open modal={false} onOpenChange={open => { if (!open && !savingNext) onClose(); }}>
    <DialogContent data-card-fill-panel onCloseAutoFocus={event => event.preventDefault()} className="top-4 bottom-4 right-4 left-auto w-[calc(100vw-2rem)] max-w-md translate-x-0 translate-y-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden" onInteractOutside={event => event.preventDefault()}>
      <DialogTitle className="sr-only">Fill template</DialogTitle><DialogDescription className="sr-only">Edit template fields. Changes save automatically.</DialogDescription>{content}
    </DialogContent>
  </Dialog>;
}
