import { Extension } from "@tiptap/core";
import type { Command } from "@tiptap/core";
import { plainTextToRichText } from "./rich-text-paste";

export const PARAGRAPH_FIELDS = {
  lineSpacing: { label: "Line spacing", css: "line-height", min: 1, max: 4, step: 0.05, fallback: 1.375, unit: "" },
  paragraphIndent: { label: "Paragraph indent (em)", css: "padding-left", min: 0, max: 20, step: 0.5, fallback: 0, unit: "em" },
  firstLineIndent: { label: "First-line indent (em)", css: "text-indent", min: -10, max: 20, step: 0.5, fallback: 0, unit: "em" },
  tabSize: { label: "Tab width (spaces)", css: "tab-size", min: 1, max: 16, step: 1, fallback: 4, unit: "" },
} as const;
export type ParagraphField = keyof typeof PARAGRAPH_FIELDS;
export const PARAGRAPH_KEYS = Object.keys(PARAGRAPH_FIELDS) as ParagraphField[];
export function isParagraphField(key: string): key is ParagraphField {
  return Object.prototype.hasOwnProperty.call(PARAGRAPH_FIELDS, key);
}
export function paragraphValue(key: ParagraphField, value: unknown): number {
  const spec = PARAGRAPH_FIELDS[key];
  const number = value == null || value === "" ? spec.fallback : Number(value);
  const bounded = Number.isFinite(number) ? Math.max(spec.min, Math.min(spec.max, number)) : spec.fallback;
  return key === "tabSize" ? Math.round(bounded) : bounded;
}

/** Rich text is authoritative after per-paragraph changes or keyboard indents. */
export function storedParagraphValue(data: Record<string, unknown>, key: ParagraphField): number {
  if (typeof document === "undefined" || typeof data.richText !== "string" || !data.richText) {
    return paragraphValue(key, data[key]);
  }
  const container = document.createElement("div");
  container.innerHTML = data.richText;
  const block = container.querySelector<HTMLElement>("p,h1,h2,h3,h4,h5,h6");
  const raw = block?.style.getPropertyValue(PARAGRAPH_FIELDS[key].css);
  return paragraphValue(key, raw ? Number.parseFloat(raw) : undefined);
}

export function paragraphFormatPatch(data: Record<string, unknown>, key: ParagraphField, value: unknown) {
  const number = paragraphValue(key, value);
  const container = document.createElement("div");
  container.innerHTML = typeof data.richText === "string" && data.richText
    ? data.richText : plainTextToRichText(String(data.text ?? "")) || "<p></p>";
  const spec = PARAGRAPH_FIELDS[key];
  container.querySelectorAll<HTMLElement>("p,h1,h2,h3,h4,h5,h6").forEach(element => {
    element.style.setProperty(spec.css, `${number}${spec.unit}`);
  });
  return { [key]: number, richText: container.innerHTML };
}

export function adjustParagraphIndent(delta: number): Command {
  return ({ tr, dispatch }) => {
    const { from, to } = tr.selection;
    tr.doc.nodesBetween(from, to, (node, position) => {
      if (node.type.name !== "paragraph" && node.type.name !== "heading") return;
      if (dispatch) tr.setNodeMarkup(position, undefined, {
        ...node.attrs,
        paragraphIndent: paragraphValue("paragraphIndent", (node.attrs.paragraphIndent ?? 0) + delta),
      });
    });
    return true;
  };
}

export const ParagraphLayout = Extension.create({
  name: "paragraphLayout",
  priority: 1100,
  addGlobalAttributes() {
    return [{
      types: ["paragraph", "heading"],
      attributes: Object.fromEntries(PARAGRAPH_KEYS.map(key => {
        const spec = PARAGRAPH_FIELDS[key];
        return [key, {
          default: null,
          parseHTML: (element: HTMLElement) => {
            const raw = element.style.getPropertyValue(spec.css);
            return raw ? paragraphValue(key, Number.parseFloat(raw)) : null;
          },
          renderHTML: (attrs: Record<string, unknown>) => attrs[key] == null ? {} : {
            style: `${spec.css}: ${paragraphValue(key, attrs[key])}${spec.unit}`,
          },
        }];
      })),
    }];
  },
  addKeyboardShortcuts() {
    return {
      Tab: () => {
        if (this.editor.isActive("codeBlock")) return false;
        if (this.editor.isActive("listItem")) {
          this.editor.commands.sinkListItem("listItem");
          return true;
        }
        if (!this.editor.state.selection.empty) return this.editor.commands.command(adjustParagraphIndent(1));
        return this.editor.commands.insertContent({ type: "text", text: "\t" });
      },
      "Shift-Tab": () => {
        if (this.editor.isActive("codeBlock")) return false;
        if (this.editor.isActive("listItem")) return this.editor.commands.liftListItem("listItem");
        const { selection, doc } = this.editor.state;
        if (selection.empty && selection.$from.parentOffset > 0 && doc.textBetween(selection.from - 1, selection.from) === "\t") {
          return this.editor.commands.deleteRange({ from: selection.from - 1, to: selection.from });
        }
        return this.editor.commands.command(adjustParagraphIndent(-1));
      },
      "Mod-]": () => this.editor.commands.command(adjustParagraphIndent(1)),
      "Mod-[": () => this.editor.commands.command(adjustParagraphIndent(-1)),
    };
  },
});
