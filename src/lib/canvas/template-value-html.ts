import { sanitizePastedHtml, richTextToPlainText } from "./rich-text-paste";

/** Values are inline content; retain safe formatting while converting paragraphs to line breaks. */
export function inlineValueHtml(html: string): string {
  // Server-side rendering has no DOMParser. Preserve only inert typography declarations
  // through the conservative clipboard fallback, which otherwise removes every style.
  const styles: string[] = [];
  if (typeof DOMParser === "undefined") html = html.replace(/\sdata-template-safe-style=(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "").replace(/\sstyle=(?:"([^"]*)"|'([^']*)')/gi, (_match, double: string, single: string) => {
    const style = (double ?? single).split(";").filter(declaration => {
      const [property, value] = declaration.split(":").map(part => part.trim());
      return /^(color|background-color|font-family|font-size|font-style|font-weight|text-decoration|vertical-align|letter-spacing)$/.test(property)
        && !!value && /^[a-z0-9#.,()%\s'"_-]+$/i.test(value) && !/url|expression/i.test(value);
    }).join("; ");
    styles.push(style.replace(/"/g, "&quot;"));
    return ` data-template-safe-style="${styles.length - 1}"`;
  });
  const safe = sanitizePastedHtml(`<div data-pm-slice="0 0 []">${html}</div>`, true)
    .replace(/data-template-safe-style="(\d+)"/g, (_match, index: string) => `style="${styles[Number(index)] || ""}"`);
  return safe.replace(/<\/?div\b[^>]*>/gi, "").replace(/<\/p>\s*<p\b[^>]*>/gi, "<br>").replace(/<\/?p\b[^>]*>/gi, "");
}
export function templateValueText(html: string): string {
  return richTextToPlainText("x" + html + "x").slice(1, -1);
}

/** Refresh changed template values without replacing surrounding hand-edited text. */
export function refreshEditedTemplate(html: string, baseline: string, generated: string): string {
  if (baseline === generated || typeof DOMParser === "undefined") return html;
  const parse = (value: string) => new DOMParser().parseFromString(value, "text/html").body;
  const body = parse(html), before = parse(baseline), after = parse(generated);
  const spans = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLElement>("[data-field-instance]")).filter(span => !span.parentElement?.closest("[data-field-instance]"));
  for (const paragraph of Array.from(after.querySelectorAll<HTMLElement>("p"))) {
    const key = spans(paragraph)[0]?.dataset.fieldInstance;
    if (!key) continue;
    const oldParagraph = spans(before).find(span => span.dataset.fieldInstance === key)?.closest("p");
    const target = spans(body).find(span => span.dataset.fieldInstance === key)?.closest("p");
    if (!oldParagraph || !target) continue;
    for (const attribute of ["data-template-row", "data-template-parent", "data-template-collapsible"]) {
      const value = paragraph.getAttribute(attribute);
      if (value !== null) target.setAttribute(attribute, value); else target.removeAttribute(attribute);
    }
    if (!target.hasAttribute("data-template-collapsed")) target.setAttribute("data-template-collapsed", paragraph.getAttribute("data-template-collapsed") || "false");
    for (const property of ["line-height", "text-align", "padding-left"]) {
      const current = target.style.getPropertyValue(property);
      if (!current || current === oldParagraph.style.getPropertyValue(property)) target.style.setProperty(property, paragraph.style.getPropertyValue(property));
    }
  }
  const keys = new Set([...spans(before), ...spans(after)].map(span => span.dataset.fieldInstance!));
  for (const key of keys) {
    const old = spans(before).filter(span => span.dataset.fieldInstance === key);
    const next = spans(after).filter(span => span.dataset.fieldInstance === key);
    if (old.map(span => span.outerHTML).join("") === next.map(span => span.outerHTML).join("")) continue;
    const targets = spans(body).filter(span => span.dataset.fieldInstance === key);
    if (targets.length) {
      for (const span of next) targets[0].before(span.cloneNode(true));
      for (const target of targets) {
        const parent = target.closest("p"); target.remove();
        if (parent && !parent.textContent?.trim() && !parent.querySelector("[data-field-instance]")) parent.remove();
      }
    } else if (next.length && !old.length) {
      // Insert a newly populated field alongside its row; new rows follow the closest preceding row.
      const paragraph = next[0].closest("p");
      const sibling = paragraph && spans(paragraph).find(span => spans(body).some(target => target.dataset.fieldInstance === span.dataset.fieldInstance));
      if (sibling) {
        const anchor = spans(body).find(span => span.dataset.fieldInstance === sibling.dataset.fieldInstance)!;
        const order = spans(paragraph!);
        if (order.indexOf(next[0]) < order.indexOf(sibling)) anchor.before(next[0].cloneNode(true));
        else anchor.after(next[0].cloneNode(true));
      } else if (paragraph) {
        const preceding = spans(after).slice(0, spans(after).indexOf(next[0])).reverse().find(span => spans(body).some(target => target.dataset.fieldInstance === span.dataset.fieldInstance));
        const anchor = preceding && spans(body).find(span => span.dataset.fieldInstance === preceding.dataset.fieldInstance)?.closest("p");
        if (anchor) anchor.after(paragraph.cloneNode(true)); else body.append(paragraph.cloneNode(true));
      }
    }
  }
  return body.innerHTML;
}

/** TipTap parses nested textStyle spans independently. Carry inherited defaults and identity into each run. */
export function decorateTemplateValue(content: string, attributes: Record<string, string>, style: string): string {
  if (typeof DOMParser === "undefined") return content;
  const body = new DOMParser().parseFromString(`<span style="${style}">${content}</span>`, "text/html").body;
  const root = body.firstElementChild as HTMLElement;
  for (const span of Array.from(root.querySelectorAll<HTMLElement>("span"))) {
    for (const [name, value] of Object.entries(attributes)) span.setAttribute(name, value);
    for (const property of ["color", "font-size", "font-family"]) {
      if (span.style.getPropertyValue(property)) continue;
      let parent = span.parentElement;
      while (parent && parent !== body) {
        const value = parent.style.getPropertyValue(property);
        if (value) { span.style.setProperty(property, value); break; }
        parent = parent.parentElement;
      }
    }
  }
  return root.innerHTML;
}

/** Only paragraph formatting can be overridden here; never carry arbitrary layout CSS from imported values. */
export function valueParagraphStyle(style: string): string {
  const rules: string[] = [];
  for (const declaration of style.split(";")) {
    const [property, raw] = declaration.split(":").map(value => value.trim());
    if (property === "text-align" && ["left", "center", "right", "justify"].includes(raw)) rules.push(`${property}: ${raw}`);
    if (["line-height", "padding-left", "text-indent", "tab-size"].includes(property) && /^-?\d+(\.\d+)?(em|px)?$/.test(raw) && Math.abs(parseFloat(raw)) <= 100) rules.push(`${property}: ${raw}`);
  }
  return rules.join("; ");
}
