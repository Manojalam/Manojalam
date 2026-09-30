import type { SampleCardEntry, SampleCardTemplate, SampleLabel } from "../types";
import { captureTemplateStyle } from "./board-style-templates";
import { normalizeHexColor } from "./custom-colors";
import { richTextToPlainText, sanitizePastedHtml } from "./rich-text-paste";
import { safeCardLink } from "./card-templates";

const bounded = (value: unknown, fallback: number, min: number, max: number) => typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
export function newSampleLabel(id: string, name: string): SampleLabel {
  return { id, name, kind: "text", color: "#2563eb", fontSize: 20, fontFamily: "inherit", bold: false, italic: false, underline: false, lineHeight: 1.5, background: "transparent", borderColor: "#cbd5e1", padding: 4 };
}
export function sampleLabelStyle(label: SampleLabel): Record<string, string | number> {
  return { color: label.color, fontSize: `${label.fontSize}px`, fontFamily: label.fontFamily, fontWeight: label.bold ? "700" : "400", fontStyle: label.italic ? "italic" : "normal", textDecoration: label.underline ? "underline" : "none", lineHeight: label.lineHeight, backgroundColor: label.background, borderColor: label.borderColor, padding: `${label.padding}px` };
}

function container(html: string): HTMLDivElement | null {
  if (typeof document === "undefined") return null;
  const root = document.createElement("div");
  root.innerHTML = sanitizePastedHtml(`<div data-pm-slice="0 0 []">${html}</div>`, true);
  const wrapper = root.querySelector("[data-pm-slice]");
  if (wrapper) root.innerHTML = wrapper.innerHTML;
  return root;
}

/** Keep authored paragraphs/fixed content, updating only the tagged parts. */
export function refreshSampleFields(html: string, labels: SampleLabel[]): string {
  const root = container(html);
  if (!root) return html;
  const seen = new Set<string>();
  root.querySelectorAll<HTMLElement>("[data-sample-field]").forEach(field => {
    const label = labels.find(item => item.id === field.dataset.sampleLabel);
    if (!label) { field.replaceWith(...Array.from(field.childNodes)); return; }
    let id = field.dataset.sampleField ?? "";
    if (!id || seen.has(id)) id = crypto.randomUUID();
    seen.add(id);
    field.dataset.sampleField = id;
    field.dataset.sampleName = label.name;
    field.dataset.sampleWidth = String(bounded(Number(field.dataset.sampleWidth), 220, 60, 1600));
    Object.assign(field.style, sampleLabelStyle(label));
  });
  return root.innerHTML;
}

export function sampleFields(html: string) {
  const root = container(html);
  return Array.from(root?.querySelectorAll<HTMLElement>("[data-sample-field]") ?? []).map(field => ({
    id: field.dataset.sampleField!, labelId: field.dataset.sampleLabel!, width: Number(field.dataset.sampleWidth) || 220, sample: field.textContent ?? "",
  }));
}

export function resizeSampleField(html: string, id: string, width: number): string {
  const root = container(html);
  if (!root) return html;
  root.querySelectorAll<HTMLElement>("[data-sample-field]").forEach(field => { if (field.dataset.sampleField === id) field.dataset.sampleWidth = String(bounded(width, 220, 60, 1600)); });
  return root.innerHTML;
}

export function sampleEntryHtml(template: SampleCardTemplate, entry: SampleCardEntry, index: number, slots = false): string {
  const root = container(template.richText);
  if (!root) return template.richText;
  root.querySelectorAll<HTMLElement>("[data-sample-field]").forEach(field => {
    const label = template.labels.find(item => item.id === field.dataset.sampleLabel);
    if (!label) return;
    const id = field.dataset.sampleField!;
    const width = Number(field.dataset.sampleWidth) || 220;
    const value = entry.values[id];
    const text = label.kind === "number" ? String(index + 1) : value?.text ?? "";
    field.replaceChildren();
    Object.assign(field.style, sampleLabelStyle(label), { display: "inline-block", verticalAlign: "top", width: `${width}px`, maxWidth: "100%", whiteSpace: "pre-wrap", borderStyle: "solid", borderWidth: "1px", borderRadius: "4px", boxSizing: "border-box" });
    if (slots && label.kind !== "number") {
      field.dataset.sampleSlot = `${entry.id}:${id}`;
      return;
    }
    const href = safeCardLink(value?.href);
    const content = document.createElement(href ? "a" : "span");
    if (href) { content.setAttribute("href", href); content.setAttribute("target", "_blank"); content.setAttribute("rel", "noopener noreferrer"); }
    content.textContent = text || "\u00a0";
    field.append(content);
  });
  return root.innerHTML;
}

export function sampleCardData(template: SampleCardTemplate, entries: SampleCardEntry[]) {
  const richText = entries.map((entry, index) => sampleEntryHtml(template, entry, index)).join("<p><br></p>");
  return { ...Object.fromEntries(Object.entries(template.style).map(([key, value]) => [key, value === null ? undefined : value])),
    sampleTemplateId: template.id, sampleTemplateSnapshot: structuredClone(template), sampleEntries: entries,
    richText, text: richTextToPlainText(richText), autoSizeMode: "height-only", textVerticalAlign: "top", maximizeText: false,
    layoutAutoFill: false, layoutAutoBorder: false, layoutAutoText: false, layoutAutoTypography: false,
  };
}

export function normalizeSampleTemplates(value: unknown): SampleCardTemplate[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  const styleKeys = new Set(Object.keys(captureTemplateStyle({})));
  return value.flatMap(item => {
    if (!item || typeof item.id !== "string" || !item.id || ids.has(item.id) || typeof item.name !== "string" || !item.name.trim() || typeof item.richText !== "string" || !Array.isArray(item.labels)) return [];
    ids.add(item.id);
    const labelIds = new Set<string>();
    const labels: SampleLabel[] = [];
    for (const label of item.labels) {
      if (!label || typeof label.id !== "string" || !label.id || labelIds.has(label.id) || typeof label.name !== "string" || !label.name.trim()) continue;
      labelIds.add(label.id);
      labels.push({ ...newSampleLabel(label.id, label.name.trim()),
        kind: label.kind === "sutra" || label.kind === "number" ? label.kind : "text",
        color: label.color === "inherit" || label.color === "" ? "inherit" : normalizeHexColor(label.color) ?? "#2563eb", background: normalizeHexColor(label.background) ?? "transparent", borderColor: label.borderColor === "transparent" || label.borderColor === "" ? "transparent" : normalizeHexColor(label.borderColor) ?? "#cbd5e1",
        fontSize: bounded(label.fontSize, 20, 6, 120), lineHeight: bounded(label.lineHeight, 1.5, 1, 4), padding: bounded(label.padding, 4, 0, 32),
        fontFamily: typeof label.fontFamily === "string" && label.fontFamily.length < 200 ? label.fontFamily : "inherit",
        bold: label.bold === true, italic: label.italic === true, underline: label.underline === true,
      });
    }
    return [{ id: item.id, name: item.name.trim(), labels, richText: refreshSampleFields(item.richText, labels),
      style: Object.fromEntries(Object.entries(item.style ?? {}).filter(([key]) => styleKeys.has(key))),
      width: bounded(item.width, 800, 120, 4000), height: bounded(item.height, 300, 80, 4000),
    }];
  });
}
