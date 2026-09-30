"use client";

import { useState } from "react";
import { useCanvasStore } from "@/store/canvas-store";
import { supportsStyleTemplate, captureTemplateStyle } from "@/lib/canvas/board-style-templates";
import { AppColorPicker } from "./AppColorPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BoardStyleTemplate } from "@/lib/types";
import { generateId } from "@/lib/utils";
import { CardTemplatesPanel } from "./CardTemplatesPanel";
import { SampleTemplatesPanel } from "./SampleTemplatesPanel";
import { CrossBoardTemplateLibrary } from "./CrossBoardTemplateLibrary";

function ColorControl({ label, value, onChange, compact = false }: { label: string; value?: string; onChange: (color: string) => void; compact?: boolean }) {
  return <AppColorPicker value={value} onChange={onChange}>
    <button type="button" aria-label={label} title={`${label}: ${value ?? "inherit"}`} className="flex h-7 items-center gap-2 rounded border px-2 text-xs">
      <span className="h-4 w-4 rounded border" style={{ background: value ?? "transparent" }} />{!compact && label}
    </button>
  </AppColorPicker>;
}

export function BoardStyleTemplatesPanel({ showCrossBoardLibrary = true }: { showCrossBoardLibrary?: boolean } = {}) {
  const boardId = useCanvasStore(state => state.board?.id);
  const nodes = useCanvasStore(state => state.nodes);
  const selectedIds = useCanvasStore(state => state.selectedNodeIds);
  const templates = useCanvasStore(state => state.settings.styleTemplates);
  const create = useCanvasStore(state => state.createStyleTemplate);
  const update = useCanvasStore(state => state.updateStyleTemplate);
  const apply = useCanvasStore(state => state.applyStyleTemplate);
  const detach = useCanvasStore(state => state.detachStyleTemplate);
  const remove = useCanvasStore(state => state.deleteStyleTemplate);
  const insert = useCanvasStore(state => state.createFromStyleTemplate);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState("");
  const [deleteId, setDeleteId] = useState("");
  const selected = nodes.filter(node => selectedIds.includes(node.id) && supportsStyleTemplate(node) && !node.data.locked);
  const fieldCardSelected = selectedIds.length === 1 && nodes.some(node => node.id === selectedIds[0] && node.data.cardTemplateId);
  const linkedId = selected.length === 1 ? selected[0].data.styleTemplateId : undefined;
  const template = templates?.find(item => item.id === (editingId || linkedId)) ?? templates?.[0];
  const linkedCount = template ? nodes.filter(node => node.data.styleTemplateId === template.id).length : 0;
  const patch = (value: Partial<Pick<BoardStyleTemplate, "name" | "style" | "roles">>) => { if (template) update(template.id, value); };

  return <>{showCrossBoardLibrary && <CrossBoardTemplateLibrary key={boardId} />}{fieldCardSelected && <CardTemplatesPanel />}<SampleTemplatesPanel />{!fieldCardSelected && <details className="border-b p-3"><summary className="cursor-pointer text-xs">Fillable card templates</summary><CardTemplatesPanel /></details>}<section aria-label="Linked styles" className="space-y-3 border-b p-3">
    <h3 className="text-xs font-semibold">Linked styles</h3>
    <p className="text-[10px] text-muted-foreground">Keep colors, fonts, borders and text roles consistent across linked boxes. Edit a style here to update all boxes using it.</p>
    {selected.length === 1 && <form className="flex gap-1" onSubmit={event => {
      event.preventDefault();const id = create(selected[0].id, name);if (id) { setEditingId(id);setName(""); }
    }}>
      <Input aria-label="New style name" placeholder="Style name" value={name} onChange={event => setName(event.target.value)} className="h-8 text-xs" />
      <Button type="submit" size="sm" disabled={!name.trim()} className="h-8">Create</Button>
    </form>}
    {!templates?.length && <p className="text-[10px] text-muted-foreground">Select one box to create your first linked style.</p>}
    {!!templates?.length && <>
      <select aria-label="Linked style" className="h-8 w-full rounded border bg-background px-2 text-xs" value={template?.id ?? ""} onChange={event => { setEditingId(event.target.value);setDeleteId(""); }}>
        {templates.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      {template && <>
        <p className="text-[10px] text-muted-foreground">{linkedCount} linked {linkedCount === 1 ? "box" : "boxes"}{linkedId === template.id ? " · This box is linked" : ""}</p>
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="outline" className="h-7 text-[10px]" disabled={!selected.length} onClick={() => apply(template.id, selected.map(node => node.id))}>Apply to selection</Button>
          <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => insert(template.id)}>New box</Button>
          {selected.some(node => node.data.styleTemplateId) && <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => detach(selected.map(node => node.id))}>Detach selection</Button>}
        </div>
        <details key={template.id} className="space-y-2">
          <summary className="cursor-pointer text-xs font-medium">Edit style</summary>
          <p className="text-[10px] text-muted-foreground">Changes here update all {linkedCount} linked {linkedCount === 1 ? "box" : "boxes"}. Text stays independent.</p>
          <label className="block text-[10px]">Style name<Input key={`${template.id}-${template.name}`} aria-label="Style name" defaultValue={template.name} className="h-7 text-xs" onBlur={event => { const value = event.target.value.trim();if (value && value !== template.name) patch({ name: value }); }} /></label>
          <div className="flex flex-wrap gap-1">
            {([['fillColor', 'Fill'], ['borderColor', 'Border'], ['textColor', 'Unassigned text']] as const).map(([key, label]) => <ColorControl key={key} label={`Style ${label.toLowerCase()} color`} value={typeof template.style[key] === "string" ? template.style[key] as string : undefined} onChange={color => patch({ style: { [key]: color } })} />)}
          </div>
          <label className="block text-[10px]">Font size<Input key={`${template.id}-${template.style.fontSize}`} type="number" min={6} max={200} aria-label="Style font size" defaultValue={Number(template.style.fontSize) || 14} className="h-7 text-xs" onBlur={event => { const size = Number(event.target.value);if (size >= 6 && size <= 200 && size !== template.style.fontSize) patch({ style: { fontSize: size } }); }} /></label>
          <p className="text-xs font-medium">Text role names and colors</p>
          <p className="text-[10px] text-muted-foreground">To assign a role: double-click the box text, select the words, then click a role button under “Apply role to selected text” in the text toolbar. The fields below only rename roles.</p>
          {template.roles.map(role => <div key={role.id} className="flex items-center gap-1">
            <Input key={`${role.id}-${role.name}`} aria-label={`Role name: ${role.name}`} defaultValue={role.name} className="h-7 min-w-0 text-xs" onBlur={event => {const value=event.target.value.trim();if(value && value !== role.name) patch({roles:template.roles.map(item=>item.id===role.id?{...item,name:value}:item)});}} />
            <ColorControl compact label={`${role.name} color`} value={role.color} onChange={color => patch({ roles: template.roles.map(item => item.id === role.id ? { ...item, color } : item) })} />
          </div>)}
          <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => patch({ roles: [...template.roles, { id: `role_${generateId().replace(/-/g, "")}`, name: "New role", color: "#2878ff" }] })}>Add text role</Button>
          {selected.length === 1 && <Button size="sm" variant="outline" className="h-7 w-full text-[10px]" onClick={() => patch({ style: captureTemplateStyle(selected[0].data) })}>Update style from selected box</Button>}
          <p className="text-[10px] text-muted-foreground">Box-only style edits remain local until that shared setting changes. Detach to stop receiving linked style updates.</p>
          {deleteId === template.id ? <div className="space-y-1 text-[10px]">
            <p>Delete this style? Linked boxes keep their current appearance.</p>
            <Button variant="destructive" size="sm" onClick={() => { remove(template.id);setDeleteId("");setEditingId(""); }}>Delete style</Button>
            <Button variant="ghost" size="sm" onClick={() => setDeleteId("")}>Cancel</Button>
          </div> : <Button variant="ghost" size="sm" className="h-7 text-[10px] text-destructive" onClick={() => setDeleteId(template.id)}>Delete style…</Button>}
        </details>
      </>}
    </>}
  </section></>;
}
