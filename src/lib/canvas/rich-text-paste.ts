function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const UNSAFE_PASTE_ELEMENTS = [
  "script", "style", "iframe", "object", "embed", "link", "meta", "base",
  "form", "input", "button", "textarea", "select", "option", "svg", "math",
] as const;

const LAYOUT_STYLE_PROPERTIES = [
  "position", "inset", "top", "right", "bottom", "left", "z-index",
  "display", "float", "clear", "transform", "transform-origin", "zoom",
  "width", "height", "min-width", "min-height", "max-width", "max-height",
  "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
  "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
] as const;

const EXTERNAL_TYPOGRAPHY_PROPERTIES = [
  "font", "font-size", "font-family", "line-height", "letter-spacing",
  "color", "background", "background-color", "text-indent",
] as const;

const SAFE_EXTERNAL_ELEMENTS = new Set([
  "P", "BR", "STRONG", "B", "EM", "I", "U", "S", "DEL", "SPAN",
  "UL", "OL", "LI", "BLOCKQUOTE", "PRE", "CODE", "H1", "H2", "H3",
  "H4", "H5", "H6",
]);

function fallbackSanitizePastedHtml(html: string): string {
  const unsafe = UNSAFE_PASTE_ELEMENTS.join("|");
  return trimExternalHtmlBoundaries(html
    .replace(new RegExp(`<(${unsafe})\\b[^>]*>[\\s\\S]*?<\\/\\1\\s*>`, "gi"), "")
    .replace(new RegExp(`<(${unsafe})\\b[^>]*\\/?>`, "gi"), "")
    .replace(/\s(?:style|class|id|contenteditable|draggable)=(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\son[a-z]+=(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/<font\b[^>]*>/gi, "<span>")
    .replace(/<\/font\s*>/gi, "</span>"));
}

const EMPTY_BOUNDARY_BLOCK = "(?:p|div|h[1-6]|blockquote|li)";

function trimExternalHtmlBoundaries(html: string): string {
  let normalized = html.trim();
  const leadingEmptyBlock = new RegExp(
    `^(?:<${EMPTY_BOUNDARY_BLOCK}\\b[^>]*>(?:\\s|&nbsp;|<br\\s*\\/?>)*<\\/${EMPTY_BOUNDARY_BLOCK}>\\s*)+`,
    "i"
  );
  const trailingEmptyBlock = new RegExp(
    `(?:<${EMPTY_BOUNDARY_BLOCK}\\b[^>]*>(?:\\s|&nbsp;|<br\\s*\\/?>)*<\\/${EMPTY_BOUNDARY_BLOCK}>\\s*)+$`,
    "i"
  );
  normalized = normalized.replace(leadingEmptyBlock, "").replace(trailingEmptyBlock, "");
  return normalized
    .replace(/^(<(?:p|div|h[1-6]|blockquote|li)\b[^>]*>)(?:\s|&nbsp;)+/i, "$1")
    .replace(/(?:\s|&nbsp;)+(<\/(?:p|div|h[1-6]|blockquote|li)>\s*)$/i, "$1");
}

function firstTextNode(root: globalThis.Node): Text | null {
  if (root.nodeType === globalThis.Node.TEXT_NODE) return root as Text;
  for (const child of Array.from(root.childNodes)) {
    const match = firstTextNode(child);
    if (match) return match;
  }
  return null;
}

function lastTextNode(root: globalThis.Node): Text | null {
  if (root.nodeType === globalThis.Node.TEXT_NODE) return root as Text;
  const children = Array.from(root.childNodes);
  for (let index = children.length - 1; index >= 0; index -= 1) {
    const match = lastTextNode(children[index]);
    if (match) return match;
  }
  return null;
}

function isEmptyBoundaryElement(element: Element): boolean {
  return /^(P|DIV|H[1-6]|BLOCKQUOTE|LI)$/.test(element.tagName)
    && !element.textContent?.replace(/\u00a0/g, " ").trim()
    && !element.querySelector("img,video,audio,table,hr");
}

function trimExternalDomBoundaries(body: HTMLElement): void {
  while (body.firstChild) {
    const first = body.firstChild;
    const removable = first.nodeType === globalThis.Node.TEXT_NODE
      ? !first.textContent?.replace(/\u00a0/g, " ").trim()
      : first instanceof Element && isEmptyBoundaryElement(first);
    if (!removable) break;
    first.remove();
  }
  while (body.lastChild) {
    const last = body.lastChild;
    const removable = last.nodeType === globalThis.Node.TEXT_NODE
      ? !last.textContent?.replace(/\u00a0/g, " ").trim()
      : last instanceof Element && isEmptyBoundaryElement(last);
    if (!removable) break;
    last.remove();
  }
  const first = firstTextNode(body);
  const last = lastTextNode(body);
  if (first) first.data = first.data.replace(/^[\s\u00a0]+/, "");
  if (last) last.data = last.data.replace(/[\s\u00a0]+$/, "");
}

function unwrapElement(element: Element): void {
  const parent = element.parentNode;
  if (!parent) return;
  while (element.firstChild) parent.insertBefore(element.firstChild, element);
  parent.removeChild(element);
}

/**
 * Normalize external document HTML before TipTap parses it. Internal TipTap
 * copies retain their authored text marks, but layout and unsafe markup are
 * stripped in both cases.
 */
export function sanitizePastedHtml(html: string): string {
  if (typeof DOMParser === "undefined") return fallbackSanitizePastedHtml(html);

  const parsed = new DOMParser().parseFromString(html, "text/html");
  const internalTipTapCopy = parsed.body.querySelector("[data-pm-slice]") !== null;

  parsed.body.querySelectorAll(UNSAFE_PASTE_ELEMENTS.join(",")).forEach((element) => element.remove());

  for (const element of Array.from(parsed.body.querySelectorAll<HTMLElement>("*"))) {
    const fontStyle = element.style.fontStyle;
    const fontWeight = element.style.fontWeight;

    for (const property of LAYOUT_STYLE_PROPERTIES) element.style.removeProperty(property);
    if (!internalTipTapCopy) {
      for (const property of EXTERNAL_TYPOGRAPHY_PROPERTIES) element.style.removeProperty(property);
      const keepItalic = fontStyle === "italic" || fontStyle === "oblique";
      const numericWeight = Number.parseInt(fontWeight, 10);
      const keepBold = fontWeight === "bold" || fontWeight === "bolder" || numericWeight >= 600;
      element.removeAttribute("style");
      if (keepItalic) element.style.fontStyle = "italic";
      if (keepBold) element.style.fontWeight = "bold";
    }

    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const safeInternalAttribute = internalTipTapCopy
        && (name === "style" || name === "data-pm-slice" || name === "data-pm-node");
      const safeListAttribute = element.tagName === "OL" && name === "start";
      if (name.startsWith("on") || name === "contenteditable" || name === "draggable") {
        element.removeAttribute(attribute.name);
      } else if (!safeInternalAttribute && !safeListAttribute && name !== "style") {
        element.removeAttribute(attribute.name);
      }
    }

    if (!element.style.cssText.trim()) element.removeAttribute("style");
    if (element.tagName === "FONT") {
      const replacement = parsed.createElement("span");
      while (element.firstChild) replacement.appendChild(element.firstChild);
      element.replaceWith(replacement);
      continue;
    }
    if (!SAFE_EXTERNAL_ELEMENTS.has(element.tagName) && !internalTipTapCopy) unwrapElement(element);
  }

  if (!internalTipTapCopy) trimExternalDomBoundaries(parsed.body);

  return parsed.body.innerHTML;
}

/** Remove clipboard padding without changing spaces or line breaks inside the text. */
export function normalizePastedText(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim();
}

export function plainTextToRichText(value: string): string {
  const normalized = normalizePastedText(value);
  if (!normalized) return "";
  return normalized
    .split(/\n{2,}/)
    .map((paragraph) => {
      const lines = paragraph.split("\n").map(escapeHtml);
      return `<p>${lines.join("<br>")}</p>`;
    })
    .join("");
}

export function richTextToPlainText(html: unknown): string {
  if (typeof html !== "string") return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

/** Append an OS-clipboard text paste without flattening existing TipTap marks. */
export function appendPlainTextToRichText(
  existingRichText: unknown,
  existingPlainText: string,
  pastedText: string
): string {
  const existing = typeof existingRichText === "string" && existingRichText.trim()
    ? existingRichText.trim()
    : plainTextToRichText(existingPlainText);
  const addition = plainTextToRichText(pastedText);
  if (!existing) return addition;
  if (!addition) return existing;
  return `${existing}${addition}`;
}
