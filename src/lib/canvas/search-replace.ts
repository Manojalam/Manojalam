import { searchTextOffsets } from "./search-highlight";
import { NODE_TEXT_FIELDS, nodeRichTextPlainText } from "./node-text";
import { normalizeTable, tableRowOrder, tableMergeAt, tablePlainText, TABLE_HEADER, TABLE_LABEL } from "./table";
import { cardSectionsFromText, renderCardSections } from "./card-templates";

/** Edit only text nodes: never interpret replacement text as HTML or change link URLs. */
export function replaceSearchText(value: string, query: string, replacement: string, occurrence?: number, rich = false) {
  const root = rich ? new DOMParser().parseFromString(value, "text/html").body : null;
  const parts: { node: Text; start: number; end: number }[] = [];
  let text = root ? "" : value;
  if (root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      parts.push({ node, start: text.length, end: text.length + node.length });
      text += node.data;
    }
  }
  const matches = searchTextOffsets(text, query);
  const selected = occurrence === undefined ? matches : occurrence < 0 ? [] : matches.slice(occurrence, occurrence + 1);
  for (const [start, end] of [...selected].reverse()) {
    if (!root) { text = text.slice(0, start) + replacement + text.slice(end); continue; }
    const affected = parts.filter(part => part.end > start && part.start < end);
    affected.forEach((part, index) => {
      const from = Math.max(0, start - part.start), to = Math.min(part.node.length, end - part.start);
      part.node.replaceData(from, to - from, index === 0 ? replacement : "");
    });
  }
  return { value: root ? root.innerHTML : text, count: selected.length, total: matches.length };
}

/** Build a data patch in rendered reading order, keeping plain-text caches synchronized. */
export function replaceNodeSearch(data: Record<string, unknown>, query: string, replacement: string, occurrence?: number) {
  let remaining = occurrence, count = 0;
  const edit = (plain: string, rich?: string) => {
    if (remaining !== undefined && remaining < 0) return { plain, rich };
    const result = replaceSearchText(rich ?? plain, query, replacement, remaining, rich !== undefined);
    if (remaining !== undefined) remaining -= result.total;
    if (!result.count) return { plain, rich };
    count += result.count;
    return rich !== undefined ? { plain: nodeRichTextPlainText(result.value), rich: result.value } : { plain: result.value, rich };
  };
  if (data.table) {
    const table = normalizeTable(data.table);
    const columns = [...(table.showRowLabels ? [TABLE_LABEL] : []), ...table.columns.map(column => column.id)];
    for (const rowId of tableRowOrder(table)) for (const columnId of columns) {
      const merge = tableMergeAt(table, { rowId, columnId });
      if (merge && (merge.rowIds[0] !== rowId || merge.columnIds[0] !== columnId)) continue;
      for (const r of merge?.rowIds ?? [rowId]) for (const c of merge?.columnIds ?? [columnId]) {
        const columnIndex = table.columns.findIndex(column => column.id === c);
        const column = table.columns[columnIndex], row = table.rows.find(row => row.id === r);
        if (r === TABLE_HEADER) {
          if (c === TABLE_LABEL) { const result = edit(table.labelHeader ?? "Row label", table.labelHeaderRichText); table.labelHeader = result.plain; table.labelHeaderRichText = result.rich; }
          else { const result = edit(column.name, column.richText); column.name = result.plain; column.richText = result.rich; }
        } else if (row) {
          if (c === TABLE_LABEL) { const result = edit(row.label ?? "", row.labelRichText); row.label = result.plain; row.labelRichText = result.rich; }
          else if (row.templates?.[c]) {
            const card = row.templates[c];
            const rendered = renderCardSections(card.template, card.sections);
            const result = edit(rendered.text, rendered.richText);
            if (result.rich !== rendered.richText) card.sections = cardSectionsFromText(card.template, card.sections, result.rich!);
          } else {
            const result = edit(row.cells[columnIndex], row.richCells?.[c]);
            row.cells[columnIndex] = result.plain;
            if (result.rich !== undefined) row.richCells = { ...row.richCells, [c]: result.rich };
          }
        }
      }
    }
    return { patch: { table, text: tablePlainText(table) } as Record<string, unknown>, count };
  }
  if (typeof data.richText === "string" && data.richText) {
    const result = edit(String(data.text ?? ""), data.richText);
    const patch: Record<string, unknown> = { richText: result.rich, text: result.plain };
    for (const field of NODE_TEXT_FIELDS) {
      if (typeof data[field] === "string" && data[field] === data.text) patch[field] = result.plain;
    }
    return { patch, count };
  }
  const patch: Record<string, unknown> = {};
  const seen = new Map<string, string>();
  for (const field of NODE_TEXT_FIELDS) {
    if (typeof data[field] !== "string") continue;
    const value = data[field] as string;
    const key = value.normalize("NFC").replace(/\s+/gu, " ").trim();
    if (seen.has(key)) { patch[field] = seen.get(key); continue; }
    const result = edit(value);
    patch[field] = result.plain;
    seen.set(key, result.plain);
  }
  return { patch, count };
}
