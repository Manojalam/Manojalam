import { nodePlainText, nodeRichTextPlainText, uniqueNodeTextValues } from "./node-text";

/** Search authored content, never asset URLs, styles, or serialized image data. */
export function boardSearchText(data: Record<string, unknown>): string {
  const values = [nodePlainText(data), ...uniqueNodeTextValues(data)];
  const add = (value: unknown) => { if (typeof value === "string") values.push(nodeRichTextPlainText(value)); };
  const sections = (value: unknown) => {
    if (!Array.isArray(value)) return;
    for (const section of value) {
      if (section?.values && typeof section.values === "object") Object.values(section.values).forEach(add);
    }
  };
  sections(data.cardSections);
  if (Array.isArray(data.tags)) data.tags.forEach(add);
  const table = data.table as { labelHeader?: string; columns?: { name?: string; richText?: string }[]; rows?: { label?: string; labelRichText?: string; cells?: string[]; richCells?: Record<string, string>; templates?: Record<string, { sections?: unknown }> }[] } | undefined;
  if (table) {
    add(table.labelHeader);
    table.columns?.forEach(column => { add(column.name); add(column.richText); });
    table.rows?.forEach(row => {
      add(row.label); add(row.labelRichText);
      row.cells?.forEach(add);
      Object.values(row.richCells ?? {}).forEach(add);
      Object.values(row.templates ?? {}).forEach(card => sections(card.sections));
    });
  }
  return values.filter(Boolean).join(" ").replace(/\s+/gu, " ").trim();
}

export function normalizeBoardSearch(value: string): string {
  return value.normalize("NFC").replace(/\s+/gu, " ").trim().toLocaleLowerCase();
}

export function boardSearchMatches(text: string, query: string): boolean {
  const normalized = normalizeBoardSearch(query);
  return !!normalized && normalizeBoardSearch(text).includes(normalized);
}
