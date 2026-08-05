"use client";

import { useState, type FormEvent } from "react";
import type { MemorizationStatus, ShlokaCardNodeData } from "@/lib/types";
import {
  shlokaCardEditorDraft,
  shlokaCardEditorPatch,
  type ShlokaCardEditorDraft,
} from "@/lib/canvas/shloka-card-editor";
import { useCanvasStore } from "@/store/canvas-store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { devanagariToIast } from "@/lib/sanskrit/transliterate";

interface ShlokaCardEditorDialogProps {
  nodeId: string;
  data: ShlokaCardNodeData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShlokaCardEditorDialog({
  nodeId,
  data,
  open,
  onOpenChange,
}: ShlokaCardEditorDialogProps) {
  const pushHistory = useCanvasStore((state) => state.pushHistory);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const [draft, setDraft] = useState<ShlokaCardEditorDraft>(() => shlokaCardEditorDraft(data));

  const setField = <Key extends keyof ShlokaCardEditorDraft>(
    key: Key,
    value: ShlokaCardEditorDraft[Key]
  ) => setDraft((current) => ({ ...current, [key]: value }));

  const setDevanagari = (value: string) => setDraft((current) => ({
    ...current,
    devanagari: value,
    iast: devanagariToIast(value),
  }));

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    pushHistory();
    updateNodeData(nodeId, shlokaCardEditorPatch(draft));
    onOpenChange(false);
  };

  const fieldId = (field: string) => `shloka-${nodeId}-${field}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[88vh] max-w-3xl overflow-y-auto"
        onPointerDown={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>Edit Śloka card</DialogTitle>
          <DialogDescription>
            {data.studySection
              ? `Update this ${data.title || data.studySection} card. Saving creates one undo step.`
              : "Update the verse and its study sections. Saving creates one undo step."}
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={save}>
          <div className={data.studySection && data.studySection !== "memorization"
            ? "grid gap-3"
            : "grid gap-3 sm:grid-cols-[1fr_180px]"}
          >
            <div className="space-y-1.5">
              <Label htmlFor={fieldId("title")}>Title</Label>
              <Input
                id={fieldId("title")}
                value={draft.title}
                onChange={(event) => setField("title", event.target.value)}
                placeholder="Verse title"
              />
            </div>
            {(!data.studySection || data.studySection === "memorization") && (
              <div className="space-y-1.5">
                <Label htmlFor={fieldId("status")}>Memorization</Label>
                <Select
                  value={draft.memorizationStatus}
                  onValueChange={(value) => setField("memorizationStatus", value as MemorizationStatus)}
                >
                  <SelectTrigger id={fieldId("status")}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="learning">Learning</SelectItem>
                    <SelectItem value="memorized">Memorized</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {(!data.studySection || data.studySection === "verse") && (
            <div className="space-y-1.5">
              <Label htmlFor={fieldId("source")}>Source</Label>
              <Input
                id={fieldId("source")}
                value={draft.sourceText}
                onChange={(event) => setField("sourceText", event.target.value)}
                placeholder="Text, chapter, or verse reference"
              />
            </div>
          )}

          {(!data.studySection || data.studySection === "verse") && (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={fieldId("devanagari")}>Devanāgarī</Label>
                <Textarea
                  id={fieldId("devanagari")}
                  className="font-devanagari text-base"
                  rows={3}
                  value={draft.devanagari}
                  onChange={(event) => setDevanagari(event.target.value)}
                  placeholder="श्लोकः"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor={fieldId("iast")}>IAST</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-6 px-2 text-[11px] text-muted-foreground"
                    onClick={() => setField("iast", devanagariToIast(draft.devanagari))}
                  >
                    Regenerate
                  </Button>
                </div>
                <Textarea
                  id={fieldId("iast")}
                  className="font-iast text-base italic"
                  rows={3}
                  value={draft.iast}
                  onChange={(event) => setField("iast", event.target.value)}
                  placeholder="ślokaḥ"
                />
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Updates automatically from Devanāgarī. You can still fine-tune it here.
                </p>
              </div>
            </div>
          )}

          {(!data.studySection || data.studySection === "padaccheda") && (
            <div className="space-y-1.5">
              <Label htmlFor={fieldId("padaccheda")}>Padaccheda</Label>
              <Textarea
                id={fieldId("padaccheda")}
                className="font-devanagari"
                rows={2}
                value={draft.padaccheda}
                onChange={(event) => setField("padaccheda", event.target.value)}
              />
            </div>
          )}
          {(!data.studySection || data.studySection === "anvaya") && (
            <div className="space-y-1.5">
              <Label htmlFor={fieldId("anvaya")}>Anvaya</Label>
              <Textarea
                id={fieldId("anvaya")}
                className="font-devanagari"
                rows={2}
                value={draft.anvaya}
                onChange={(event) => setField("anvaya", event.target.value)}
              />
            </div>
          )}
          {(!data.studySection || data.studySection === "padartha") && (
            <div className="space-y-1.5">
              <Label htmlFor={fieldId("padartha")}>Padārtha</Label>
              <Textarea
                id={fieldId("padartha")}
                rows={2}
                value={draft.padartha}
                onChange={(event) => setField("padartha", event.target.value)}
              />
            </div>
          )}
          {(!data.studySection || data.studySection === "grammar") && (
            <div className="space-y-1.5">
              <Label htmlFor={fieldId("grammar")}>Grammar</Label>
              <Textarea
                id={fieldId("grammar")}
                rows={3}
                value={draft.grammar}
                onChange={(event) => setField("grammar", event.target.value)}
              />
            </div>
          )}
          {(!data.studySection || data.studySection === "chandas") && (
            <div className="space-y-1.5">
              <Label htmlFor={fieldId("chandas")}>Chandas</Label>
              <Textarea
                id={fieldId("chandas")}
                rows={3}
                value={draft.chandas}
                onChange={(event) => setField("chandas", event.target.value)}
              />
            </div>
          )}

          {(!data.studySection || data.studySection === "translation") && (
            <div className="space-y-1.5">
              <Label htmlFor={fieldId("translation")}>Translation / meaning</Label>
              <Textarea
                id={fieldId("translation")}
                rows={4}
                value={draft.translation}
                onChange={(event) => setField("translation", event.target.value)}
              />
            </div>
          )}

          {(!data.studySection || data.studySection === "notes") && (
            <div className="space-y-1.5">
              <Label htmlFor={fieldId("notes")}>Notes</Label>
              <Textarea
                id={fieldId("notes")}
                rows={3}
                value={draft.notes}
                onChange={(event) => setField("notes", event.target.value)}
              />
            </div>
          )}

          {(!data.studySection || data.studySection === "memorization") && (
            <div className="space-y-1.5">
              <Label htmlFor={fieldId("memorization-notes")}>Memorization plan</Label>
              <Textarea
                id={fieldId("memorization-notes")}
                rows={3}
                value={draft.memorizationNotes}
                onChange={(event) => setField("memorizationNotes", event.target.value)}
              />
            </div>
          )}

          {(!data.studySection || data.studySection === "verse") && (
            <div className="space-y-1.5">
              <Label htmlFor={fieldId("tags")}>Tags</Label>
              <Input
                id={fieldId("tags")}
                value={draft.tagsText}
                onChange={(event) => setField("tagsText", event.target.value)}
                placeholder="comma separated"
              />
            </div>
          )}

          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">{data.studySection ? "Save card" : "Save Śloka"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
