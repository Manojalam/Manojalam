import { decorateTemplateValue, valueParagraphStyle, inlineValueHtml, refreshEditedTemplate, templateValueText } from "./template-value-html";
import type { BoardCardTemplate, CardTemplateRow, CardTemplateField, CardFieldValues, CardRowRepeat, CardSection } from "../types";
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
      const readFields = (source: CardTemplateField[], nested = false): CardTemplateField[] => {
      const fields: CardTemplateField[] = [];
      for (const field of source) {
        if (!field || typeof field.id !== "string" || !field.id || fieldIds.has(field.id) || typeof field.label !== "string") continue;
        fieldIds.add(field.id);
        fields.push({ id: field.id, label: field.label, color: templateColor(field.color, "#334155"), kind: ["link", "multiline", "sutra", "constant", ...(!nested ? ["multipart"] : [])].includes(field.kind) ? field.kind : "text",
          ...(field.kind === "multipart" && !nested ? { parts: readFields(Array.isArray(field.parts) ? field.parts : [], true) } : {}),
          ...(field.kind === "constant" ? { constantText: typeof field.constantText === "string" ? field.constantText : "", ...(typeof field.constantWhenFieldId === "string" && field.constantWhenFieldId ? { constantWhenFieldId: field.constantWhenFieldId } : {}) } : {}),
          ...(typeof field.fontFamily === "string" && field.fontFamily ? { fontFamily: field.fontFamily } : {}),
          ...(typeof field.fontSize === "number" && Number.isFinite(field.fontSize) ? { fontSize: bounded(field.fontSize, 22, 8, 100) } : {}),
          ...Object.fromEntries((["strike", "superscript", "subscript"] as const).filter(key => typeof field[key] === "boolean").map(key => [key, field[key]])),
          ...(typeof field.highlightColor === "string" ? { highlightColor: normalizeHexColor(field.highlightColor) || "" } : {}),
          ...(typeof field.bold === "boolean" ? { bold: field.bold } : {}), ...(typeof field.italic === "boolean" ? { italic: field.italic } : {}), ...(typeof field.underline === "boolean" ? { underline: field.underline } : {}),
        });
      }
      return fields;
      };
      fields.push(...readFields(row.fields));
      if (fields.length) rows.push({ ...(row.collapsible === true ? { collapsible: true, collapsedByDefault: row.collapsedByDefault === true } : {}),
        ...(typeof row.collapseParentId === "string" && rows.some(parent => parent.id === row.collapseParentId && parent.collapsible) ? { collapseParentId: row.collapseParentId } : {}), id: row.id, indent: bounded(row.indent, 0, 0, 10), fields,
        ...(["left", "center", "right", "justify"].includes(row.textAlign) ? { textAlign: row.textAlign } : {}),
        ...(typeof row.lineSpacing === "number" && Number.isFinite(row.lineSpacing) ? { lineSpacing: bounded(row.lineSpacing, 1.5, 1, 4) } : {}),
      });
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

/** Insert beside either the original row or one of its copies without parent dependencies. */
export function insertCardRowRepeat(repeats: CardRowRepeat[], rowId: string, anchorId: string, side: "before" | "after", id: string): CardRowRepeat[] {
  const group = repeats.filter(repeat => repeat.rowId === rowId);
  const anchor = anchorId ? group.findIndex(repeat => repeat.id === anchorId) : -1;
  if (anchorId && anchor < 0) return repeats;
  const position = anchor >= 0 ? group[anchor].position ?? "after" : side;
  const sameSide = group.filter(repeat => (repeat.position ?? "after") === position);
  const index = anchor >= 0 ? sameSide.findIndex(repeat => repeat.id === anchorId) + (side === "after" ? 1 : 0)
    : side === "before" ? sameSide.length : 0;
  sameSide.splice(index, 0, { id, rowId, position, newLine: true, values: {} });
  const otherSide = group.filter(repeat => (repeat.position ?? "after") !== position);
  return [...repeats.filter(repeat => repeat.rowId !== rowId),
    ...(position === "before" ? [...sameSide, ...otherSide] : [...otherSide, ...sameSide])];
}

