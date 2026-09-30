import type { BoardCardTemplate, CardFieldValues, CardRowRepeat, CardSection } from "../types";
import { normalizeHexColor } from "./custom-colors";

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const templateColor = (value: unknown, fallback: string) => value === "" ? "" : normalizeHexColor(value) ?? fallback;
const bounded = (value: unknown, fallback: number, min: number, max: number) => typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

export function newHomeworkTemplate(id: string): BoardCardTemplate {
  return {
    id, name: "Homework card", starter: "homework",
    style: { fillColor: "#ffffff", borderColor: "#6366f1", textColor: "#334155", fontFamily: "", fontSize: 22, lineSpacing: 1.5, width: 800 },
    rows: [
      { id: "question_row", indent: 0, fields: [{ id: "question", label: "Question", color: "#1d4ed8", kind: "multiline" }] },
      { id: "answer_row", indent: 2, fields: [
        { id: "answer", label: "Answer", color: "#15803d", kind: "text" },
        { id: "sutram", label: "Sūtram", color: "#be185d", kind: "sutra" },
        { id: "example", label: "Example", color: "#7e22ce", kind: "text" },
      ] },
      { id: "explanation_row", indent: 2, fields: [
        { id: "explanation", label: "Explanation", color: "#334155", kind: "multiline" },
        { id: "explanation_sutra", label: "Sūtra", color: "#be185d", kind: "sutra" },
      ] },
    ],
  };
}

/** Reopen a saved starter even after its name or fields have been customized. */
export function savedHomeworkTemplate(templates: BoardCardTemplate[] = [], preferredId?: string) {
  const matches = templates.filter(template => template.starter === "homework"
    // Boards saved before starter identity was persisted use these stable IDs.
    || (!template.starter && template.rows.some(row => row.id === "question_row" && row.fields.some(field => field.id === "question"))));
  return matches.find(template => template.id === preferredId) ?? matches.at(-1);
}

export function normalizeCardTemplates(value: unknown): BoardCardTemplate[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  return value.flatMap(item => {
    if (!item || typeof item.id !== "string" || !item.id || ids.has(item.id) || typeof item.name !== "string" || !item.name.trim() || !Array.isArray(item.rows)) return [];
    const fieldIds = new Set<string>();
    const rowIds = new Set<string>();
    const rows: BoardCardTemplate["rows"] = [];
    for (const row of item.rows) {
      if (!row || typeof row.id !== "string" || rowIds.has(row.id) || !Array.isArray(row.fields)) continue;
      rowIds.add(row.id);
      const fields: BoardCardTemplate["rows"][number]["fields"] = [];
      for (const field of row.fields) {
        if (!field || typeof field.id !== "string" || !field.id || fieldIds.has(field.id) || typeof field.label !== "string") continue;
        fieldIds.add(field.id);
        fields.push({ id: field.id, label: field.label, color: templateColor(field.color, "#334155"), kind: ["link", "multiline", "sutra"].includes(field.kind) ? field.kind : "text" });
      }
      if (fields.length) rows.push({ id: row.id, indent: bounded(row.indent, 0, 0, 10), fields });
    }
    if (!rows.length) return [];
    ids.add(item.id);
    const style = item.style ?? {};
    return [{ id: item.id, name: item.name.trim(), ...(item.starter === "homework" ? { starter: "homework" as const } : {}), rows, style: {
      fillColor: templateColor(style.fillColor, "#ffffff"),
      borderColor: templateColor(style.borderColor, "#6366f1"),
      textColor: templateColor(style.textColor, "#334155"),
      fontFamily: typeof style.fontFamily === "string" ? style.fontFamily : "",
      fontSize: bounded(style.fontSize, 22, 8, 100),
      lineSpacing: bounded(style.lineSpacing, 1.5, 1, 4),
      width: bounded(style.width, 800, 240, 2400),
    } }];
  });
}

export function safeCardLink(href: string | undefined): string | undefined {
  if (!href) return undefined;
  try {
    const url = new URL(href.trim());
    return ["https:", "http:", "mailto:"].includes(url.protocol) ? url.href : undefined;
  } catch { return undefined; }
}

/** Repeat the row design with independent answers, immediately after its original. */
export function expandedCardRows(template: BoardCardTemplate, values: CardFieldValues, repeats: CardRowRepeat[] = []) {
  return template.rows.flatMap((row, index) => [
    { row, rowNumber: index + 1, values, repeatId: "", copyNumber: 0 },
    ...repeats.filter(repeat => repeat.rowId === row.id).map((repeat, copy) => ({ row, rowNumber: index + 1, values: repeat.values, repeatId: repeat.id, copyNumber: copy + 1 })),
  ]);
}

