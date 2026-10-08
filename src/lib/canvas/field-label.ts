import { Extension } from "@tiptap/core";

/** Labels are inline metadata, so clipboard slices retain them even across paragraphs. */
export const FieldLabel = Extension.create({
  name: "fieldLabel",
  addGlobalAttributes() {
    return [{ types: ["textStyle"], attributes: Object.fromEntries([
      ["fieldLabel", "data-field-label"], ["fieldOwner", "data-field-owner"], ["fieldName", "data-field-name"], ["fieldInstance", "data-field-instance"],
    ].map(([key, attribute]) => [key, {
      default: null,
      parseHTML: (element: HTMLElement) => element.getAttribute(attribute) ?? element.parentElement?.closest(`[${attribute}]`)?.getAttribute(attribute) ?? null,
      renderHTML: (attrs: Record<string, unknown>) => attrs[key] ? { [attribute]: attrs[key] } : {},
    }])) }];
  },
});
