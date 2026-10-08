"use client";

import { templateInputFields } from "@/lib/canvas/card-templates";
import { FONT_OPTIONS } from "@/lib/fonts";
import { ColorPicker } from "./ColorPicker";
import { useState } from "react";
import type { BoardCardTemplate, CardTemplateField, CardTemplateRow } from "@/lib/types";
import { generateId } from "@/lib/utils";
import { CardTemplatePreview } from "./CardTemplatePreview";
import { useCanvasStore } from "@/store/canvas-store";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { placeTemplateField } from "@/lib/canvas/template-field-order";

function move<T>(items: T[], index: number, delta: number): T[] {
  const next = [...items];
  const target = index + delta;
  if (target < 0 || target >= items.length) return items;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function CardTemplateDesigner({ initial, onClose, onSaved }: { initial: BoardCardTemplate; onClose: () => void; onSaved: (id: string) => void }) {
  const [draft, setDraft] = useState(() => structuredClone(initial));
  const [draggedField, setDraggedField] = useState<string | null>(null);
  const save = useCanvasStore(state => state.saveCardTemplate);
  const saved = useCanvasStore(state => !!state.settings.cardTemplates?.some(template => template.id === initial.id));
  const linked = useCanvasStore(state => state.nodes.filter(node => node.data.cardTemplateId === initial.id).length);
  const patchRow = (id: string, patch: Partial<CardTemplateRow>) => setDraft(current => ({ ...current, rows: current.rows.map(row => row.id === id ? { ...row, ...patch } : row) }));
  const patchField = (row: CardTemplateRow, id: string, patch: Partial<CardTemplateField>) => patchRow(row.id, { fields: row.fields.map(field => field.id === id ? { ...field, ...patch } : field) });
  const newField = (): CardTemplateField => ({ id: generateId(), label: "New field", kind: "text", color: "" });
  const placeField = (fieldId: string, rowId: string, beforeId?: string) => setDraft(current => ({ ...current, rows: placeTemplateField(current.rows, fieldId, rowId, beforeId) }));
  const moveToNewRow = (fieldId: string, sourceRowId: string, side: "above" | "below") => setDraft(current => {
    const index = current.rows.findIndex(row => row.id === sourceRowId);
    if (index < 0) return current;
    const id = generateId();
    const rows = [...current.rows];
    rows.splice(index + (side === "below" ? 1 : 0), 0, { id, indent: current.rows[index].indent, fields: [] });
    return { ...current, rows: placeTemplateField(rows, fieldId, id) };
  });
  const valid = draft.name.trim() && draft.rows.length && draft.rows.every(row => row.fields.length);
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="h-[94vh] max-w-6xl grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden" onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
      <DialogHeader><DialogTitle>Design template</DialogTitle><DialogDescription>Arrange your own labels and fields. Each row becomes a line of text; fields on the same row flow together. Add any spaces or separators in the field text. Fill the actual answers after saving.</DialogDescription></DialogHeader>
      <div className="grid gap-6 overflow-y-auto lg:grid-cols-2 lg:overflow-hidden">
        <div className="space-y-4 lg:overflow-y-auto lg:pr-2">
          <p className="text-xs text-muted-foreground">{saved ? "Editing your saved template. Save template updates this design." : "Creating a new template. Save template adds it to your template library."}</p>
          <label className="block text-sm">Template name<Input aria-label="Template name" value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
          <div className="flex flex-wrap gap-3">
            {([['textColor', 'Default text']] as const).map(([key, label]) => <ColorPicker key={key} label={label} value={draft.style[key] || undefined} onChange={color => setDraft(current => ({ ...current, style: { ...current.style, [key]: color } }))} />)}
          </div>
          <p className="text-xs text-muted-foreground">Clear color to use the default. Fields without a color inherit the template text color.</p>
          <label className="block text-xs">Default font<select aria-label="Template default font" className="mt-1 h-9 w-full rounded-md border bg-background px-2" value={draft.style.fontFamily ?? ""} onChange={event => setDraft(current => ({ ...current, style: { ...current.style, fontFamily: event.target.value } }))}><option value="">Object default font</option>{FONT_OPTIONS.map(font => <option key={font.value} value={font.value}>{font.label}</option>)}</select></label>
          <div className="grid grid-cols-2 gap-2">
            {([['fontSize', 'Font size', 8, 100, 1], ['lineSpacing', 'Line spacing', 1, 4, 0.1]] as const).map(([key, label, min, max, step]) => <label key={key} className="text-xs">{label}<Input aria-label={label} type="number" min={min} max={max} step={step === 1 ? 1 : "any"} value={draft.style[key]} onChange={event => { const value = Number(event.target.value); setDraft({ ...draft, style: { ...draft.style, [key]: Math.min(max, Math.max(min, value)) } }); }} /></label>)}
          </div>
          <p className="text-xs text-muted-foreground">Field types: text, long text, link, searchable sūtra, or conditional constant. Labels guide filling and are never printed with the text.</p>
          <p className="text-xs text-muted-foreground">Drag a field by its handle to place it before another field or at the end of a row. Use Move field for precise placement with a keyboard or touch.</p>
          {draft.rows.map((row, index) => <section key={row.id} aria-label={`Template row ${index + 1}`} className="space-y-2 rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-1">
              <strong className="mr-auto text-xs">Row {index + 1}</strong>
              <Button type="button" size="sm" variant="ghost" aria-label={`Move row ${index + 1} up`} disabled={index === 0} onClick={() => setDraft({ ...draft, rows: move(draft.rows, index, -1) })}>↑</Button>
              <Button type="button" size="sm" variant="ghost" aria-label={`Move row ${index + 1} down`} disabled={index === draft.rows.length - 1} onClick={() => setDraft({ ...draft, rows: move(draft.rows, index, 1) })}>↓</Button>
              <Button type="button" size="sm" variant="ghost" disabled={draft.rows.length === 1} onClick={() => setDraft({ ...draft, rows: draft.rows.filter(item => item.id !== row.id) })}>Remove row</Button>
              <label className="flex items-center gap-1 text-xs">Indent (em)<Input aria-label={`Row ${index + 1} indent`} className="h-8 w-16" type="number" min={0} max={10} step={0.5} value={row.indent} onChange={event => patchRow(row.id, { indent: Math.max(0, Math.min(10, Number(event.target.value))) })} /></label>
            </div>
            <div className="flex flex-wrap items-center gap-1" role="group" aria-label={`Row ${index + 1} alignment`}>
              <span className="mr-1 text-xs">Align row</span>
              {(["left", "center", "right", "justify"] as const).map(alignment => <Button key={alignment} type="button" size="sm" variant={(row.textAlign ?? "left") === alignment ? "default" : "outline"} aria-label={`Row ${index + 1} align ${alignment}`} aria-pressed={(row.textAlign ?? "left") === alignment} onClick={() => patchRow(row.id, { textAlign: alignment })}>{alignment[0].toUpperCase() + alignment.slice(1)}</Button>)}
            </div>
            <details className="rounded border p-2">
              <summary className="cursor-pointer text-xs">Row styling</summary>
              <div className="mt-2 grid grid-cols-2 gap-2">

                <label className="text-xs">Line spacing<Input aria-label={`Row ${index + 1} line spacing`} type="number" min={1} max={4} step="any" placeholder="Template default" value={row.lineSpacing ?? ""} onChange={event => patchRow(row.id, { lineSpacing: event.target.value === "" ? undefined : Number(event.target.value) })} /></label>
              </div>
              <Button type="button" size="sm" variant="ghost" onClick={() => patchRow(row.id, { textAlign: undefined, lineSpacing: undefined, indent: 0 })}>Reset row styling</Button>
            </details>
            {row.fields.map((field, fieldIndex) => <div key={field.id} data-template-field={field.id} className="space-y-1 rounded border bg-muted/20 p-2"
              onDragOver={event => { if (draggedField) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } }}
              onDrop={event => { if (draggedField) { event.preventDefault(); event.stopPropagation(); placeField(draggedField, row.id, field.id); setDraggedField(null); } }}>
              <button type="button" draggable aria-label={`Drag ${field.label || "field"} to move`} className="cursor-grab text-xs text-muted-foreground active:cursor-grabbing"
                onDragStart={event => { setDraggedField(field.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", field.id); }} onDragEnd={() => setDraggedField(null)}>⠿ Drag field</button>
              <div className="flex gap-1">
                <Input aria-label={`Row ${index + 1} field ${fieldIndex + 1} label`} placeholder="Label (optional)" value={field.label} onChange={event => patchField(row, field.id, { label: event.target.value })} />
                <ColorPicker label={(field.label || "Field") + " value color"} value={field.color || undefined} onChange={color => patchField(row, field.id, { color })} />
              </div>
              <details className="rounded border p-2">
                <summary className="cursor-pointer text-xs">Field styling</summary>
                <div className="mt-2 space-y-2">
                  <label className="block text-xs">Font<select aria-label={`${field.label || "Field"} font`} className="mt-1 h-9 w-full rounded border bg-background px-2" value={field.fontFamily ?? ""} onChange={event => patchField(row, field.id, { fontFamily: event.target.value || undefined })}>
                    <option value="">Template default</option>{FONT_OPTIONS.map(font => <option key={font.value} value={font.value}>{font.label}</option>)}
                  </select></label>
                  <label className="block text-xs">Font size<Input aria-label={`${field.label || "Field"} font size`} type="number" min={8} max={100} step="any" placeholder="Template default" value={field.fontSize ?? ""} onChange={event => patchField(row, field.id, { fontSize: event.target.value === "" ? undefined : Number(event.target.value) })} /></label>
                  <div className="flex flex-wrap gap-2">{(["bold", "italic", "underline", "strike", "superscript", "subscript"] as const).map(key => <Button key={key} type="button" size="sm" variant={field[key] ? "default" : "outline"} aria-label={`${field.label || "Field"} ${key}`} aria-pressed={!!field[key]} onClick={() => patchField(row, field.id, { [key]: !field[key], ...(key === "superscript" ? { subscript: false } : key === "subscript" ? { superscript: false } : {}) })}>{key[0].toUpperCase() + key.slice(1)}</Button>)}</div>
                  <ColorPicker label={`${field.label || "Field"} highlight`} value={field.highlightColor || undefined} onChange={highlightColor => patchField(row, field.id, { highlightColor })} />
                  <p className="text-xs text-muted-foreground">Alignment and spacing apply to the whole row. Use the row controls above.</p>
                  <Button type="button" size="sm" variant="ghost" onClick={() => patchField(row, field.id, { fontFamily: undefined, fontSize: undefined, bold: undefined, italic: undefined, underline: undefined, strike: undefined, superscript: undefined, subscript: undefined, highlightColor: undefined, color: "" })}>Reset field styling</Button>
                </div>
              </details>
              {field.kind === "multipart" && <div className="space-y-2 rounded border p-2">
                <p className="text-xs">Each part has its own type. Add parts before or after any part. Constants are fixed text; include your own spaces.</p>
                {!field.parts?.some(part => part.kind !== "constant") && <p className="text-xs text-muted-foreground">Add a text, link, or sūtra part. A group containing only constants stays hidden.</p>}
                {(field.parts ?? []).map((part, partIndex) => {
                  const patchPart = (patch: Partial<CardTemplateField>) => patchField(row, field.id, { parts: field.parts!.map(item => item.id === part.id ? { ...item, ...patch } : item) });
                  return <div key={part.id} className="space-y-2 rounded border p-2" aria-label={`Part ${partIndex + 1} of ${field.label}`}>
                    <span className="block text-xs font-semibold">Part {partIndex + 1}</span>
                    {part.kind !== "constant" && <label className="block text-xs">Input name (shown when filling)<Input aria-label={`Part ${partIndex + 1} label`} value={part.label} onChange={event => patchPart({ label: event.target.value })} /></label>}
                    <label className="block text-xs">Part type<select aria-label={`Part ${partIndex + 1} type`} className="h-8 rounded border bg-background px-2 text-xs" value={part.kind} onChange={event => patchPart({ kind: event.target.value as CardTemplateField['kind'] })}>
                      <option value="text">Text</option><option value="multiline">Long text</option><option value="constant">Constant</option><option value="sutra">Sūtra lookup</option><option value="link">Link</option>
                    </select></label>
                    {part.kind === "constant" && <label className="block text-xs">Constant text (printed as written)<textarea aria-label={`Part ${partIndex + 1} constant text`} className="w-full rounded border bg-background p-2" rows={1} value={part.constantText ?? ""} onChange={event => patchPart({ constantText: event.target.value })} /></label>}
                    {part.kind === "constant" && <label className="block text-xs">Show only when<select aria-label={`Part ${partIndex + 1} show when`} className="mt-1 w-full rounded border bg-background p-1 text-xs" value={part.constantWhenFieldId ?? ""} onChange={event => patchPart({ constantWhenFieldId: event.target.value || undefined })}>
                      <option value="">Any input in this multi-part field is filled</option>
                      {part.constantWhenFieldId && !field.parts?.some(input => input.kind !== "constant" && input.id === part.constantWhenFieldId) && <option value={part.constantWhenFieldId}>Input missing — choose another</option>}
                      {field.parts?.filter(input => input.kind !== "constant").map(input => <option key={input.id} value={input.id}>{input.label || "Unnamed input"} is filled</option>)}
                    </select></label>}
                    <div className="flex flex-wrap gap-1">
                      <Button type="button" size="sm" variant="outline" onClick={() => patchField(row, field.id, { parts: [...field.parts!.slice(0, partIndex), { ...newField(), label: "New part" }, ...field.parts!.slice(partIndex)] })}>Add part before</Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => patchField(row, field.id, { parts: [...field.parts!.slice(0, partIndex + 1), { ...newField(), label: "New part" }, ...field.parts!.slice(partIndex + 1)] })}>Add part after</Button>
                      {part.kind !== "constant" && <Button type="button" size="sm" variant="outline" aria-label={`Wrap part ${partIndex + 1} in brackets`} onClick={() => patchField(row, field.id, { parts: [...field.parts!.slice(0, partIndex), { ...newField(), label: "Opening bracket", kind: "constant", constantText: "[", constantWhenFieldId: part.id }, part, { ...newField(), label: "Closing bracket", kind: "constant", constantText: "]", constantWhenFieldId: part.id }, ...field.parts!.slice(partIndex + 1)] })}>Wrap in [ ]</Button>}
                    </div>
                    <div className="space-y-2 rounded border p-2" role="group" aria-label={`Part ${partIndex + 1} styling`}>
                      <p className="text-xs font-semibold">Part styling</p>
                      <ColorPicker label={`Part ${partIndex + 1} highlight`} value={part.highlightColor || undefined} onChange={highlightColor => patchPart({ highlightColor })} />
                      <ColorPicker label={`Part ${partIndex + 1} text color`} value={part.color || undefined} onChange={color => patchPart({ color })} />
                      <label className="block text-xs">Font<select className="mt-1 h-9 w-full rounded border bg-background px-2" aria-label={`Part ${partIndex + 1} font`} value={part.fontFamily ?? ""} onChange={event => patchPart({ fontFamily: event.target.value || undefined })}><option value="">Field default</option>{FONT_OPTIONS.map(font => <option key={font.value} value={font.value}>{font.label}</option>)}</select></label>
                      <label className="block text-xs">Font size<Input aria-label={`Part ${partIndex + 1} font size`} type="number" step="any" placeholder="Field default" value={part.fontSize ?? ""} min={8} max={100} onChange={event => patchPart({ fontSize: event.target.value ? Number(event.target.value) : undefined })} /></label>
                      <div className="flex flex-wrap gap-1">{(["bold", "italic", "underline", "strike", "superscript", "subscript"] as const).map(key => <Button key={key} type="button" aria-label={`Part ${partIndex + 1} ${key}`} aria-pressed={!!(part[key] ?? field[key])} variant={(part[key] ?? field[key]) ? "default" : "outline"} size="sm" onClick={() => patchPart({ [key]: !(part[key] ?? field[key]), ...(key === "superscript" ? { subscript: false } : key === "subscript" ? { superscript: false } : {}) })}>{key[0].toUpperCase() + key.slice(1)}</Button>)}</div>
                      <Button type="button" size="sm" variant="ghost" onClick={() => patchPart({ fontFamily: undefined, fontSize: undefined, bold: undefined, italic: undefined, underline: undefined, strike: undefined, superscript: undefined, subscript: undefined, highlightColor: undefined, color: "" })}>Reset part styling</Button>
                    </div>
                    <Button type="button" size="sm" variant="ghost" disabled={partIndex === 0} onClick={() => patchField(row, field.id, { parts: move(field.parts!, partIndex, -1) })}>Move part left</Button>
                    <Button type="button" size="sm" variant="ghost" disabled={partIndex === field.parts!.length - 1} onClick={() => patchField(row, field.id, { parts: move(field.parts!, partIndex, 1) })}>Move part right</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => patchField(row, field.id, { parts: field.parts!.filter(item => item.id !== part.id) })}>Remove part</Button>
                  </div>;
                })}
                <Button type="button" size="sm" variant="outline" onClick={() => patchField(row, field.id, { parts: [...(field.parts ?? []), { ...newField(), label: 'New part' }] })}>Add part</Button>
              </div>}
              {field.kind === "constant" && <div className="space-y-2">
                <label className="block text-xs">Constant text<textarea aria-label={`${field.label || "Field"} constant text`} className="mt-1 w-full rounded border bg-background p-2" rows={1} placeholder=" + , [ , ] , → …" value={field.constantText ?? ""} onChange={event => patchField(row, field.id, { constantText: event.target.value })} /></label>
                <label className="block text-xs">Show only when<select aria-label={`${field.label || "Field"} show when`} className="mt-1 h-9 w-full rounded border bg-background px-2" value={field.constantWhenFieldId ?? ""} onChange={event => patchField(row, field.id, { constantWhenFieldId: event.target.value || undefined })}>
                  <option value="">Any input in this row is filled</option>
                  {field.constantWhenFieldId && !row.fields.some(input => input.kind !== "constant" && input.id === field.constantWhenFieldId) && <option value={field.constantWhenFieldId}>Field missing — choose another</option>}
                  {row.fields.filter(input => input.kind !== "constant").map(input => <option key={input.id} value={input.id}>{input.label || "Unlabelled field"} is filled</option>)}
                </select></label>
                <p className="text-xs text-muted-foreground">Include your own spaces. For brackets, add one constant before and one after the field, both depending on that field.</p>
              </div>}
              <div className="flex flex-wrap items-center gap-1">
                <select aria-label={`${field.label || 'Field'} field type`} className="h-8 rounded border bg-background px-1 text-xs" value={field.kind} onChange={event => patchField(row, field.id, { kind: event.target.value as CardTemplateField['kind'], ...(event.target.value === 'multipart' && !field.parts?.length ? { id: generateId(), parts: [{ ...field, parts: undefined, kind: field.kind === 'multipart' ? 'text' : field.kind }] } : {}) })}>
                  <option value="text">Text</option><option value="multiline">Long text</option><option value="link">Link</option><option value="sutra">Sūtra lookup</option><option value="constant">Constant</option><option value="multipart">Multi-part field</option>
                </select>
                <Button type="button" size="sm" variant="ghost" aria-label={`Move ${field.label} left`} disabled={fieldIndex === 0} onClick={() => patchRow(row.id, { fields: move(row.fields, fieldIndex, -1) })}>←</Button>
                <Button type="button" size="sm" variant="ghost" aria-label={`Move ${field.label} right`} disabled={fieldIndex === row.fields.length - 1} onClick={() => patchRow(row.id, { fields: move(row.fields, fieldIndex, 1) })}>→</Button>
                <select aria-label={`Move ${field.label || "field"}`} className="h-8 max-w-full rounded border bg-background px-1 text-xs" value="" onChange={event => {
                  if (event.target.value === "above" || event.target.value === "below") moveToNewRow(field.id, row.id, event.target.value);
                  else { const [targetRow, before] = JSON.parse(event.target.value) as [string, string?]; placeField(field.id, targetRow, before); }
                }}>
                  <option value="" disabled>Move field...</option>
                  {draft.rows.map((item, i) => <optgroup key={item.id} label={`Row ${i + 1}`}>
                    {item.fields.filter(target => target.id !== field.id).map(target => <option key={target.id} value={JSON.stringify([item.id, target.id])}>Before {target.label || "unlabelled field"}</option>)}
                    <option value={JSON.stringify([item.id])}>End of row {i + 1}</option>
                  </optgroup>)}
                  <option value="above">New row above</option><option value="below">New row below</option>
                </select>
                <Button type="button" size="sm" variant="ghost" disabled={row.fields.length === 1} onClick={() => patchRow(row.id, { fields: row.fields.filter(item => item.id !== field.id) })}>Remove field</Button>
              </div>
            </div>)}
            {draggedField && <div className="rounded border border-dashed p-3 text-center text-xs text-muted-foreground"
              onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}
              onDrop={event => { event.preventDefault(); placeField(draggedField, row.id); setDraggedField(null); }}>Drop at end of row {index + 1}</div>}
            <Button type="button" size="sm" variant="outline" onClick={() => patchRow(row.id, { fields: [...row.fields, newField()] })}>Add field to row {index + 1}</Button>
          </section>)}
          <Button type="button" variant="outline" onClick={() => setDraft({ ...draft, rows: [...draft.rows, { id: generateId(), indent: 0, fields: [newField()] }] })}>Add row</Button>
        </div>
        <div className="min-w-0 space-y-3 lg:overflow-y-auto">
          <h3 className="font-medium">Text preview</h3>
          <p className="text-xs text-muted-foreground">Field names below are sample text for previewing the design. Objects show only your filled values.</p>
          <div className="rounded-md border p-2">
            <CardTemplatePreview template={draft} values={Object.fromEntries(draft.rows.flatMap(row => templateInputFields(row.fields).map(field => [field.id, { text: field.label || "Sample text" }])))}/>
          </div>
          {!!linked && <p className="text-xs text-muted-foreground">Saving updates the design of {linked} existing objects. Their field values are retained, including values of removed fields, so undo can restore them.</p>}
        </div>
      </div>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="button" disabled={!valid} onClick={() => { save(draft); onSaved(draft.id); }}>Save template</Button></div>
    </DialogContent>
  </Dialog>;
}