/** Escape values and label metadata, and validate link destinations. */
export function renderCardTemplate(template: BoardCardTemplate, values: CardFieldValues = {}, extraRows: string[] = [], repeats: CardRowRepeat[] = []) {
  const rows = expandedCardRows(template, values, repeats);
  const richText = rows.map(({ row, values }) => {
    const fields = row.fields.map(field => {
      const value = values[field.id];
      if (!value?.text) return "";
      const text = escapeHtml(value.text).replace(/\r?\n/g, "<br>");
      const href = field.kind === "link" || field.kind === "sutra" ? safeCardLink(value?.href) : undefined;
      // Preserve edge spaces and trailing verse separators outside the link decoration.
      const parts = value.text.match(/^(\s*)([\s\S]*?[^\s\u0964\u0965|])([\s\u0964\u0965|]*)$/);
      const content = href && parts
        ? `${escapeHtml(parts[1]).replace(/\r?\n/g, "<br>")}<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(parts[2]).replace(/\r?\n/g, "<br>")}</a>${escapeHtml(parts[3]).replace(/\r?\n/g, "<br>")}`
        : text;
      return `<span data-field-label="${escapeHtml(field.id)}" data-field-owner="${escapeHtml("card:" + template.id)}" data-field-name="${escapeHtml(field.label)}" style="color: ${field.color || "inherit"}">${content}</span>`;
    }).join("");
    return `<p style="text-align: left; white-space: pre-wrap; padding-left: ${row.indent}em; line-height: ${template.style.lineSpacing}">${fields}</p>`;
  }).join("") + extraRows.filter(row => row.length).map(row => `<p style="text-align: left; white-space: pre-wrap; line-height: ${template.style.lineSpacing}">${escapeHtml(row).replace(/\r?\n/g, "<br>")}</p>`).join("");
  const text = rows.map(({ row, values }) => row.fields.map(field => values[field.id]?.text ?? "").join("")).concat(extraRows.filter(row => row.length)).join("\n");
  return { richText, text };
}

/** Older cards become the first section without changing any of their answers. */
export function cardSections(data: Record<string, unknown>): CardSection[] {
  const sections = Array.isArray(data.cardSections) ? data.cardSections.filter(section => section && typeof section.id === "string" && section.values && typeof section.values === "object") : [];
  if (sections.length) return sections.map(section => ({ id: section.id, values: structuredClone(section.values), extraRows: Array.isArray(section.extraRows) ? section.extraRows.filter((row: unknown) => typeof row === "string") : [],
    ...(Array.isArray(section.rowRepeats) ? { rowRepeats: section.rowRepeats.flatMap((repeat: CardRowRepeat) => repeat && typeof repeat.id === "string" && typeof repeat.rowId === "string" && repeat.values && typeof repeat.values === "object" && !Array.isArray(repeat.values) ? [{ id: repeat.id, rowId: repeat.rowId, values: structuredClone(repeat.values) }] : []) } : {}),
  }));
  return [{ id: "first", values: structuredClone((data.cardFieldValues ?? {}) as CardFieldValues), extraRows: Array.isArray(data.cardExtraRows) ? data.cardExtraRows.filter((row: unknown) => typeof row === "string") : [] }];
}

export function renderCardSections(template: BoardCardTemplate, sections: CardSection[]) {
  const content = sections.map(section => renderCardTemplate(template, section.values, section.extraRows, section.rowRepeats));
  return {
    richText: content.map(section => section.richText).join(`<p style="line-height: ${template.style.lineSpacing}"><br></p>`),
    text: content.map(section => section.text).join("\n\n"),
  };
}

export function cardTemplateNodeData(template: BoardCardTemplate, values: CardFieldValues = {}, extraRows: string[] = [], sections: CardSection[] = [{ id: "first", values, extraRows }]) {
  const first = sections[0] ?? { values, extraRows };
  return {
    ...renderCardSections(template, sections),
    cardSections: structuredClone(sections),
    cardExtraRows: [...first.extraRows],
    cardTemplateId: template.id,
    cardTemplateSnapshot: structuredClone(template),
    cardFieldValues: structuredClone(first.values),
    fillColor: template.style.fillColor || undefined, fillOpacity: 1, borderColor: template.style.borderColor || undefined,
    textColor: template.style.textColor || undefined, fontSize: template.style.fontSize,
    fontFamily: template.style.fontFamily || undefined,
    lineSpacing: template.style.lineSpacing,
    textAlign: "left", textVerticalAlign: "top", textPadding: 24,
    layoutAutoFill: false, layoutAutoBorder: false, layoutAutoText: false, layoutAutoTypography: false,
  };
}

export function detachCardTemplateData(data: Record<string, unknown>) {
  const next = { ...data };
  delete next.cardTemplateId;
  delete next.cardTemplateSnapshot;
  delete next.cardFieldValues;
  delete next.cardExtraRows;
  delete next.cardSections;
  return next;
}