/** Repeat the row design with independent answers on either side of its original. */
export function expandedCardRows(template: BoardCardTemplate, values: CardFieldValues, repeats: CardRowRepeat[] = []) {
  return template.rows.flatMap((row, index) => {
    const copies = repeats.filter(repeat => repeat.rowId === row.id);
    const ordered = [...copies.filter(repeat => repeat.position === "before"), ...copies.filter(repeat => repeat.position !== "before")];
    const entries = ordered.map((repeat, copy) => ({ row, rowNumber: index + 1, values: repeat.values, repeatId: repeat.id, copyNumber: copy + 1, newLine: repeat.newLine === true }));
    entries.splice(copies.filter(repeat => repeat.position === "before").length, 0, { row, rowNumber: index + 1, values, repeatId: "", copyNumber: 0, newLine: false });
    return entries;
  });
}

/** Leaf parts keep their stable IDs so answers survive reordering and redesign. */
export function templateInputFields(fields: CardTemplateField[]): CardTemplateField[] {
  return fields.flatMap(field => field.kind === "multipart" ? (field.parts ?? []).map(part => ({ ...field, ...part, color: part.color || field.color, fontFamily: part.fontFamily || field.fontFamily, fontSize: part.fontSize ?? field.fontSize, bold: part.bold ?? field.bold, italic: part.italic ?? field.italic, underline: part.underline ?? field.underline, strike: part.strike ?? field.strike, superscript: part.superscript ?? field.superscript, subscript: part.subscript ?? field.subscript, highlightColor: part.highlightColor ?? field.highlightColor, parts: undefined })) : [field]);
}

function fieldEntries(row: CardTemplateRow, values: CardFieldValues) {
  return row.fields.flatMap(field => {
    const scope = field.kind === "multipart" ? { ...row, fields: templateInputFields([field]) } : row;
    return (field.kind === "multipart" ? scope.fields : [field]).map(part => ({ field: part, value: fieldValue(part, scope, values) }));
  });
}

/** Constants depend on actual input in the same row/copy, never other constants or stale values. */
function fieldValue(field: CardTemplateField, row: CardTemplateRow, values: CardFieldValues): { text: string; href?: string; richText?: string } | undefined {
  if (field.kind !== "constant") return values[field.id];
  const dependency = row.fields.find(input => input.id === field.constantWhenFieldId);
  const populated = templateInputFields(dependency ? [dependency] : row.fields).some(input => input.kind !== "constant"
    && (!field.constantWhenFieldId || !!dependency || input.id === field.constantWhenFieldId)
    && !!values[input.id]?.text.trim());
  return populated ? { text: field.constantText ?? "" } : undefined;
}

