import { templateInputFields } from "./card-templates";
import type { BoardSettings, BoardCardTemplate, SampleCardTemplate } from "../types";
import { richTextToPlainText } from "./rich-text-paste";
import { sampleLabelStyle } from "./sample-templates";

export function flexibleCardLabels(data: Record<string, unknown>, settings: Pick<BoardSettings, "cardTemplates" | "sampleTemplates">) {
  const card = settings.cardTemplates?.find(item => item.id === data.cardTemplateId) ?? data.cardTemplateSnapshot as BoardCardTemplate | undefined;
  if (card) return card.rows.flatMap(row => templateInputFields(row.fields).map(field => ({ id: field.id, name: field.label, owner: "card:" + card.id, style: { color: field.color || "inherit" } as Record<string, string | number> })));
  const sample = settings.sampleTemplates?.find(item => item.id === data.sampleTemplateId) ?? data.sampleTemplateSnapshot as SampleCardTemplate | undefined;
  return sample?.labels.map(label => ({ id: label.id, name: label.name, owner: "sample:" + sample.id, style: sampleLabelStyle(label) })) ?? [];
}

/** Labeled spans flow like ordinary text; shared styles never rebuild their paragraphs. */
export function flexibleCardContent(data: Record<string, unknown>, settings: Pick<BoardSettings, "cardTemplates" | "sampleTemplates">) {
  if (typeof document === "undefined") return { richText: String(data.richText ?? ""), text: String(data.text ?? "") };
  const root = document.createElement("div");
  root.innerHTML = String(data.richText ?? "");
  const ownLabels = flexibleCardLabels(data, settings);
  root.querySelectorAll<HTMLElement>("[data-sample-field]").forEach(element => {
    const label = ownLabels.find(item => item.id === element.dataset.sampleLabel);
    if (label) {
      element.dataset.fieldLabel = label.id; element.dataset.fieldOwner = label.owner; element.dataset.fieldName = label.name;
    }
    // Plain content spans must not replace the owning TextStyle mark during parsing.
    element.querySelectorAll("span:not([data-field-label])").forEach(child => child.replaceWith(...Array.from(child.childNodes)));
    for (const attribute of Array.from(element.attributes)) if (attribute.name.startsWith("data-sample-") || attribute.name === "class") element.removeAttribute(attribute.name);
    for (const property of ["display", "width", "max-width", "height", "vertical-align", "padding", "border", "border-style", "border-width", "border-color", "border-radius", "box-sizing"]) element.style.removeProperty(property);
  });
  root.querySelectorAll<HTMLElement>("[data-field-label]").forEach(element => {
    const owner = element.dataset.fieldOwner;
    const label = ownLabels.find(item => item.id === element.dataset.fieldLabel && item.owner === owner)
      ?? settings.cardTemplates?.flatMap(template => flexibleCardLabels({ cardTemplateId: template.id }, settings)).find(item => item.id === element.dataset.fieldLabel && item.owner === owner)
      ?? settings.sampleTemplates?.flatMap(template => flexibleCardLabels({ sampleTemplateId: template.id }, settings)).find(item => item.id === element.dataset.fieldLabel && item.owner === owner);
    if (!label) return; // Keep the cached label/style when its source template is unavailable.
    element.dataset.fieldName = label.name;
    const { color, fontSize, fontFamily, fontWeight, fontStyle, textDecoration, lineHeight } = label.style;
    Object.assign(element.style, Object.fromEntries(Object.entries({ color, fontSize, fontFamily, fontWeight, fontStyle, textDecoration, lineHeight }).filter(([, value]) => value !== undefined)));
  });
  const richText = root.innerHTML;
  return { richText, text: richTextToPlainText(richText) };
}
