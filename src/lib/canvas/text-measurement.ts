import type { ContentMeasurement } from "./shape-fitting";

export interface RichTextMeasureOptions {
  maxWidth?: number;
  /** Authored whole-node font size, independent of temporary visual fit scale. */
  fontSize?: number;
}

let measurementHost: HTMLDivElement | null = null;
let fontsReadyPromise: Promise<unknown> | null = null;

function getMeasurementHost(): HTMLDivElement {
  if (measurementHost?.isConnected) return measurementHost;
  measurementHost = document.createElement("div");
  measurementHost.dataset.vidyaMeasurementHost = "true";
  Object.assign(measurementHost.style, {
    position: "fixed",
    left: "-100000px",
    top: "0",
    visibility: "hidden",
    pointerEvents: "none",
    contain: "layout style",
    zIndex: "-1",
  });
  document.body.appendChild(measurementHost);
  return measurementHost;
}

function renderedLineCount(element: HTMLElement, lineHeight: number): number {
  const range = document.createRange();
  range.selectNodeContents(element);
  const tops = new Set<number>();
  for (const rect of Array.from(range.getClientRects())) {
    if (rect.width > 0 && rect.height > 0) tops.add(Math.round(rect.top * 2) / 2);
  }
  range.detach();
  if (tops.size) return tops.size;
  return Math.max(1, Math.ceil(element.scrollHeight / Math.max(1, lineHeight)));
}

/** Resolve once per page; callers can schedule one corrective measurement when fonts settle. */
export function textMeasurementFontsReady(): Promise<unknown> {
  if (fontsReadyPromise) return fontsReadyPromise;
  fontsReadyPromise = typeof document !== "undefined" && document.fonts?.ready
    ? document.fonts.ready.catch(() => undefined)
    : Promise.resolve();
  return fontsReadyPromise;
}

function measurementClone(
  element: HTMLElement,
  sourceStyle: CSSStyleDeclaration,
  maxWidth: number | null,
  fontSize: number | undefined,
  singleWord: boolean
): HTMLElement {
  const clone = element.cloneNode(true) as HTMLElement;
  clone.removeAttribute("contenteditable");
  clone.removeAttribute("tabindex");
  clone.style.boxSizing = "content-box";
  clone.style.width = "max-content";
  clone.style.minWidth = "0";
  clone.style.maxWidth = maxWidth == null ? "none" : `${maxWidth}px`;
  clone.style.height = "auto";
  clone.style.minHeight = "0";
  clone.style.overflow = "visible";
  clone.style.whiteSpace = singleWord ? "nowrap" : "pre-wrap";
  clone.style.overflowWrap = singleWord ? "normal" : "break-word";
  clone.style.wordBreak = singleWord ? "keep-all" : sourceStyle.wordBreak;
  clone.style.fontFamily = sourceStyle.fontFamily;
  clone.style.fontSize = fontSize ? `${fontSize}px` : sourceStyle.fontSize;
  clone.style.fontWeight = sourceStyle.fontWeight;
  clone.style.fontStyle = sourceStyle.fontStyle;
  clone.style.lineHeight = sourceStyle.lineHeight;
  clone.style.letterSpacing = sourceStyle.letterSpacing;
  clone.style.textAlign = sourceStyle.textAlign;
  return clone;
}

/** Measure cloned rendered rich text with the same classes and inline marks as TipTap. */
export function measureRichTextElement(
  element: HTMLElement,
  options: RichTextMeasureOptions = {}
): ContentMeasurement {
  const host = getMeasurementHost();
  const sourceStyle = window.getComputedStyle(element);
  const plainText = element.textContent?.trim() ?? "";
  const singleWord = !!plainText && !/\s/u.test(plainText);
  const maxWidth = Math.max(8, options.maxWidth ?? 480);
  const clone = measurementClone(element, sourceStyle, maxWidth, options.fontSize, singleWord);
  host.replaceChildren(clone);

  const computed = window.getComputedStyle(clone);
  const fontSize = Number.parseFloat(computed.fontSize) || 14;
  const lineHeight = Number.parseFloat(computed.lineHeight) || fontSize * 1.35;
  const rect = clone.getBoundingClientRect();
  const width = Math.ceil(Math.min(maxWidth, Math.max(rect.width, singleWord ? 0 : clone.scrollWidth)));
  const height = Math.ceil(Math.max(rect.height, clone.scrollHeight));
  const lineCount = renderedLineCount(clone, lineHeight);

  const naturalClone = measurementClone(element, sourceStyle, null, options.fontSize, true);
  naturalClone.style.whiteSpace = "pre";
  host.replaceChildren(naturalClone);
  const naturalRect = naturalClone.getBoundingClientRect();
  const naturalWidth = Math.ceil(Math.max(naturalRect.width, naturalClone.scrollWidth));
  host.replaceChildren();
  return { width, height, lineCount, lineHeight, naturalWidth };
}

export interface PlainTextMeasureOptions extends RichTextMeasureOptions {
  text: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string | number;
  fontStyle?: string;
  lineHeight?: number;
  letterSpacing?: number;
}

export function measurePlainText(options: PlainTextMeasureOptions): ContentMeasurement {
  const host = getMeasurementHost();
  const element = document.createElement("div");
  element.textContent = options.text;
  Object.assign(element.style, {
    width: "max-content",
    minWidth: "0",
    maxWidth: `${Math.max(8, options.maxWidth ?? 480)}px`,
    whiteSpace: "pre-wrap",
    overflowWrap: "normal",
    wordBreak: "keep-all",
    hyphens: "none",
    fontFamily: options.fontFamily ?? "inherit",
    fontSize: `${options.fontSize ?? 14}px`,
    fontWeight: String(options.fontWeight ?? "normal"),
    fontStyle: options.fontStyle ?? "normal",
    lineHeight: String(options.lineHeight ?? 1.35),
    letterSpacing: `${options.letterSpacing ?? 0}px`,
  });
  host.replaceChildren(element);
  const measured = measureRichTextElement(element, options);
  host.replaceChildren();
  return measured;
}
