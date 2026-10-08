import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export interface CollapsibleRow { key: string; parent?: string; collapsible: boolean; collapsed: boolean }
/** A missing/empty heading never hides its children. Ancestor lookup also supports nested groups. */
export function hiddenTemplateRows(rows: CollapsibleRow[]): Set<string> {
  const byId = new Map(rows.map(row => [row.key, row]));
  return new Set(rows.filter(row => {
    let parent = row.parent;
    const visited = new Set([row.key]);
    while (parent && !visited.has(parent)) {
      visited.add(parent);
      const ancestor = byId.get(parent);
      if (!ancestor) break;
      if (ancestor.collapsible && ancestor.collapsed) return true;
      parent = ancestor.parent;
    }
    return false;
  }).map(row => row.key));
}

/** Keep all text in the document: collapsing only changes its presentation, never field values. */
export const TemplateRowCollapse = Extension.create({
  name: "templateRowCollapse",
  addGlobalAttributes() {
    return [{ types: ["paragraph"], attributes: {
      templateSectionSeparator: { default: false, parseHTML: element => element.hasAttribute("data-template-section-separator"), renderHTML: attrs => attrs.templateSectionSeparator ? { "data-template-section-separator": "true" } : {} },
      templateRow: { default: null, parseHTML: element => element.getAttribute("data-template-row"), renderHTML: attrs => attrs.templateRow ? { "data-template-row": attrs.templateRow } : {} },
      templateParent: { default: null, parseHTML: element => element.getAttribute("data-template-parent"), renderHTML: attrs => attrs.templateParent ? { "data-template-parent": attrs.templateParent } : {} },
      templateCollapsible: { default: false, parseHTML: element => element.getAttribute("data-template-collapsible") === "true", renderHTML: attrs => attrs.templateCollapsible ? { "data-template-collapsible": "true" } : {} },
      templateCollapsed: { default: false, parseHTML: element => element.getAttribute("data-template-collapsed") === "true", renderHTML: attrs => attrs.templateCollapsible ? { "data-template-collapsed": String(!!attrs.templateCollapsed) } : {} },
    } }];
  },
  addProseMirrorPlugins() {
    return [new Plugin({
      key: new PluginKey("templateRowCollapse"),
      props: { decorations: state => {
        const rows: (CollapsibleRow & { pos: number; size: number; text: string })[] = [];
        state.doc.descendants((node, pos) => {
          if (node.type.name === "paragraph" && node.attrs.templateRow) rows.push({ key: node.attrs.templateRow, parent: node.attrs.templateParent, collapsible: node.attrs.templateCollapsible, collapsed: node.attrs.templateCollapsed, pos, size: node.nodeSize, text: node.textContent });
        });
        const hidden = hiddenTemplateRows(rows);
        const decorations: Decoration[] = [];
        const headings = new Set<string>();
        for (const row of rows) {
          if (hidden.has(row.key)) decorations.push(Decoration.node(row.pos, row.pos + row.size, { style: "display: none", "aria-hidden": "true" }));
          if (!row.collapsible || headings.has(row.key) || !rows.some(child => child.parent === row.key)) continue;
          headings.add(row.key);
          decorations.push(Decoration.widget(row.pos + 1, view => {
            const button = document.createElement("button");
            button.type = "button";
            button.contentEditable = "false";
            button.dataset.templateToggle = "true";
            button.dataset.exportIgnore = "true";
            button.setAttribute("aria-expanded", String(!row.collapsed));
            button.setAttribute("aria-label", `${row.collapsed ? "Expand" : "Collapse"} ${row.text.trim().slice(0, 80) || "row"}`);
            button.title = row.collapsed ? "Expand rows" : "Collapse rows";
            button.textContent = row.collapsed ? "+" : "−";
            button.style.cssText = "display:inline-block;pointer-events:auto;cursor:pointer;color:var(--foreground,currentColor);background:none;border:0;padding:0 .3em 0 0;font:inherit;user-select:none";
            button.onmousedown = event => event.preventDefault();
            button.onkeydown = event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); button.click(); } };
            button.onclick = event => {
              event.preventDefault(); event.stopPropagation();
              const tr = view.state.tr;
              view.state.doc.descendants((node, pos) => {
                if (node.attrs.templateRow === row.key && node.attrs.templateCollapsible) tr.setNodeMarkup(pos, undefined, { ...node.attrs, templateCollapsed: !row.collapsed });
              });
              if (!row.collapsed) {
                const hiddenAfter = hiddenTemplateRows(rows.map(item => item.key === row.key ? { ...item, collapsed: true } : item));
                if (rows.some(item => hiddenAfter.has(item.key) && tr.selection.from >= item.pos && tr.selection.from < item.pos + item.size)) {
                  tr.setSelection(TextSelection.near(tr.doc.resolve(row.pos + 1)));
                }
              }
              view.dispatch(tr);
              view.dom.dispatchEvent(new CustomEvent("template-row-toggled", { bubbles: true }));
            };
            return button;
          }, { side: -1, key: `${row.key}:${row.collapsed}:${row.text}`, stopEvent: () => true }));
        }
        return DecorationSet.create(state.doc, decorations);
      } },
    })];
  },
});
