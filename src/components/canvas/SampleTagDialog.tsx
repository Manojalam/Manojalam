"use client";

import { useState } from "react";
import type { Editor } from "@tiptap/core";
import type { SampleCardTemplate, SampleLabel } from "@/lib/types";
import { newSampleLabel } from "@/lib/canvas/sample-templates";
import { tagSampleSelection } from "@/lib/canvas/sample-field";
import { colorSwatchHex, normalizeHexColor } from "@/lib/canvas/custom-colors";
import { useCanvasStore } from "@/store/canvas-store";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function SampleTagDialog({ editor, template, selection, onClose }: { editor: Editor; template: SampleCardTemplate; selection: { from: number; to: number; width: number; format: Partial<SampleLabel> }; onClose: () => void }) {
  const [existing, setExisting] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const update = useCanvasStore(state => state.updateSampleTemplate);
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
      <DialogHeader><DialogTitle>Label selected text</DialogTitle><DialogDescription>The sample keeps this text. New cards show an empty text box with your label. Reusing a label shares its style, not its answer.</DialogDescription></DialogHeader>
      <p className="max-h-24 overflow-y-auto rounded bg-muted p-2 text-sm">{editor.state.doc.textBetween(selection.from, selection.to, " ")}</p>
      <form className="space-y-3" onSubmit={event => {
        event.preventDefault();
        const start = editor.state.doc.resolve(selection.from);
        const end = editor.state.doc.resolve(selection.to);
        let nested = start.parent.type.name === "sampleField";
        editor.state.doc.nodesBetween(selection.from, selection.to, node => { if (node.type.name === "sampleField") nested = true; });
        if (start.parent !== end.parent || nested) { setError("Select untagged text within one paragraph. Tag separate paragraphs individually."); return; }
        const attributes = editor.getAttributes("textStyle");
        const label = template.labels.find(item => item.id === existing) ?? {
          ...newSampleLabel(crypto.randomUUID(), name.trim()),
          fontSize: Number.parseFloat(attributes.fontSize) || Number(template.style.fontSize) || 20,
          fontFamily: attributes.fontFamily || String(template.style.fontFamily || "inherit"),
          bold: editor.isActive("bold"), italic: editor.isActive("italic"), underline: editor.isActive("underline"),
          ...selection.format,
          color: colorSwatchHex(selection.format.color) ?? normalizeHexColor(attributes.color) ?? normalizeHexColor(template.style.textColor) ?? "#2563eb",
        };
        if (!label.name) return;
        if (!existing) update(template.id, { labels: [...template.labels, label] });
        if (tagSampleSelection(editor, selection.from, selection.to, label.id, label.name, selection.width)) onClose();
      }}>
        {!!template.labels.length && <label className="block text-sm">Reuse a label<select aria-label="Existing sample label" className="mt-1 h-9 w-full rounded border bg-background px-2" value={existing} onChange={event => setExisting(event.target.value)}><option value="">Create a new label</option>{template.labels.map(label => <option key={label.id} value={label.id}>{label.name}</option>)}</select></label>}
        {!existing && <label className="block text-sm">Your label<Input autoFocus aria-label="New sample label" placeholder="Any name you choose" value={name} onChange={event => setName(event.target.value)} /></label>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={!existing && !name.trim()}>Tag text</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}
