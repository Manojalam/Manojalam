import { defaultEnclosedSymbolTextColor } from "./symbol-style";

export const ENCLOSED_STICKER_SELECTOR =
  '[data-vidya-symbol][data-symbol-enclosure]:not([data-symbol-enclosure="none"])';

const DEFAULT_STICKER_FONT_FAMILY =
  "var(--font-noto-devanagari), 'Noto Sans Devanagari', sans-serif";

type StickerTypographyProperty =
  | "color"
  | "font-family"
  | "font-size"
  | "font-style"
  | "font-weight";

export function isInsideEnclosedSticker(element: Element): boolean {
  return element.closest(ENCLOSED_STICKER_SELECTOR) !== null;
}

function textElementLineage(symbol: HTMLElement, container: HTMLElement): HTMLElement[] {
  const walker = document.createTreeWalker(symbol, NodeFilter.SHOW_TEXT);
  const textNode = walker.nextNode() as Text | null;
  const lineage: HTMLElement[] = [];
  let current: HTMLElement | null = textNode?.parentElement ?? symbol;
  while (current && current !== container) {
    lineage.push(current);
    current = current.parentElement;
  }
  return lineage;
}

function authoredTypographyValue(
  lineage: HTMLElement[],
  property: StickerTypographyProperty
): string | undefined {
  for (const element of lineage) {
    const value = element.style.getPropertyValue(property).trim();
    if (value && !(property === "font-size" && element.matches(ENCLOSED_STICKER_SELECTOR) && value === "1em")) {
      return value;
    }
    if (property === "color") {
      const legacyColor = element.getAttribute("color")?.trim();
      if (legacyColor) return legacyColor;
    }
    if (property === "font-family") {
      const legacyFace = element.getAttribute("face")?.trim();
      if (legacyFace) return legacyFace;
    }
    if (property === "font-weight" && /^(strong|b)$/i.test(element.tagName)) return "700";
    if (property === "font-style" && /^(em|i)$/i.test(element.tagName)) return "italic";
  }
  return undefined;
}

function currentWholeFontSize(data: Record<string, unknown>): number {
  const generated = data.layoutVisualStyle as { fontSize?: unknown } | undefined;
  const value = generated && data.layoutAutoTypography !== false
    ? generated.fontSize
    : data.fontSize;
  return typeof value === "number" && Number.isFinite(value) ? value : 14;
}

/**
 * Materialize each enclosed sticker's current typography before a whole-object
 * format changes inherited node styles. Explicit range formatting still acts
 * directly in TipTap and can therefore intentionally change a selected sticker.
 */
export function protectEnclosedStickerTextStyles(
  data: Record<string, unknown>
): string | undefined {
  if (typeof document === "undefined" || typeof data.richText !== "string") return undefined;

  const container = document.createElement("div");
  container.innerHTML = data.richText;
  const symbols = container.querySelectorAll<HTMLElement>(ENCLOSED_STICKER_SELECTOR);
  if (!symbols.length) return data.richText;

  for (const symbol of symbols) {
    const lineage = textElementLineage(symbol, container);
    const enclosure = symbol.getAttribute("data-symbol-enclosure");
    const textColor = authoredTypographyValue(lineage, "color")
      ?? defaultEnclosedSymbolTextColor({
        enclosure: enclosure === "circle"
          || enclosure === "square"
          || enclosure === "rounded-square"
          ? enclosure
          : "none",
        fillColor: symbol.getAttribute("data-symbol-fill") ?? undefined,
      });
    const fontFamily = authoredTypographyValue(lineage, "font-family")
      ?? (typeof data.fontFamily === "string" && data.fontFamily
        ? data.fontFamily
        : DEFAULT_STICKER_FONT_FAMILY);
    const fontSize = authoredTypographyValue(lineage, "font-size")
      ?? `${currentWholeFontSize(data)}px`;
    const fontWeight = authoredTypographyValue(lineage, "font-weight")
      ?? "normal";
    const fontStyle = authoredTypographyValue(lineage, "font-style")
      ?? "normal";

    if (textColor) symbol.style.color = textColor;
    symbol.style.fontFamily = fontFamily;
    symbol.style.fontSize = fontSize;
    symbol.style.fontWeight = fontWeight;
    symbol.style.fontStyle = fontStyle;
  }

  return container.innerHTML;
}

