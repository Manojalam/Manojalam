import type { Editor } from "@tiptap/core";
import { colorSwatchHex } from "./custom-colors";
import type { RichTextSelectionRange } from "./rich-text-toolbar";

/** Resolve visible colors, including node inheritance and board link overrides. */
export function renderedSelectionTextColor(
  editor: Editor,
  selectedRanges?: readonly RichTextSelectionRange[]
): string | null | "mixed" {
  if (!editor.isInitialized || editor.isDestroyed) return null;
  const view = editor.view;
  const win = view.dom.ownerDocument.defaultView;
  if (!win) return null;
  const colors = new Set<string>();
  const addColor = (node: globalThis.Node | null) => {
    const element = node?.nodeType === 1 ? node as Element : node?.parentElement;
    if (!element) return;
    const color = colorSwatchHex(win.getComputedStyle(element).color);
    if (color) colors.add(color);
  };
  const ranges = selectedRanges?.length ? selectedRanges : [editor.state.selection];
  for (const { from, to } of ranges) {
    if (from === to) {
      addColor(view.nodeDOM(from) ?? view.domAtPos(from).node);
    } else {
      editor.state.doc.nodesBetween(from, to, (node, position) => {
        if (node.isText) addColor(view.nodeDOM(position));
      });
    }
  }
  return colors.size > 1 ? "mixed" : colors.values().next().value ?? null;
}