/** Escape values and label metadata, and validate link destinations. */
export function renderCardTemplate(template: BoardCardTemplate, values: CardFieldValues = {}, extraRows: string[] = [], repeats: CardRowRepeat[] = [], sectionId = "first") {
  const rows = expandedCardRows(template, values, repeats);
  const paragraphs: (typeof rows)[] = [];
  for (const entry of rows) {
    if (!templateInputFields(entry.row.fields).some(field => field.kind !== "constant" && entry.values[field.id]?.text.trim())) continue;
    const previous = paragraphs.at(-1);
    if (!previous || previous[0].row.id !== entry.row.id || entry.newLine || previous.at(-1)!.newLine) paragraphs.push([entry]);
    else previous.push(entry);
  }
  const filledExtraRows = extraRows.filter(row => row.trim());
  // New repeats are paragraphs; legacy inline repeats keep their authored layout.
  const textStyle = `color: ${template.style.textColor || "inherit"}; font-size: ${template.style.fontSize}px; font-family: ${escapeHtml((template.style.fontFamily || "inherit").replace(/[;{}<>]/g, ""))};`;
  const richText = paragraphs.map(entries => {
    const row = entries[0].row;
    const fields = entries.map(({ values, repeatId }) => fieldEntries(row, values).map(({ field, value }) => {
      if (!value?.text) return "";
      const text = value.richText ? inlineValueHtml(value.richText) : escapeHtml(value.text).replace(/\r?\n/g, "<br>");
      const href = field.kind === "link" || field.kind === "sutra" ? safeCardLink(value?.href) : undefined;
      // Preserve edge spaces and trailing verse separators outside the link decoration.
      const parts = value.text.match(/^(\s*)([\s\S]*?[^\s\u0964\u0965|])([\s\u0964\u0965|]*)$/);
      const content = value.richText && /<[^>]+>/.test(text) ? (href && !/<a\b/i.test(text) ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${text}</a>` : text) : href && parts
        ? `${escapeHtml(parts[1]).replace(/\r?\n/g, "<br>")}<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(parts[2]).replace(/\r?\n/g, "<br>")}</a>${escapeHtml(parts[3]).replace(/\r?\n/g, "<br>")}`
        : text;
      let styledContent = content;
      if (field.bold) styledContent = `<strong>${styledContent}</strong>`;
      if (field.italic) styledContent = `<em>${styledContent}</em>`;
      if (field.underline) styledContent = `<u>${styledContent}</u>`;
      if (field.strike) styledContent = `<s>${styledContent}</s>`;
      if (field.superscript) styledContent = `<sup>${styledContent}</sup>`;
      else if (field.subscript) styledContent = `<sub>${styledContent}</sub>`;
      if (field.highlightColor) styledContent = `<mark style="background-color: ${field.highlightColor}; color: inherit">${styledContent}</mark>`;
      const fontStyle = `; font-size: ${bounded(field.fontSize ?? template.style.fontSize, 22, 8, 100)}px`
        + ((field.fontFamily || template.style.fontFamily) ? `; font-family: ${escapeHtml((field.fontFamily || template.style.fontFamily!).replace(/[;{}<>]/g, ""))}` : "");
      const attributes = { "data-field-instance": JSON.stringify([sectionId, repeatId, field.id]), "data-field-label": field.id, "data-field-owner": "card:" + template.id, "data-field-name": field.label };
      const style = `color: ${field.color || template.style.textColor || "inherit"}${fontStyle}`;
      return `<span ${Object.entries(attributes).map(([name, value]) => `${name}="${escapeHtml(value)}"`).join(" ")} style="${style}">${decorateTemplateValue(styledContent, attributes, style)}</span>`;
    }).join("")).join("");
    const localParagraph = entries.flatMap(entry => templateInputFields(entry.row.fields).map(field => entry.values[field.id]).filter(Boolean)).map(value => valueParagraphStyle(value.paragraphStyle || "")).filter(Boolean).at(-1) || "";
    const rowKey = escapeHtml(JSON.stringify([sectionId, row.id]));
    const parent = row.collapseParentId && template.rows.slice(0, template.rows.indexOf(row)).find(candidate => candidate.id === row.collapseParentId && candidate.collapsible);
    const collapse = ` data-template-row="${rowKey}"${row.collapsible ? ` data-template-collapsible="true" data-template-collapsed="${row.collapsedByDefault === true}"` : ""}${parent ? ` data-template-parent="${escapeHtml(JSON.stringify([sectionId, parent.id]))}"` : ""}`;
    return `<p${collapse} style="${textStyle} text-align: ${row.textAlign || "left"}; white-space: pre-wrap; padding-left: ${row.indent}em; line-height: ${row.lineSpacing ?? template.style.lineSpacing}; ${localParagraph}">${fields}</p>`;
  }).join("") + filledExtraRows.map(row => `<p style="${textStyle} text-align: left; white-space: pre-wrap; line-height: ${template.style.lineSpacing}"><span style="${textStyle}">${escapeHtml(row).replace(/\r?\n/g, "<br>")}</span></p>`).join("");
  const text = paragraphs.map(entries => entries.map(({ row, values }) => fieldEntries(row, values).map(({ value }) => value?.text ?? "").join("")).join("")).concat(filledExtraRows).join("\n");
  return { richText, text };
}

/** Older cards become the first section without changing any of their answers. */
export function cardSections(data: Record<string, unknown>): CardSection[] {
  const sections = Array.isArray(data.cardSections) ? data.cardSections.filter(section => section && typeof section.id === "string" && section.values && typeof section.values === "object") : [];
  if (sections.length) return sections.map(section => ({ id: section.id, ...(section.editedText && typeof section.editedText.html === "string" && typeof section.editedText.baseline === "string" ? { editedText: structuredClone(section.editedText) } : {}), values: structuredClone(section.values), extraRows: Array.isArray(section.extraRows) ? section.extraRows.filter((row: unknown) => typeof row === "string") : [],
    ...(Array.isArray(section.rowRepeats) ? { rowRepeats: section.rowRepeats.flatMap((repeat: CardRowRepeat) => repeat && typeof repeat.id === "string" && typeof repeat.rowId === "string" && repeat.values && typeof repeat.values === "object" && !Array.isArray(repeat.values) ? [{ id: repeat.id, rowId: repeat.rowId, ...(typeof repeat.newLine === "boolean" ? { newLine: repeat.newLine } : {}), ...(repeat.position === "before" || repeat.position === "after" ? { position: repeat.position } : {}), values: structuredClone(repeat.values) }] : []) } : {}),
  }));
  return [{ id: "first", values: structuredClone((data.cardFieldValues ?? {}) as CardFieldValues), extraRows: Array.isArray(data.cardExtraRows) ? data.cardExtraRows.filter((row: unknown) => typeof row === "string") : [] }];
}

export function renderCardSections(template: BoardCardTemplate, sections: CardSection[]) {
  const content = sections.map(section => {
    const generated = renderCardTemplate(template, section.values, section.extraRows, section.rowRepeats, section.id);
    if (!section.editedText) return generated;
    const richText = refreshEditedTemplate(section.editedText.html, section.editedText.baseline, generated.richText);
    return { richText, text: templateValueText(richText) };
  }).filter(section => section.text.trim());
  return {
    richText: content.map(section => section.richText).join(`<p data-template-section-separator="true" style="line-height: ${template.style.lineSpacing}"><br></p>`),
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

/** Capture inline edits back into values while retaining any freely authored content/layout. */
export function cardSectionsFromText(template: BoardCardTemplate, sections: CardSection[], html: string): CardSection[] {
  if (typeof DOMParser === "undefined") return sections;
  const body = new DOMParser().parseFromString(html, "text/html").body;
  const next = structuredClone(sections);
  const inputFields = template.rows.flatMap(row => templateInputFields(row.fields)).filter(field => field.kind !== "constant");
  const defaults = new DOMParser().parseFromString(sections.map(section => renderCardTemplate(template, section.values, section.extraRows, section.rowRepeats, section.id).richText).join(""), "text/html").body;
  for (const section of next) for (const entry of [{ id: "", values: section.values }, ...(section.rowRepeats ?? [])]) {
    for (const field of inputFields) {
      const key = JSON.stringify([section.id, entry.id, field.id]);
      const highlightProbe = body.ownerDocument.createElement("span");
      highlightProbe.style.backgroundColor = field.highlightColor || "";
      const inheritedHighlight = highlightProbe.style.backgroundColor;
      const selector = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLElement>("[data-field-instance]")).filter(span => span.dataset.fieldInstance === key && !span.parentElement?.closest("[data-field-instance]"));
      const fragments = selector(body), original = selector(defaults)[0];
      if (!fragments.length && !original) continue;
      const local = fragments.map(fragment => {
        const clone = fragment.cloneNode(true) as HTMLElement;
        for (const attribute of Array.from(clone.attributes)) if (attribute.name.startsWith("data-field-")) clone.removeAttribute(attribute.name);
        if (original) for (const property of Array.from(clone.style)) if (clone.style.getPropertyValue(property) === original.style.getPropertyValue(property)) clone.style.removeProperty(property);
        if (!clone.getAttribute("style")) clone.removeAttribute("style");
        // TipTap moves bold/italic/link marks outside the label span. Keep those local marks.
        // Template marks remain inherited. An explicitly removed mark needs a local normal override.
        for (const [tag, enabled, property, normal] of [["strong", field.bold, "font-weight", "normal"], ["em", field.italic, "font-style", "normal"], ["u", field.underline, "text-decoration", "none"], ["s", field.strike, "text-decoration", "none"], ["sup", field.superscript, "vertical-align", "baseline"], ["sub", field.subscript, "vertical-align", "baseline"]] as const) {
          if (!enabled) continue;
          const marked = fragment.closest(tag) || fragment.querySelector(tag);
          if (!marked) clone.style.setProperty(property, normal);
          clone.querySelectorAll(tag).forEach(mark => mark.replaceWith(...Array.from(mark.childNodes)));
        }
        if (inheritedHighlight) {
          if (!fragment.closest("mark") && !fragment.querySelector("mark")) clone.style.backgroundColor = "transparent";
          clone.querySelectorAll<HTMLElement>("mark").forEach(mark => { if (mark.style.backgroundColor === inheritedHighlight) mark.replaceWith(...Array.from(mark.childNodes)); });
        }
        let result = clone.outerHTML;
        let parent = fragment.parentElement;
        while (parent && parent.tagName !== "P" && parent !== body) {
          if (["STRONG", "EM", "U", "S", "A", "MARK", "SUP", "SUB"].includes(parent.tagName) && !(parent.tagName === "STRONG" && field.bold) && !(parent.tagName === "EM" && field.italic) && !(parent.tagName === "U" && field.underline) && !(parent.tagName === "S" && field.strike) && !(parent.tagName === "SUP" && field.superscript) && !(parent.tagName === "SUB" && field.subscript) && !(parent.tagName === "MARK" && inheritedHighlight === parent.style.backgroundColor)) { const wrapper = parent.cloneNode(false) as HTMLElement; wrapper.innerHTML = result; result = wrapper.outerHTML; }
          parent = parent.parentElement;
        }
        return { html: result, paragraph: fragment.closest("p") };
      });
      const richText = inlineValueHtml(local.map((item, index) => (index && item.paragraph !== local[index - 1].paragraph ? "<br>" : "") + item.html).join(""));
      const paragraph = fragments[0]?.closest("p"), baseParagraph = original?.closest("p");
      const changedParagraph = paragraph && baseParagraph ? ["text-align", "line-height", "padding-left", "text-indent", "tab-size"].filter(property => paragraph.style.getPropertyValue(property) !== baseParagraph.style.getPropertyValue(property)).map(property => `${property}: ${paragraph.style.getPropertyValue(property)}`).join("; ") : "";
      entry.values[field.id] = { ...entry.values[field.id], text: templateValueText(richText), richText, ...(valueParagraphStyle(changedParagraph) ? { paragraphStyle: valueParagraphStyle(`${entry.values[field.id]?.paragraphStyle || ""}; ${changedParagraph}`) } : {}) };
    }
  }
  // New text can inherit the preceding constant's mark when typed at the end of a line.
  // Keep those authored additions independent rather than letting a constant refresh erase them.
  const constants = new Set(template.rows.flatMap(row => templateInputFields(row.fields)).filter(field => field.kind === "constant").map(field => field.id));
  for (const span of Array.from(body.querySelectorAll<HTMLElement>("[data-field-instance]"))) {
    if (!constants.has(span.dataset.fieldLabel || "")) continue;
    const original = Array.from(defaults.querySelectorAll<HTMLElement>("[data-field-instance]")).find(item => item.dataset.fieldInstance === span.dataset.fieldInstance);
    if (original && span.textContent !== original.textContent) for (const attr of Array.from(span.attributes)) if (attr.name.startsWith("data-field-")) span.removeAttribute(attr.name);
  }
  const chunks = new Map(next.map(section => [section.id, ""]));
  let active = next[0]?.id;
  for (const element of Array.from(body.children)) {
    if (element.hasAttribute("data-template-section-separator")) continue;
    const mark = element.querySelector<HTMLElement>("[data-field-instance]");
    if (mark) { try { const id = JSON.parse(mark.dataset.fieldInstance!)[0]; if (chunks.has(id)) active = id; } catch { /* Unrecognized pasted labels remain ordinary text. */ } }
    if (active) chunks.set(active, chunks.get(active)! + element.outerHTML);
  }
  for (const section of next) section.editedText = { html: chunks.get(section.id) || "", baseline: renderCardTemplate(template, section.values, section.extraRows, section.rowRepeats, section.id).richText };
  return next;
}
