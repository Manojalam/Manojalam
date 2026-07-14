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
  return html
    .replace(new RegExp(`<(${unsafe})\\b[^>]*>[\\s\\S]*?<\\/\\1\\s*>`, "gi"), "")
    .replace(new RegExp(`<(${unsafe})\\b[^>]*\\/?>`, "gi"), "")
    .replace(/\s(?:style|class|id|contenteditable|draggable)=(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\son[a-z]+=(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/<font\b[^>]*>/gi, "<span>")
    .replace(/<\/font\s*>/gi, "</span>");
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

  return parsed.body.innerHTML;
}

export function plainTextToRichText(value: string): string {
  const normalized = value.replace(/\r\n/g, "\n").trimEnd();
  if (!normalized.trim()) return "";
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
