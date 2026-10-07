import type { Node } from "@xyflow/react";
import type { BoardCardTemplate, SampleCardTemplate } from "../types";
import { plainTextToRichText } from "./rich-text-paste";
import { cardTemplateNodeData } from "./card-templates";
import { sampleCardData, sampleTemplateCopyData } from "./sample-templates";
import { normalizeTable, tableMinimumWidth, tablePlainText, type CanvasTable } from "./table";

export function supportsContentTemplate(node: Node): boolean {
  return ["table", "shape", "text", "sticky", "mindmap"].includes(node.type ?? "") && !(node.data.radialChart as { enabled?: boolean } | undefined)?.enabled;
}

/** Preserve cell coordinates, IDs, extra rows/columns, and nonempty answers. */
export function mergeTableTemplate(current: CanvasTable, design: CanvasTable): CanvasTable {
  const columns = Array.from({ length: Math.max(current.columns.length, design.columns.length) }, (_, i) => ({
    id: current.columns[i]?.id ?? design.columns[i].id,
    name: design.columns[i]?.name ?? current.columns[i].name,
  }));
  const rows = Array.from({ length: Math.max(current.rows.length, design.rows.length) }, (_, i) => ({
    id: current.rows[i]?.id ?? design.rows[i].id,
    label: design.rows[i]?.label || current.rows[i]?.label,
    cells: columns.map((_, j) => current.rows[i]?.cells[j] || design.rows[i]?.cells[j] || ""),
  }));
  return normalizeTable({ columns, rows, showRowLabels: design.showRowLabels || current.showRowLabels });
}

export function applyContentTemplate(node: Node, template: BoardCardTemplate | SampleCardTemplate, kind: "card" | "sample"): Node {
  const card = kind === "card" ? template as BoardCardTemplate : undefined;
  const sample = kind === "sample" ? template as SampleCardTemplate : undefined;
  if (node.data.locked || !supportsContentTemplate(node)) return node;
  // A table design belongs to a table, not a rich-text shape.
  if (sample?.table && node.type !== "table") return node;
  if (node.type === "table") {
    const fields = card?.rows.flatMap(row => row.fields.map(field => ({ id: field.id, name: field.label })))
      ?? sample?.labels.map(label => ({ id: label.id, name: label.name })) ?? [];
    const design = sample?.table ?? (fields.length ? normalizeTable({ columns: fields, rows: [{ id: "template-row", cells: [] }] }) : normalizeTable(node.data.table));
    const table = mergeTableTemplate(normalizeTable(node.data.table), design);
    return { ...node, style: { ...node.style, width: Math.max(Number(node.style?.width) || node.width || 0, tableMinimumWidth(table, Number(template.style.fontSize ?? node.data.fontSize))) }, data: { ...node.data, ...template.style, sampleDesignId: undefined, styleTemplateId: undefined, table, text: tablePlainText(table) } };
  }
  if (node.data.cardTemplateId === template.id || node.data.sampleTemplateId === template.id) return node;
  const oldRichText = typeof node.data.richText === "string" ? node.data.richText : "";
  const hasContent = !!String(node.data.text ?? "").trim() || !!oldRichText.replace(/<[^>]+>/g, "").trim() || /<(img|video|audio|iframe)\b/i.test(oldRichText);
  const patch = card ? cardTemplateNodeData(card) : sample!.labels.length
    ? sampleCardData(sample!, [{ id: "first", values: {} }]) : sampleTemplateCopyData(sample!);
  // Content that cannot be mapped to named fields stays editable in place, including its HTML.
  return { ...node, data: { ...node.data, styleTemplateId: undefined, cardTemplateId: undefined, cardTemplateSnapshot: undefined, cardSections: undefined, cardExtraRows: undefined, cardFieldValues: undefined, sampleTemplateId: undefined, sampleTemplateSnapshot: undefined, sampleEntries: undefined, sampleDesignId: undefined, ...patch,
    ...(hasContent ? { text: node.data.text, richText: oldRichText || plainTextToRichText(String(node.data.text ?? "")), freeCardLayout: true } : { freeCardLayout: false }),
  } };
}
