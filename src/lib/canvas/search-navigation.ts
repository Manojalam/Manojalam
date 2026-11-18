import { nodePlainText } from "./node-text";
import { normalizeTable, tablePlainText } from "./table";

/** Count displayed content once, rather than both rich text and its plain-text cache. */
export function searchOccurrenceText(data: Record<string, unknown>): string {
  return data.table ? tablePlainText(normalizeTable(data.table)) : nodePlainText(data);
}

export function nextSearchIndex(index: number, direction: number, total: number): number {
  return total > 0 ? ((index + direction) % total + total) % total : -1;
}
