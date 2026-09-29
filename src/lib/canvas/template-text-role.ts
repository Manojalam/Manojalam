import { Extension } from "@tiptap/core";

/** Semantic color ownership persists alongside TextStyle marks. */
export const TemplateTextRole = Extension.create({
  name: "templateTextRole",
  addGlobalAttributes() {
    return [{ types: ["textStyle"], attributes: { templateRole: {
      default: null,
      parseHTML: element => element.getAttribute("data-template-role"),
      renderHTML: attrs => attrs.templateRole ? { "data-template-role": attrs.templateRole } : {},
    } } }];
  },
});
