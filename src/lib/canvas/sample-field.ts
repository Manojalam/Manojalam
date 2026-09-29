import { Node, mergeAttributes, type Editor } from "@tiptap/core";

export const SampleField = Node.create({
  name: "sampleField", group: "inline", inline: true, content: "inline*", draggable: true,
  addAttributes() {
    return Object.fromEntries([
      ["fieldId", "data-sample-field"], ["labelId", "data-sample-label"], ["labelName", "data-sample-name"], ["width", "data-sample-width"], ["labelStyle", "style"],
    ].map(([key, attr]) => [key, { default: key === "width" ? "220" : "", parseHTML: (element: HTMLElement) => element.getAttribute(attr), renderHTML: (attrs: Record<string, unknown>) => ({ [attr]: attrs[key] }) }]));
  },
  parseHTML() { return [{ tag: "span[data-sample-field]" }]; },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { class: "sample-field-source", style: `display:inline-block;vertical-align:top;max-width:100%;width:${Math.max(60, Math.min(1600, Number(HTMLAttributes["data-sample-width"]) || 220))}px` }), 0];
  },
});

export function tagSampleSelection(editor: Editor, from: number, to: number, labelId: string, labelName: string, width: number): boolean {
  const start = editor.state.doc.resolve(from);
  const end = editor.state.doc.resolve(to);
  if (from >= to || start.parent !== end.parent) return false;
  let nested = false;
  editor.state.doc.nodesBetween(from, to, node => { if (node.type.name === "sampleField") nested = true; });
  if (nested || start.parent.type.name === "sampleField") return false;
  const content = editor.state.doc.slice(from, to).content.toJSON();
  return editor.chain().focus().setTextSelection({ from, to }).insertContent({ type: "sampleField", attrs: { fieldId: crypto.randomUUID(), labelId, labelName, width }, content }).run();
}
