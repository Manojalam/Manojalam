import type { Node } from "@xyflow/react";
import type { BoardCardTemplate, CardSection } from "../types";
import { cardSections, cardTemplateNodeData, normalizeCardTemplates, renderCardSections } from "./card-templates";
import { normalizeTable, tablePlainText, type TableAddress } from "./table";
import { supportsContentTemplate } from "./apply-content-template";

export const TEMPLATE_CLIPBOARD_MIME = "application/x-manojalam-template-values";
export interface TemplateClipboard { template: BoardCardTemplate; sections: CardSection[] }
export function copyTemplateContent(node: Node, templates: BoardCardTemplate[], cell?: TableAddress): TemplateClipboard | undefined {
  if (node.type === "table") {
    if (!cell) return;
    const content = normalizeTable(node.data.table).rows.find(row => row.id === cell.rowId)?.templates?.[cell.columnId];
    return content ? structuredClone({ template: content.template, sections: content.sections }) : undefined;
  }
  const template = templates.find(item => item.id === node.data.cardTemplateId) ?? normalizeCardTemplates([node.data.cardTemplateSnapshot])[0];
  if (!template || !node.data.cardTemplateId || node.data.freeCardLayout) return;
  return structuredClone({ template, sections: cardSections(node.data) });
}
export function parseTemplateClipboard(value: string): TemplateClipboard | undefined {
  try {
    const parsed = JSON.parse(value);
    const template = normalizeCardTemplates([parsed.template])[0];
    if (!template || !Array.isArray(parsed.sections) || !parsed.sections.length) return;
    return { template, sections: cardSections({ cardSections: parsed.sections }) };
  } catch { return; }
}
export function pasteTemplateContent(node: Node, content: TemplateClipboard, cell?: TableAddress): Node {
  if (node.data.locked || !supportsContentTemplate(node)) return node;
  const { template, sections } = structuredClone(content);
  if (node.type === "table") {
    const table = normalizeTable(node.data.table);
    if (!cell || !table.columns.some(column => column.id === cell.columnId) || !table.rows.some(row => row.id === cell.rowId)) return node;
    const rendered = renderCardSections(template, sections);
    const index = table.columns.findIndex(column => column.id === cell.columnId);
    table.rows = table.rows.map(row => row.id !== cell.rowId ? row : {
      ...row, cells: row.cells.map((text, i) => i === index ? rendered.text : text),
      richCells: { ...row.richCells, [cell.columnId]: rendered.richText },
      templates: { ...row.templates, [cell.columnId]: { template, sections, independent: true } },
    });
    return { ...node, data: { ...node.data, table, text: tablePlainText(table) } };
  }
  return { ...node, data: { ...node.data, ...cardTemplateNodeData(template, undefined, undefined, sections), freeCardLayout: false } };
}
