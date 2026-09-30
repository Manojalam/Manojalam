import type { BoardCardTemplate, BoardSettings, BoardStyleTemplate, SampleCardTemplate } from "../types";
import { normalizeCardTemplates } from "../canvas/card-templates";
import { normalizeSampleTemplates } from "../canvas/sample-templates";
import { normalizeBoardStyleTemplates } from "../canvas/board-style-templates";

export interface TemplateSource {
  id: string;
  title: string;
  updatedAt: string;
  settings: Partial<BoardSettings>;
}
export type LibraryTemplate = { sourceId: string; sourceTitle: string; key: string } & (
  | { kind: "card"; template: BoardCardTemplate }
  | { kind: "sample"; template: SampleCardTemplate }
  | { kind: "style"; template: BoardStyleTemplate }
);

/** Read designs only; filled answers and board content are never imported. */
export function collectBoardTemplates(sources: TemplateSource[], currentBoardId?: string): LibraryTemplate[] {
  const seen = new Set<string>();
  const result: LibraryTemplate[] = [];
  for (const source of [...sources].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) {
    if (source.id === currentBoardId) continue;
    const add = (item: LibraryTemplate) => {
      if (seen.has(item.key)) return;
      seen.add(item.key);
      result.push(item);
    };
    const origin = { sourceId: source.id, sourceTitle: source.title };
    for (const template of normalizeCardTemplates(source.settings?.cardTemplates)) add({ ...origin, kind: "card", key: `card:${template.id}`, template });
    for (const template of normalizeSampleTemplates(source.settings?.sampleTemplates)) add({ ...origin, kind: "sample", key: `sample:${template.id}`, template });
    for (const template of normalizeBoardStyleTemplates(source.settings?.styleTemplates)) add({ ...origin, kind: "style", key: `style:${template.id}`, template });
  }
  return result;
}

/** A board owns its copy: importing must never overwrite an existing local design. */
export function importLibraryTemplate(settings: BoardSettings, entry: LibraryTemplate): Partial<BoardSettings> {
  switch (entry.kind) {
    case "card": return { cardTemplates: settings.cardTemplates?.some(item => item.id === entry.template.id) ? settings.cardTemplates : [...(settings.cardTemplates ?? []), structuredClone(entry.template)] };
    case "sample": return { sampleTemplates: settings.sampleTemplates?.some(item => item.id === entry.template.id) ? settings.sampleTemplates : [...(settings.sampleTemplates ?? []), structuredClone(entry.template)] };
    case "style": return { styleTemplates: settings.styleTemplates?.some(item => item.id === entry.template.id) ? settings.styleTemplates : [...(settings.styleTemplates ?? []), structuredClone(entry.template)] };
  }
}
