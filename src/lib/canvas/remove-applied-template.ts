import { detachCardTemplateData } from "./card-templates";
import { normalizeTable, removeCellTemplate, tablePlainText, type TableAddress } from "./table";

/** Remove an applied template, preserving the container and the saved definition. */
export function removeAppliedTemplateData(data: Record<string, unknown>, cell?: TableAddress): Record<string, unknown> {
  if (cell) {
    const current = normalizeTable(data.table);
    const table = removeCellTemplate(current, cell.columnId, cell.rowId);
    return table === current ? data : { ...data, table, text: tablePlainText(table) };
  }
  if (!data.cardTemplateId && !data.cardTemplateSnapshot) return data;
  const next = detachCardTemplateData(data);
  delete next.freeCardLayout;
  return { ...next, text: "", richText: "" };
}