function stripInlineTextColors(html: string): string {
  return html
    .replace(/\sstyle\s*=\s*(["'])([\s\S]*?)\1/gi, (_attribute, quote: string, style: string) => {
      const declarations = style
        .split(";")
        .map((declaration) => declaration.trim())
        .filter((declaration) => {
          const separator = declaration.indexOf(":");
          return separator < 0
            || declaration.slice(0, separator).trim().toLowerCase() !== "color";
        });
      return declarations.length
        ? ` style=${quote}${declarations.join("; ")}${quote}`
        : "";
    })
    .replace(/\scolor\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
}

/**
 * Return node data to chart-owned automatic text color. Whole-node colors and
 * inline rich-text colors are removed, while enclosed symbols retain the
 * explicit foreground needed to remain readable inside their enclosure.
 */
export function reclaimAutomaticTextColor(
  data: Record<string, unknown>
): Record<string, unknown> {
  const reclaimed = { ...data };
  delete reclaimed.layoutAutoText;
  delete reclaimed.textColor;
  delete reclaimed.radialTextColor;

  if (typeof data.richText !== "string") return reclaimed;
  if (typeof document === "undefined") {
    reclaimed.richText = stripInlineTextColors(data.richText);
    return reclaimed;
  }

  const container = document.createElement("div");
  container.innerHTML = protectEnclosedStickerTextStyles(data) ?? data.richText;
  container.querySelectorAll<HTMLElement>("[style]").forEach((element) => {
    if (isInsideEnclosedSticker(element)) return;
    element.style.removeProperty("color");
    if (!element.getAttribute("style")?.trim()) element.removeAttribute("style");
  });
  container.querySelectorAll<HTMLElement>("[color]").forEach((element) => {
    if (!isInsideEnclosedSticker(element)) element.removeAttribute("color");
  });
  container.normalize();
  reclaimed.richText = container.innerHTML;
  return reclaimed;
}

export function normalizeWholeTextHighlight(
  data: Record<string, unknown>,
  value: unknown
): Record<string, unknown> {
  const color = typeof value === "string" && value ? value : undefined;
  const patch: Record<string, unknown> = { textHighlightColor: color };
  if (typeof document === "undefined") return patch;

  const container = document.createElement("div");
  const protectedRichText = protectEnclosedStickerTextStyles(data);
  if (protectedRichText?.trim()) {
    container.innerHTML = protectedRichText;
  } else {
    const fallbackText = ["text", "title", "topic", "label", "devanagari", "iast", "translation", "rule"]
      .map((field) => data[field])
      .find((candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0) ?? "";
    const lines = fallbackText.split(/\r?\n/);
    for (const line of lines) {
      const paragraph = document.createElement("p");
      paragraph.textContent = line;
      container.appendChild(paragraph);
    }
  }

  const currentWholeHighlight = typeof data.textHighlightColor === "string"
    ? data.textHighlightColor.trim().toLowerCase()
    : "";
  container.querySelectorAll<HTMLElement>("mark").forEach((mark) => {
    const protectsSticker = isInsideEnclosedSticker(mark)
      || mark.querySelector(ENCLOSED_STICKER_SELECTOR) !== null;
    const rawBackground = mark.getAttribute("data-color")
      ?? mark.getAttribute("style")?.match(/background-color\s*:\s*([^;]+)/i)?.[1]
      ?? "";
    const legacyWholeStickerHighlight = protectsSticker
      && mark.dataset.vidyaExplicitHighlight !== "true"
      && !!currentWholeHighlight
      && rawBackground.trim().toLowerCase() === currentWholeHighlight;
    if (
      protectsSticker
      && mark.dataset.vidyaWholeHighlight !== "true"
      && !legacyWholeStickerHighlight
    ) return;
    mark.replaceWith(...Array.from(mark.childNodes));
  });
  container.normalize();

  if (color) {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    while (walker.nextNode()) {
      const textNode = walker.currentNode as Text;
      if (
        textNode.data.trim()
        && !textNode.parentElement?.closest(ENCLOSED_STICKER_SELECTOR)
      ) {
        textNodes.push(textNode);
      }
    }
    for (const textNode of textNodes) {
      const mark = document.createElement("mark");
      mark.dataset.vidyaWholeHighlight = "true";
      mark.style.backgroundColor = color;
      textNode.parentNode?.replaceChild(mark, textNode);
      mark.appendChild(textNode);
    }
  }

  patch.richText = container.innerHTML;
  return patch;
}
