import type { Node } from "@xyflow/react";
import type { BoardCardTemplate, SampleCardTemplate } from "../types";
import { plainTextToRichText } from "./rich-text-paste";
import { cardTemplateNodeData } from "./card-templates";
import { sampleCardData, sampleTemplateCopyData } from "./sample-templates";
import { TABLE_HEADER, TABLE_LABEL, applyCellTemplate, normalizeTable, tableMinimumWidth, tablePlainText, type CanvasTable } from "./table";

export function supportsContentTemplate(node: Node): boolean {
  return ["table", "shape", "text", "sticky", "mindmap"].includes(node.type ?? "") && !(node.data.radialChart as { enabled?: boolean } | undefined)?.enabled;
}

/** Preserve cell coordinates, IDs, extra rows/columns, and nonempty answers. */
export function mergeTableTemplate(current: CanvasTable, design: CanvasTable): CanvasTable {
  current = normalizeTable(current);
  design = normalizeTable(design);
  const columns = Array.from({ length: Math.max(current.columns.length, design.columns.length) }, (_, i) => ({
    ...(design.columns[i] ?? current.columns[i]),
    id: current.columns[i]?.id ?? design.columns[i].id,
    name: design.columns[i]?.name ?? current.columns[i].name,
  }));
  const rows = Array.from({ length: Math.max(current.rows.length, design.rows.length) }, (_, i) => ({
    id: current.rows[i]?.id ?? design.rows[i].id,
    label: design.rows[i]?.label || current.rows[i]?.label,
    header: design.rows[i]?.header ?? current.rows[i]?.header,
    aboveHeader: design.rows[i]?.aboveHeader ?? current.rows[i]?.aboveHeader,
    templates: Object.fromEntries(columns.flatMap((column, j) => {
      const content = current.rows[i]?.templates?.[current.columns[j]?.id] ?? design.rows[i]?.templates?.[design.columns[j]?.id];
      return content ? [[column.id, content]] : [];
    })),
    cells: columns.map((_, j) => current.rows[i]?.cells[j] || design.rows[i]?.cells[j] || ""),
  }));
  const source = design.merges?.length ? design : current;
  const merges = source.merges?.map(merge => ({
    rowIds: merge.rowIds.map(id => id === TABLE_HEADER ? id : rows[source.rows.findIndex(row => row.id === id)]?.id).filter((id): id is string => !!id),
    columnIds: merge.columnIds.map(id => id === TABLE_LABEL ? id : columns[source.columns.findIndex(column => column.id === id)]?.id).filter((id): id is string => !!id),
  }));
  return normalizeTable({ columns, rows, merges, showRowLabels: design.showRowLabels || current.showRowLabels });
}

export function applyContentTemplate(node: Node, template: BoardCardTemplate | SampleCardTemplate, kind: "card" | "sample", columnId?: string, rowId?: string): Node {
  const card = kind === "card" ? template as BoardCardTemplate : undefined;
  const sample = kind === "sample" ? template as SampleCardTemplate : undefined;
  if (node.data.locked || !supportsContentTemplate(node)) return node;
  // A table design belongs to a table, not a rich-text shape.
  if (sample?.table && node.type !== "table") return node;
  if (node.type === "table") {
    const current = normalizeTable(node.data.table);
    const table = card ? applyCellTemplate(current, card, columnId, rowId) : sample?.table ? mergeTableTemplate(current, sample.table) : current;
    if (table === current) return node;
    return { ...node, style: card ? node.style : { ...node.style, width: Math.max(Number(node.style?.width) || node.width || 0, tableMinimumWidth(table, Number(node.data.fontSize))) }, data: { ...node.data, ...(card ? {} : template.style), sampleDesignId: undefined, table, text: tablePlainText(table) } };
  }
  if (node.data.cardTemplateId === template.id || node.data.sampleTemplateId === template.id) return node;
  const oldRichText = typeof node.data.richText === "string" ? node.data.richText : "";
  const hasContent = !!String(node.data.text ?? "").trim() || !!oldRichText.replace(/<[^>]+>/g, "").trim() || /<(img|video|audio|iframe)\b/i.test(oldRichText);
  const patch = card ? cardTemplateNodeData(card) : sample!.labels.length
    ? sampleCardData(sample!, [{ id: "first", values: {} }]) : sampleTemplateCopyData(sample!);
  // Content that cannot be mapped to named fields stays editable in place, including its HTML.
  return { ...node, data: { ...node.data, cardTemplateId: undefined, cardTemplateSnapshot: undefined, cardSections: undefined, cardExtraRows: undefined, cardFieldValues: undefined, sampleTemplateId: undefined, sampleTemplateSnapshot: undefined, sampleEntries: undefined, sampleDesignId: undefined, ...patch,
    ...(hasContent ? { text: node.data.text, richText: oldRichText || plainTextToRichText(String(node.data.text ?? "")), freeCardLayout: true } : { freeCardLayout: false }),
  } };
}
