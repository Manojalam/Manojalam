"use client";

import { useState } from "react";
import type { BoardCardTemplate, CardTemplateField, CardTemplateRow } from "@/lib/types";
import { generateId } from "@/lib/utils";
import { CardTemplatePreview } from "./CardTemplatePreview";
import { useCanvasStore } from "@/store/canvas-store";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function move<T>(items: T[], index: number, delta: number): T[] {
  const next = [...items];
  const target = index + delta;
  if (target < 0 || target >= items.length) return items;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function CardTemplateDesigner({ initial, onClose, onSaved }: { initial: BoardCardTemplate; onClose: () => void; onSaved: (id: string) => void }) {
  const [draft, setDraft] = useState(() => structuredClone(initial));
  const save = useCanvasStore(state => state.saveCardTemplate);
  const linked = useCanvasStore(state => state.nodes.filter(node => node.data.cardTemplateId === initial.id).length);
  const patchRow = (id: string, patch: Partial<CardTemplateRow>) => setDraft(current => ({ ...current, rows: current.rows.map(row => row.id === id ? { ...row, ...patch } : row) }));
  const patchField = (row: CardTemplateRow, id: string, patch: Partial<CardTemplateField>) => patchRow(row.id, { fields: row.fields.map(field => field.id === id ? { ...field, ...patch } : field) });
  const newField = (): CardTemplateField => ({ id: generateId(), label: "New field", kind: "text", color: "#334155" });
  const valid = draft.name.trim() && draft.rows.length && draft.rows.every(row => row.fields.length);
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="h-[94vh] max-w-6xl grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden" onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
      <DialogHeader><DialogTitle>Design card template</DialogTitle><DialogDescription>Arrange your own labels and fields. Each row becomes a line on the card; fields on the same row flow together. Add any spaces or separators in the field text. Fill the actual answers after saving.</DialogDescription></DialogHeader>
      <div className="grid gap-6 overflow-y-auto lg:grid-cols-2 lg:overflow-hidden">
        <div className="space-y-4 lg:overflow-y-auto lg:pr-2">
          <label className="block text-sm">Template name<Input aria-label="Card template name" value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
          <div className="flex flex-wrap gap-3">
            {([['fillColor', 'Background'], ['borderColor', 'Border'], ['textColor', 'Default text']] as const).map(([key, label]) => <label key={key} className="text-xs">{label}<input aria-label={`${label} color`} type="color" className="ml-1 h-7 w-9 align-middle" value={draft.style[key]} onChange={event => setDraft({ ...draft, style: { ...draft.style, [key]: event.target.value } })} /></label>)}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {([['fontSize', 'Font size', 8, 100, 1], ['lineSpacing', 'Line spacing', 1, 4, 0.1], ['width', 'Card width', 240, 2400, 20]] as const).map(([key, label, min, max, step]) => <label key={key} className="text-xs">{label}<Input aria-label={label} type="number" min={min} max={max} step={step} value={draft.style[key]} onChange={event => { const value = Number(event.target.value); setDraft({ ...draft, style: { ...draft.style, [key]: Math.min(max, Math.max(min, value)) } }); }} /></label>)}
          </div>
          <p className="text-xs text-muted-foreground">Field types: text, long text, link, or searchable sūtra. Labels guide filling and are never printed on the card.</p>
          {draft.rows.map((row, index) => <section key={row.id} aria-label={`Template row ${index + 1}`} className="space-y-2 rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-1">
              <strong className="mr-auto text-xs">Row {index + 1}</strong>
              <Button type="button" size="sm" variant="ghost" aria-label={`Move row ${index + 1} up`} disabled={index === 0} onClick={() => setDraft({ ...draft, rows: move(draft.rows, index, -1) })}>↑</Button>
              <Button type="button" size="sm" variant="ghost" aria-label={`Move row ${index + 1} down`} disabled={index === draft.rows.length - 1} onClick={() => setDraft({ ...draft, rows: move(draft.rows, index, 1) })}>↓</Button>
              <Button type="button" size="sm" variant="ghost" disabled={draft.rows.length === 1} onClick={() => setDraft({ ...draft, rows: draft.rows.filter(item => item.id !== row.id) })}>Remove row</Button>
              <label className="flex items-center gap-1 text-xs">Indent (em)<Input aria-label={`Row ${index + 1} indent`} className="h-8 w-16" type="number" min={0} max={10} step={0.5} value={row.indent} onChange={event => patchRow(row.id, { indent: Math.max(0, Math.min(10, Number(event.target.value))) })} /></label>
            </div>
            {row.fields.map((field, fieldIndex) => <div key={field.id} className="space-y-1 rounded border bg-muted/20 p-2">
              <div className="flex gap-1">
                <Input aria-label={`Row ${index + 1} field ${fieldIndex + 1} label`} placeholder="Label (optional)" value={field.label} onChange={event => patchField(row, field.id, { label: event.target.value })} />
                <input type="color" aria-label={`${field.label || 'Field'} value color`} className="h-9 w-10 shrink-0" value={field.color} onChange={event => patchField(row, field.id, { color: event.target.value })} />
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <select aria-label={`${field.label || 'Field'} field type`} className="h-8 rounded border bg-background px-1 text-xs" value={field.kind} onChange={event => patchField(row, field.id, { kind: event.target.value as CardTemplateField['kind'] })}>
                  <option value="text">Text</option><option value="multiline">Long text</option><option value="link">Link</option><option value="sutra">Sūtra lookup</option>
                </select>
                <Button type="button" size="sm" variant="ghost" aria-label={`Move ${field.label} left`} disabled={fieldIndex === 0} onClick={() => patchRow(row.id, { fields: move(row.fields, fieldIndex, -1) })}>←</Button>
                <Button type="button" size="sm" variant="ghost" aria-label={`Move ${field.label} right`} disabled={fieldIndex === row.fields.length - 1} onClick={() => patchRow(row.id, { fields: move(row.fields, fieldIndex, 1) })}>→</Button>
                <select aria-label={`Move ${field.label} to row`} className="h-8 rounded border bg-background px-1 text-xs" value={row.id} onChange={event => {
                  const target = event.target.value;
                  setDraft({ ...draft, rows: draft.rows.map(item => item.id === row.id ? { ...item, fields: item.fields.filter(f => f.id !== field.id) } : item.id === target ? { ...item, fields: [...item.fields, field] } : item).filter(item => item.fields.length) });
                }}>{draft.rows.map((item, i) => <option key={item.id} value={item.id}>Row {i + 1}</option>)}</select>
                <Button type="button" size="sm" variant="ghost" disabled={row.fields.length === 1} onClick={() => patchRow(row.id, { fields: row.fields.filter(item => item.id !== field.id) })}>Remove field</Button>
              </div>
            </div>)}
            <Button type="button" size="sm" variant="outline" onClick={() => patchRow(row.id, { fields: [...row.fields, newField()] })}>Add field to row {index + 1}</Button>
          </section>)}
          <Button type="button" variant="outline" onClick={() => setDraft({ ...draft, rows: [...draft.rows, { id: generateId(), indent: 0, fields: [newField()] }] })}>Add row</Button>
        </div>
        <div className="min-w-0 space-y-3 lg:overflow-y-auto">
          <h3 className="font-medium">Card preview</h3>
          <p className="text-xs text-muted-foreground">The dots show where you will fill each card. Long content wraps onto the next line.</p>
          <div className="rounded-md border p-2">
            <CardTemplatePreview template={draft} />
          </div>
          {!!linked && <p className="text-xs text-muted-foreground">Saving updates the design of {linked} existing cards. Their field values are retained, including values of removed fields, so undo can restore them.</p>}
        </div>
      </div>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="button" disabled={!valid} onClick={() => { save(draft); onSaved(draft.id); }}>Save template</Button></div>
    </DialogContent>
  </Dialog>;
}
