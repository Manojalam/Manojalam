"use client";

import { TemplateUseActions } from "./TemplateUseActions";
import { ColorPicker } from "./ColorPicker";
import { useState } from "react";
import type { SampleLabel } from "@/lib/types";
import { sampleFields, resizeSampleField } from "@/lib/canvas/sample-templates";
import { captureTemplateStyle } from "@/lib/canvas/board-style-templates";
import { useCanvasStore } from "@/store/canvas-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FONT_OPTIONS } from "@/lib/fonts";

export function SampleTemplatesPanel() {
  const templates = useCanvasStore(state => state.settings.sampleTemplates);
  const selected = useCanvasStore(state => state.selectedNodeIds.length === 1 ? state.nodes.find(node => node.id === state.selectedNodeIds[0]) : undefined);
  const create = useCanvasStore(state => state.createSampleTemplate);
  const update = useCanvasStore(state => state.updateSampleTemplate);
  const openSample = useCanvasStore(state => state.openTemplateSample);
  const remove = useCanvasStore(state => state.deleteSampleTemplate);
  const [name, setName] = useState("");
  const [chosen, setChosen] = useState("");
  const [labelId, setLabelId] = useState("");
  const [deleting, setDeleting] = useState(false);
  const selectedId = selected?.data.sampleDesignId ?? selected?.data.sampleTemplateId;
  const template = templates?.find(item => item.id === chosen) ?? templates?.find(item => item.id === selectedId) ?? templates?.[0];
  const label = template?.labels.find(item => item.id === labelId) ?? template?.labels[0];
  const fields = template ? sampleFields(template.richText) : [];
  const patchLabel = (patch: Partial<SampleLabel>) => { if (template && label) update(template.id, { labels: template.labels.map(item => item.id === label.id ? { ...item, ...patch } : item) }); };
  const eligible = selected && ["table", "shape", "text", "sticky", "mindmap"].includes(selected.type ?? "") && !selected.data.cardTemplateId && !selected.data.sampleTemplateId && !selected.data.sampleDesignId && !selected.data.locked;
  return <section aria-label="Sample templates" className="space-y-3 border-b p-3">
    <h3 className="text-xs font-semibold">Saved object designs</h3>
    <p className="text-[11px] text-muted-foreground">Reuse saved tables and boxes. Optionally tag text with labels to make fillable cards.</p>
    {eligible ? <form className="flex gap-1" onSubmit={event => { event.preventDefault(); const id = create(selected.id, name); if (id) { setChosen(id); setName(""); } }}>
      <Input aria-label="Sample template name" placeholder="Object design name" value={name} onChange={event => setName(event.target.value)} />
      <Button type="submit" size="sm" disabled={!name.trim()}>Save object design</Button>
    </form> : !selectedId && <p className="text-[10px] text-muted-foreground">Select a table or box containing your example to start.</p>}
    {!!templates?.length && <label className="block text-[10px]">Saved designs<select aria-label="Sample template library" className="mt-1 h-8 w-full rounded border bg-background px-2 text-xs" value={template?.id ?? ""} onChange={event => { setChosen(event.target.value); setLabelId(""); }}>
      {templates.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select></label>}
    {template && <>
      <label className="block text-xs">Design name<Input key={`${template.id}-${template.name}`} aria-label="Saved template name" defaultValue={template.name} onBlur={event => { const name = event.target.value.trim(); if (name && name !== template.name) update(template.id, { name }); }} /></label>
      <p className="text-[11px] font-medium">{selected?.data.sampleDesignId === template.id ? "Editing the sample" : selected?.data.sampleTemplateId === template.id ? "Filling a card" : template.name}</p>
      <p className="text-[10px] text-muted-foreground">{!fields.length ? "Create new makes a separate copy. Apply changes the selected object in place." : selected?.data.sampleDesignId === template.id ? "Double-click the sample, select text, then click Label selected text in its toolbar. Untagged text stays fixed. Edit this sample to change the layout." : "Type directly into labeled boxes. Tab moves between fields. Add another repeats an empty section inside the same card."}</p>
      <div className="flex flex-wrap gap-1">
        <TemplateUseActions kind="sample" template={template} />
        <Button size="sm" variant="outline" onClick={() => openSample(template.id)}>Edit sample</Button>
      </div>
      <p className="text-[10px] text-muted-foreground">{template.table ? "Saved table designs keep headings, row labels, and styling. Created tables are independent copies." : "Sample edits update linked cards. Existing answers stay; newly tagged parts start empty. Each occurrence has its own answer."}</p>
      <label className="block text-xs">Default template font<select aria-label="Sample default font" className="mt-1 h-8 w-full rounded border bg-background px-2" value={String(template.style.fontFamily ?? "")} onChange={event => update(template.id, { style: { ...template.style, fontFamily: event.target.value || null } })}><option value="">Board default font</option>{FONT_OPTIONS.map(font => <option key={font.value} value={font.value}>{font.label}</option>)}</select></label>
      {!template.table && <details className="space-y-2" open={!!label}>
        <summary className="cursor-pointer text-xs font-medium">Label styles and behavior</summary>
        {label ? <>
          <select aria-label="Label to style" className="h-8 w-full rounded border bg-background px-2 text-xs" value={label.id} onChange={event => setLabelId(event.target.value)}>{template.labels.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <Input key={`${label.id}-${label.name}`} aria-label="Label name" defaultValue={label.name} onBlur={event => { if (event.target.value.trim() && event.target.value.trim() !== label.name) patchLabel({ name: event.target.value.trim() }); }} />
          <label className="block text-[10px]">Field behavior<select aria-label="Label behavior" className="mt-1 h-8 w-full rounded border bg-background px-2 text-xs" value={label.kind} onChange={event => patchLabel({ kind: event.target.value as SampleLabel["kind"] })}><option value="text">Your own text</option><option value="sutra">Text with sūtra lookup</option><option value="number">Automatic section number</option></select></label>
          <div className="flex flex-wrap gap-2">{([['color', 'Text'], ['background', 'Background'], ['borderColor', 'Outline']] as const).map(([key, title]) => <ColorPicker key={key} label={title + " for " + label.name} value={label[key] === "transparent" || label[key] === "inherit" ? undefined : label[key]} onChange={color => patchLabel({ [key]: color || (key === "color" ? "inherit" : "transparent") })} />)}</div>
          <label className="flex gap-2 text-[10px]"><input type="checkbox" checked={label.background === "transparent"} onChange={event => patchLabel({ background: event.target.checked ? "transparent" : "#ffffff" })} />Transparent field background</label>
          <select aria-label="Label font" className="h-8 w-full rounded border bg-background px-2 text-xs" value={label.fontFamily} onChange={event => patchLabel({ fontFamily: event.target.value })}><option value="inherit">Card font</option>{FONT_OPTIONS.map(font => <option key={font.value} value={font.value}>{font.label}</option>)}</select>
          <div className="grid grid-cols-3 gap-1">{([['fontSize','Size',6,120],['lineHeight','Spacing',1,4],['padding','Padding',0,32]] as const).map(([key, title, min, max]) => <label key={key} className="text-[10px]">{title}<Input key={`${label.id}-${key}-${label[key]}`} type="number" aria-label={`Label ${title.toLowerCase()}`} min={min} max={max} step={key === 'lineHeight' ? 0.1 : 1} defaultValue={label[key]} onBlur={event => { const value = Number(event.target.value); if (Number.isFinite(value) && value !== label[key]) patchLabel({ [key]: Math.max(min, Math.min(max, value)) }); }} /></label>)}</div>
          <div className="flex gap-1">{([['bold','Bold'],['italic','Italic'],['underline','Underline']] as const).map(([key,title]) => <Button key={key} size="sm" variant={label[key] ? "default" : "outline"} aria-pressed={label[key]} onClick={() => patchLabel({ [key]: !label[key] })}>{title}</Button>)}</div>
        </> : <p className="text-[10px] text-muted-foreground">Tag some sample text to create your first label.</p>}
      </details>}
      {template.table && <p className="text-xs text-muted-foreground">Edit column headings and row labels directly in the sample table. New tables start with empty cells.</p>}
      {!!fields.length && <details className="space-y-2"><summary className="cursor-pointer text-xs">Resize individual text boxes</summary>{fields.map((field, index) => <label key={field.id} className="flex items-center gap-2 text-[10px]"><span className="min-w-0 flex-1 truncate">{index + 1}. {template.labels.find(item => item.id === field.labelId)?.name}</span><Input className="h-7 w-20" type="number" min={60} max={1600} aria-label={`Field ${index + 1} width`} key={`${field.id}-${field.width}`} defaultValue={field.width} onBlur={event => { const width = Number(event.target.value); if (width !== field.width) update(template.id, { richText: resizeSampleField(template.richText, field.id, width) }); }} /></label>)}<p className="text-[10px] text-muted-foreground">Move tagged parts by cutting/pasting or dragging them in the sample. Add fixed text or tagged parts anywhere.</p></details>}
      {selected?.data.sampleDesignId === template.id && <Button size="sm" variant="outline" className="w-full text-[10px]" onClick={() => update(template.id, { style: captureTemplateStyle(selected.data) })}>Use sample’s current box styling</Button>}
      {deleting ? <div className="space-y-1 text-xs"><p>Delete this template? Existing content will remain as ordinary boxes.</p><Button size="sm" variant="destructive" onClick={() => { remove(template.id); setDeleting(false); }}>Delete template</Button><Button size="sm" variant="ghost" onClick={() => setDeleting(false)}>Cancel</Button></div> : <button className="text-[10px] text-muted-foreground underline" onClick={() => setDeleting(true)}>Delete saved design…</button>}
    </>}
  </section>;
}
