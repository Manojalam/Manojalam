import type { CardTemplateRow } from "../types";

/** Move the field itself so saved answers and styling keep their stable field ID. */
export function placeTemplateField(rows: CardTemplateRow[], fieldId: string, rowId: string, beforeId?: string): CardTemplateRow[] {
  const field = rows.flatMap(row => row.fields).find(item => item.id === fieldId);
  const target = rows.find(row => row.id === rowId);
  if (!field || !target || beforeId === fieldId || (beforeId && !target.fields.some(item => item.id === beforeId))) return rows;
  return rows.map(row => {
    const fields = row.fields.filter(item => item.id !== fieldId);
    if (row.id === rowId) fields.splice(beforeId ? fields.findIndex(item => item.id === beforeId) : fields.length, 0, field);
    return { ...row, fields };
  }).filter(row => row.fields.length);
}
