import type { MemorizationStatus, ShlokaCardNodeData } from "../types";

export interface ShlokaCardEditorDraft {
  title: string;
  sourceText: string;
  devanagari: string;
  iast: string;
  padaccheda: string;
  anvaya: string;
  padartha: string;
  translation: string;
  grammar: string;
  chandas: string;
  notes: string;
  memorizationNotes: string;
  memorizationStatus: MemorizationStatus;
  tagsText: string;
}

function optionalText(value: string): string | undefined {
  return value.trim().length > 0 ? value : undefined;
}

export function shlokaCardEditorDraft(data: ShlokaCardNodeData): ShlokaCardEditorDraft {
  return {
    title: data.title ?? "",
    sourceText: data.sourceText ?? "",
    devanagari: data.devanagari ?? "",
    iast: data.iast ?? "",
    padaccheda: data.padaccheda ?? "",
    anvaya: data.anvaya ?? "",
    padartha: data.padartha ?? "",
    translation: data.translation ?? "",
    grammar: data.grammar ?? "",
    chandas: data.chandas ?? "",
    notes: data.notes ?? "",
    memorizationNotes: data.memorizationNotes ?? "",
    memorizationStatus: data.memorizationStatus ?? "new",
    tagsText: (data.tags ?? []).join(", "),
  };
}

export function shlokaCardEditorPatch(
  draft: ShlokaCardEditorDraft
): Partial<ShlokaCardNodeData> {
  const tags = draft.tagsText
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  return {
    title: draft.title,
    sourceText: optionalText(draft.sourceText),
    devanagari: draft.devanagari,
    iast: draft.iast,
    padaccheda: optionalText(draft.padaccheda),
    anvaya: optionalText(draft.anvaya),
    padartha: optionalText(draft.padartha),
    translation: optionalText(draft.translation),
    grammar: optionalText(draft.grammar),
    chandas: optionalText(draft.chandas),
    notes: optionalText(draft.notes),
    memorizationNotes: optionalText(draft.memorizationNotes),
    memorizationStatus: draft.memorizationStatus,
    tags: [...new Set(tags)],
  };
}
