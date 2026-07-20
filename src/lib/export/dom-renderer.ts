import { ExportError } from "./errors";
import type { ExportBounds, ExportDiagnostics, ExportRenderer } from "./types";
import {
  embedDomExportAssets,
  waitForExportFonts,
  type ExportAssetOptions,
  type ExportAssetReport,
  type ExportAssetWarning,
} from "./resources";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const XHTML_NAMESPACE = "http://www.w3.org/1999/xhtml";

const EDITOR_UI_SELECTORS = [
  "[data-export-ignore]",
  "[data-export-ui]",
  ".react-flow__resize-control",
  ".react-flow__handle",
  ".react-flow__edge-interaction",
  ".react-flow__edgeupdater",
  ".react-flow__connection",
  ".react-flow__node-toolbar",
  ".react-flow__edge-toolbar",
  ".react-flow__controls",
  ".react-flow__minimap",
  ".react-flow__panel",
  ".react-flow__selection",
  ".react-flow__nodesselection",
  ".react-flow__nodesselection-rect",
  ".react-flow__attribution",
  ".react-flow__accessibility",
  ".selection-toolbar",
  ".sunburst-inline-editor",
  'button[title="Duplicate"]',
  'button[title="Add connected node"]',
  'button[title="Delete connection"]',
  'button[aria-label="Delete connection"]',
].join(",");

/**
 * A deliberately finite set. It captures React Flow geometry, Tailwind layout,
 * typography, SVG paint, clipping, and node decoration without copying every
 * browser-only interaction property into the standalone document.
 */
export const DOM_EXPORT_COMPUTED_STYLE_PROPERTIES = [
  "display", "position", "inset", "top", "right", "bottom", "left", "float",
  // Dense diamond labels depend on floated exclusion polygons. Without these
  // properties the two 50%-wide guides consume the whole exported text box.
  "shape-outside", "shape-margin", "shape-image-threshold",
  "width", "height", "min-width", "min-height", "max-width", "max-height",
  "box-sizing", "aspect-ratio",
  "margin-top", "margin-right", "margin-bottom", "margin-left",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "flex", "flex-direction", "flex-wrap", "flex-flow", "flex-grow", "flex-shrink", "flex-basis",
  "align-items", "align-content", "align-self", "justify-content", "justify-items", "justify-self",
  "place-items", "place-content", "place-self", "order", "gap", "row-gap", "column-gap",
  "grid", "grid-template", "grid-template-columns", "grid-template-rows", "grid-auto-flow",
  "grid-auto-columns", "grid-auto-rows", "grid-column", "grid-row",
  "overflow", "overflow-x", "overflow-y", "text-overflow", "z-index",
  "transform", "transform-origin", "transform-box", "translate", "rotate", "scale",
  "opacity", "visibility",
  "background-color", "background-image", "background-position", "background-position-x",
  "background-position-y", "background-size", "background-repeat", "background-clip",
  "background-origin", "background-blend-mode",
  "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
  "border-top-style", "border-right-style", "border-bottom-style", "border-left-style",
  "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
  "border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius",
  "border-bottom-left-radius", "border-collapse", "border-spacing", "border-image-source",
  "outline", "outline-width", "outline-style", "outline-color", "outline-offset",
  "box-shadow", "filter", "backdrop-filter", "-webkit-backdrop-filter", "mix-blend-mode",
  "clip", "clip-path", "mask", "mask-image", "mask-position", "mask-size", "mask-repeat",
  "-webkit-mask", "-webkit-mask-image", "-webkit-mask-position", "-webkit-mask-size",
  "color", "caret-color", "font", "font-family", "font-size", "font-style", "font-weight",
  "font-stretch", "font-variant", "font-feature-settings", "font-kerning",
  "font-variation-settings", "line-height", "letter-spacing", "word-spacing",
  "text-align", "text-align-last", "text-decoration", "text-decoration-color",
  "text-decoration-line", "text-decoration-style", "text-transform", "text-indent",
  "text-shadow", "white-space", "word-break", "overflow-wrap", "hyphens",
  "text-wrap", "text-wrap-mode", "text-wrap-style",
  "writing-mode", "direction", "unicode-bidi", "vertical-align", "tab-size",
  "list-style", "list-style-type", "list-style-position", "list-style-image",
  "object-fit", "object-position",
  "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-opacity",
  "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-dasharray",
  "stroke-dashoffset", "paint-order", "shape-rendering", "text-rendering", "vector-effect",
  "stop-color", "stop-opacity", "flood-color", "flood-opacity", "color-interpolation",
] as const;

export interface DomCloneSelection {
  /** Undefined means all rendered nodes. An empty collection means no nodes. */
  nodeIds?: Iterable<string>;
  /** Undefined means all rendered edges. An empty collection means no edges. */
  edgeIds?: Iterable<string>;
}

export interface CloneReactFlowViewportOptions extends DomCloneSelection {
  signal?: AbortSignal;
  /** The visible board color used to preserve translucent node paint when the output itself is transparent. */
  appearanceBackground?: string | null;
  /** The actual exported background. Null means the area outside objects remains transparent. */
  background?: string | null;
}

export interface SanitizedViewportClone {
  sourceViewport: HTMLElement;
  clone: HTMLElement;
  includedNodeIds: string[];
  includedEdgeIds: string[];
  sourceElementCount: number;
  removedEditorElementCount: number;
  convertedCanvasCount: number;
}

export interface PrepareDomExportSvgOptions extends CloneReactFlowViewportOptions, ExportAssetOptions {
  /** The React Flow root or its .react-flow__viewport element. */
  viewport: HTMLElement;
  bounds: ExportBounds;
  padding?: number;
  /** Omit or pass null for a transparent export. */
  background?: string | null;
  title?: string;
  onStageComplete?: (
    stage: "clone-content" | "prepare-assets",
    diagnostics: Partial<Omit<ExportDiagnostics, "stage">>
  ) => void;
}

export interface PreparedDomExportSvg {
  source: string;
  width: number;
  height: number;
  bounds: ExportBounds;
  padding: number;
  renderer: Extract<ExportRenderer, "dom-foreign-object">;
  includedNodeIds: string[];
  includedEdgeIds: string[];
  sourceElementCount: number;
  removedEditorElementCount: number;
  convertedCanvasCount: number;
  assets: ExportAssetReport;
}

function abortIfRequested(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw new DOMException("The export was canceled.", "AbortError");
}

type WaitForExportFonts = (
  options?: Pick<ExportAssetOptions, "fontTimeoutMs" | "signal">
) => Promise<void>;

/**
 * Waiting for the live document's fonts improves fidelity, but it must not be
 * a hard gate for a non-strict export. The asset pass that follows can still
 * embed each used font or replace an unavailable family with the deterministic
 * export fallback. Cancellation and strict exports retain fail-fast behavior.
 *
 * The injectable waiter keeps this policy independently regression-testable
 * without requiring a browser FontFaceSet in the test runtime.
 */
export async function waitForDomExportFontReadiness(
  options: Pick<
    ExportAssetOptions,
    "fontTimeoutMs" | "signal" | "strictFontEmbedding"
  > = {},
  waitForFonts: WaitForExportFonts = waitForExportFonts
): Promise<ExportAssetWarning[]> {
  try {
    await waitForFonts(options);
    return [];
  } catch (cause) {
    if (options.signal?.aborted) {
      if (
        (cause instanceof ExportError && cause.code === "ABORTED")
        || (cause instanceof DOMException && cause.name === "AbortError")
      ) {
        throw cause;
      }
      throw new DOMException("The export was canceled.", "AbortError");
    }
    const aborted = (cause instanceof ExportError && cause.code === "ABORTED")
      || (cause instanceof DOMException && cause.name === "AbortError");
    if (aborted || options.strictFontEmbedding) throw cause;

    const recoverableFontFailure = cause instanceof ExportError
      && (cause.code === "FONT_LOAD_TIMEOUT" || cause.code === "FONT_LOAD_FAILED");
    if (!recoverableFontFailure) throw cause;

    return [{
      kind: "font-resource",
      message: `${cause.message} Export continued with embedded fonts or a browser-safe fallback.`,
    }];
  }
}

function finiteDimension(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

type ExportRgba = { r: number; g: number; b: number; a: number };

function colorChannel(value: string, normalized = false): number | null {
  const input = value.trim();
  if (!input) return null;
  const parsed = Number.parseFloat(input);
  if (!Number.isFinite(parsed)) return null;
  if (input.endsWith("%")) return Math.max(0, Math.min(255, parsed * 2.55));
  return Math.max(0, Math.min(255, normalized ? parsed * 255 : parsed));
}

function alphaChannel(value: string | undefined): number {
  if (!value) return 1;
  const input = value.trim();
  const parsed = Number.parseFloat(input);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(0, Math.min(1, input.endsWith("%") ? parsed / 100 : parsed));
}

/** Parse the normalized color syntaxes returned by browser computed styles. */
export function parseExportCssColor(value: string): ExportRgba | null {
  const input = value.trim().toLowerCase();
  if (!input || input === "none") return null;
  if (input === "transparent") return { r: 0, g: 0, b: 0, a: 0 };

  const hex = input.match(/^#([0-9a-f]{3,8})$/i)?.[1];
  if (hex) {
    const expanded = hex.length === 3 || hex.length === 4
      ? hex.split("").map((part) => part + part).join("")
      : hex;
    if (expanded.length === 6 || expanded.length === 8) {
      return {
        r: Number.parseInt(expanded.slice(0, 2), 16),
        g: Number.parseInt(expanded.slice(2, 4), 16),
        b: Number.parseInt(expanded.slice(4, 6), 16),
        a: expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1,
      };
    }
  }

  const rgb = input.match(/^rgba?\((.*)\)$/i)?.[1];
  if (rgb) {
    const [channelsPart, slashAlpha] = rgb.split("/").map((part) => part.trim());
    const channels = channelsPart.split(/[\s,]+/).filter(Boolean);
    const r = colorChannel(channels[0] ?? "");
    const g = colorChannel(channels[1] ?? "");
    const b = colorChannel(channels[2] ?? "");
    if (r == null || g == null || b == null) return null;
    return { r, g, b, a: alphaChannel(slashAlpha ?? channels[3]) };
  }

  const srgb = input.match(/^color\(srgb\s+(.*)\)$/i)?.[1];
  if (srgb) {
    const [channelsPart, slashAlpha] = srgb.split("/").map((part) => part.trim());
    const channels = channelsPart.split(/\s+/).filter(Boolean);
    const r = colorChannel(channels[0] ?? "", true);
    const g = colorChannel(channels[1] ?? "", true);
    const b = colorChannel(channels[2] ?? "", true);
    if (r == null || g == null || b == null) return null;
    return { r, g, b, a: alphaChannel(slashAlpha) };
  }

  return null;
}

export function isTransparentExportBackground(value: string | null | undefined): boolean {
  if (!value || value.trim().toLowerCase() === "none") return true;
  const parsed = parseExportCssColor(value);
  return parsed?.a === 0;
}

/** Return the opaque color that looks like `foreground` painted over `matte`. */
export function compositeExportColor(
  foreground: string,
  matte: string,
  opacity = 1
): string | null {
  const source = parseExportCssColor(foreground);
  const backdrop = parseExportCssColor(matte);
  if (!source || !backdrop) return null;
  const alpha = Math.max(0, Math.min(1, source.a * opacity));
  if (alpha <= 0) return null;
  const backdropAlpha = Math.max(0, Math.min(1, backdrop.a));
  const matteR = backdrop.r * backdropAlpha + 255 * (1 - backdropAlpha);
  const matteG = backdrop.g * backdropAlpha + 255 * (1 - backdropAlpha);
  const matteB = backdrop.b * backdropAlpha + 255 * (1 - backdropAlpha);
  const mix = (front: number, back: number) => Math.round(front * alpha + back * (1 - alpha));
  return `rgb(${mix(source.r, matteR)}, ${mix(source.g, matteG)}, ${mix(source.b, matteB)})`;
}

function flattenTransparentNodePaint(clone: HTMLElement, matte: string): void {
  if (!parseExportCssColor(matte)) return;
  const nodeElements = Array.from(clone.querySelectorAll<HTMLElement>(".react-flow__node"));
  for (const node of nodeElements) {
    const elements: Element[] = [node, ...Array.from(node.querySelectorAll("*"))];
    for (const element of elements) {
      if (!(element instanceof HTMLElement || element instanceof SVGElement)) continue;

      if (element instanceof HTMLElement) {
        const background = element.style.getPropertyValue("background-color");
        const parsedBackground = parseExportCssColor(background);
        if (parsedBackground && parsedBackground.a > 0 && parsedBackground.a < 1) {
          const flattened = compositeExportColor(background, matte);
          if (flattened) element.style.setProperty("background-color", flattened, "important");
        }
        for (const side of ["top", "right", "bottom", "left"] as const) {
          const property = `border-${side}-color`;
          const border = element.style.getPropertyValue(property);
          const parsedBorder = parseExportCssColor(border);
          if (!parsedBorder || parsedBorder.a <= 0 || parsedBorder.a >= 1) continue;
          const flattened = compositeExportColor(border, matte);
          if (flattened) element.style.setProperty(property, flattened, "important");
        }
      }

      if (element instanceof SVGElement) {
        for (const property of ["fill", "stroke"] as const) {
          const color = element.style.getPropertyValue(property) || element.getAttribute(property) || "";
          const parsed = parseExportCssColor(color);
          if (!parsed || parsed.a <= 0) continue;
          const opacityProperty = `${property}-opacity`;
          const opacityValue = element.style.getPropertyValue(opacityProperty)
            || element.getAttribute(opacityProperty)
            || "1";
          const paintOpacity = alphaChannel(opacityValue);
          const effectiveAlpha = parsed.a * paintOpacity;
          if (effectiveAlpha >= 1) continue;
          const flattened = compositeExportColor(color, matte, paintOpacity);
          if (!flattened) continue;
          element.style.setProperty(property, flattened, "important");
          element.style.setProperty(opacityProperty, "1", "important");
          element.setAttribute(property, flattened);
          element.setAttribute(opacityProperty, "1");
        }
      }
    }
  }
}

function validateBounds(bounds: ExportBounds): void {
  if (
    !Number.isFinite(bounds.x)
    || !Number.isFinite(bounds.y)
    || !finiteDimension(bounds.width)
    || !finiteDimension(bounds.height)
  ) {
    throw new ExportError({
      stage: "resolve-bounds",
      code: "INVALID_BOUNDS",
      message: `Invalid DOM export bounds: ${JSON.stringify(bounds)}`,
      diagnostics: { bounds, renderer: "dom-foreign-object" },
    });
  }
}

/** Locate the live viewport while still accepting the viewport itself. */
export function locateReactFlowViewport(container: HTMLElement): HTMLElement {
  if (container.matches(".react-flow__viewport")) return container;
  const viewport = container.querySelector<HTMLElement>(".react-flow__viewport");
  if (viewport) return viewport;
  throw new ExportError({
    stage: "clone-content",
    code: "UNSUPPORTED_ELEMENT",
    message: "The React Flow viewport could not be located for export.",
    diagnostics: { renderer: "dom-foreign-object", offendingElement: container.tagName.toLowerCase() },
  });
}

function inlineComputedStyle(source: Element, target: Element): void {
  if (
    !(source instanceof HTMLElement || source instanceof SVGElement)
    || !(target instanceof HTMLElement || target instanceof SVGElement)
  ) return;

  const computed = window.getComputedStyle(source);
  for (const property of DOM_EXPORT_COMPUTED_STYLE_PROPERTIES) {
    const value = computed.getPropertyValue(property);
    if (value) target.style.setProperty(property, value);
  }
  // Custom properties are needed by nested SVG/HTML content and exported
  // next/font declarations. Browsers enumerate inherited custom properties in
  // computed style, while the second loop covers authored inline variables.
  for (let index = 0; index < computed.length; index += 1) {
    const property = computed.item(index);
    if (!property.startsWith("--")) continue;
    const value = computed.getPropertyValue(property);
    if (value) target.style.setProperty(property, value);
  }
  for (let index = 0; index < source.style.length; index += 1) {
    const property = source.style.item(index);
    if (!property.startsWith("--")) continue;
    const value = source.style.getPropertyValue(property);
    if (value) target.style.setProperty(property, value, source.style.getPropertyPriority(property));
  }

  target.style.setProperty("animation", "none", "important");
  target.style.setProperty("transition", "none", "important");
  target.style.setProperty("caret-color", "transparent", "important");
}

function copyLiveElementState(source: Element, target: Element): void {
  if (source instanceof HTMLInputElement && target instanceof HTMLInputElement) {
    target.value = source.value;
    target.setAttribute("value", source.value);
    target.checked = source.checked;
    target.toggleAttribute("checked", source.checked);
    return;
  }
  if (source instanceof HTMLTextAreaElement && target instanceof HTMLTextAreaElement) {
    target.value = source.value;
    target.textContent = source.value;
    return;
  }
  if (source instanceof HTMLSelectElement && target instanceof HTMLSelectElement) {
    target.value = source.value;
    Array.from(target.options).forEach((option, index) => {
      const selected = source.options[index]?.selected ?? false;
      option.selected = selected;
      option.toggleAttribute("selected", selected);
    });
    return;
  }
  if (source instanceof HTMLDetailsElement && target instanceof HTMLDetailsElement) {
    target.open = source.open;
    target.toggleAttribute("open", source.open);
    return;
  }
  if (source instanceof HTMLImageElement && target instanceof HTMLImageElement) {
    const sourceUrl = source.currentSrc || source.src;
    if (sourceUrl) target.setAttribute("src", sourceUrl);
    target.removeAttribute("srcset");
    target.removeAttribute("sizes");
  }
}

function convertCanvas(
  source: HTMLCanvasElement,
  target: HTMLCanvasElement
): HTMLImageElement {
  let dataUrl: string;
  try {
    dataUrl = source.toDataURL("image/png");
  } catch (cause) {
    throw new ExportError({
      stage: "clone-content",
      code: cause instanceof DOMException && cause.name === "SecurityError"
        ? "CANVAS_TAINTED"
        : "UNSUPPORTED_ELEMENT",
      cause,
      message: "A canvas element in the board could not be copied for export.",
      diagnostics: { offendingElement: "canvas", renderer: "dom-foreign-object" },
    });
  }
  if (!dataUrl || dataUrl === "data:,") {
    throw new ExportError({
      stage: "clone-content",
      code: "UNSUPPORTED_ELEMENT",
      message: "A canvas element in the board did not produce an exportable image.",
      diagnostics: { offendingElement: "canvas", renderer: "dom-foreign-object" },
    });
  }

  const image = document.createElement("img");
  for (const attribute of Array.from(target.attributes)) {
    if (attribute.name === "width" || attribute.name === "height") continue;
    image.setAttribute(attribute.name, attribute.value);
  }
  image.src = dataUrl;
  image.alt = target.getAttribute("aria-label") ?? "";
  image.width = source.width;
  image.height = source.height;
  target.replaceWith(image);
  return image;
}

function pairedElements(source: HTMLElement, clone: HTMLElement): Array<[Element, Element]> {
  const sourceElements = [source, ...Array.from(source.querySelectorAll("*"))];
  const cloneElements = [clone, ...Array.from(clone.querySelectorAll("*"))];
  if (sourceElements.length !== cloneElements.length) {
    throw new ExportError({
      stage: "clone-content",
      code: "SERIALIZE_FAILED",
      message: "The live board changed while its export clone was being prepared.",
      diagnostics: { renderer: "dom-foreign-object" },
    });
  }
  return sourceElements.map((element, index) => [element, cloneElements[index]]);
}

function filterByIds(
  clone: HTMLElement,
  selector: string,
  requested: Iterable<string> | undefined
): string[] {
  const elements = Array.from(clone.querySelectorAll<HTMLElement>(selector));
  const requestedIds = requested === undefined ? null : new Set(requested);
  for (const element of elements) {
    const id = element.getAttribute("data-id");
    if (requestedIds && (!id || !requestedIds.has(id))) element.remove();
  }
  return Array.from(clone.querySelectorAll<HTMLElement>(selector))
    .map((element) => element.getAttribute("data-id"))
    .filter((id): id is string => Boolean(id));
}

function filterIdentifiedEdgeLabels(clone: HTMLElement, edgeIds: Iterable<string> | undefined): void {
  if (edgeIds === undefined) return;
  const requested = new Set(edgeIds);
  for (const element of Array.from(clone.querySelectorAll<HTMLElement>(
    ".react-flow__edgelabel-renderer [data-export-edge-id], .react-flow__edgelabel-renderer [data-edge-id], .react-flow__edgelabel-renderer [data-id]"
  ))) {
    const id = element.getAttribute("data-export-edge-id")
      ?? element.getAttribute("data-edge-id")
      ?? element.getAttribute("data-id");
    if (id && !requested.has(id)) element.remove();
  }
}

function restoreExportElements(clone: HTMLElement): void {
  const elements = Array.from(clone.querySelectorAll<HTMLElement | SVGElement>("[data-export-restore]"));
  for (const element of elements) {
    element.removeAttribute("hidden");
    element.removeAttribute("aria-hidden");
    element.removeAttribute("display");
    element.removeAttribute("visibility");
    element.removeAttribute("opacity");
    element.style.removeProperty("display");
    element.style.removeProperty("visibility");
    element.style.removeProperty("opacity");
    // Visibility is inherited. It was copied as a computed inline value onto
    // descendants, so restore those inherited values as well.
    for (const descendant of Array.from(element.querySelectorAll<HTMLElement | SVGElement>("*"))) {
      descendant.style.removeProperty("visibility");
    }
    element.removeAttribute("data-export-restore");
  }
}

const EDITOR_RING_STYLE_PROPERTIES = [
  "--tw-ring-color",
  "--tw-ring-inset",
  "--tw-ring-offset-color",
  "--tw-ring-offset-shadow",
  "--tw-ring-offset-width",
  "--tw-ring-shadow",
] as const;

function hasEditorRingClass(element: Element): boolean {
  return Array.from(element.classList).some((className) => (
    className === "ring"
    || /^ring-(?:[1-9]\d*|primary|offset(?:-|$))/.test(className)
  ));
}

function isEmptySelectionOverlay(element: Element): boolean {
  if (element.textContent?.trim() || element.childElementCount > 0) return false;
  if (!(element instanceof HTMLElement || element instanceof SVGElement)) return false;
  return element.style.position === "absolute" || element.classList.contains("absolute");
}

/**
 * Shape nodes draw their selected outline as a duplicate dashed SVG geometry.
 * It is not tagged as editor UI, so identify the editor's exact blue/dash
 * convention without touching ordinary fills, strokes, or node content.
 */
function isEditorSvgSelectionStroke(element: Element): boolean {
  if (!(element instanceof SVGElement)) return false;
  if (!new Set(["circle", "ellipse", "line", "path", "polygon", "polyline", "rect"])
    .has(element.tagName.toLowerCase())) return false;

  const fill = (element.getAttribute("fill") ?? element.style.fill).trim().toLowerCase();
  const stroke = (element.getAttribute("stroke") ?? element.style.stroke)
    .replace(/\s+/g, "")
    .toLowerCase();
  const dash = (element.getAttribute("stroke-dasharray") ?? element.style.strokeDasharray)
    .trim()
    .replace(/[\s,]+/g, " ");
  const editorBlue = stroke === "#4262ff"
    || stroke === "rgb(66,98,255)"
    || stroke === "rgba(66,98,255,1)";
  return fill === "none" && editorBlue && dash === "4 3";
}

function looksLikeSelectionOutline(boxShadow: string): boolean {
  return /(?:^|\s)0px\s+0px\s+0px\s+1px(?:\s|$)/.test(boxShadow);
}

function withoutEditorRingLayers(boxShadow: string): string {
  const layers: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < boxShadow.length; index += 1) {
    const character = boxShadow[index];
    if (character === "(") depth += 1;
    else if (character === ")") depth = Math.max(0, depth - 1);
    else if (character === "," && depth === 0) {
      layers.push(boxShadow.slice(start, index).trim());
      start = index + 1;
    }
  }
  layers.push(boxShadow.slice(start).trim());
  return layers
    .filter((layer) => !/(?:^|\s)0px\s+0px\s+0px\s+(?:[1-9]\d*)px(?:\s|$)/.test(layer))
    .filter(Boolean)
    .join(", ");
}

/**
 * Remove visual selection state from the detached export clone. React Flow's
 * `selected` class is removed later, but Tailwind rings and component-authored
 * selection outlines have already been resolved into inline computed styles by
 * then. This pass removes those resolved styles while leaving the live board
 * and the selected node's actual content untouched.
 */
function removeEditorSelectionChrome(clone: HTMLElement): number {
  const selectedRoots = Array.from(clone.querySelectorAll<HTMLElement | SVGElement>(
    ".react-flow__node.selected, .react-flow__edge.selected, "
    + '.react-flow__node[aria-selected="true"], .react-flow__edge[aria-selected="true"]'
  ));
  let removedElementCount = 0;

  for (const root of selectedRoots) {
    root.removeAttribute("aria-selected");
    root.style.removeProperty("outline");
    root.style.removeProperty("outline-offset");
    root.style.removeProperty("box-shadow");

    const elements = [root, ...Array.from(root.querySelectorAll<HTMLElement | SVGElement>("*"))];
    for (const element of elements) {
      if (element !== root && !root.contains(element)) continue;

      if (isEditorSvgSelectionStroke(element)) {
        element.remove();
        removedElementCount += 1;
        continue;
      }

      const hasRing = hasEditorRingClass(element);
      if (hasRing && isEmptySelectionOverlay(element)) {
        element.remove();
        removedElementCount += 1;
        continue;
      }

      if (hasRing || looksLikeSelectionOutline(element.style.boxShadow)) {
        const contentShadow = withoutEditorRingLayers(element.style.boxShadow);
        if (contentShadow) element.style.setProperty("box-shadow", contentShadow);
        else element.style.removeProperty("box-shadow");
      }
      if (hasRing) {
        for (const property of EDITOR_RING_STYLE_PROPERTIES) {
          element.style.removeProperty(property);
        }
        if (element.classList.contains("border-primary")) {
          element.style.setProperty("border-color", "var(--border)");
        }
      }

      const normalStroke = element.getAttribute("data-export-normal-stroke");
      if (normalStroke) {
        element.style.setProperty("stroke", normalStroke);
        element.setAttribute("stroke", normalStroke);
        element.removeAttribute("data-export-normal-stroke");
      }
    }
  }

  return removedElementCount;
}

function sanitizeAttributes(clone: HTMLElement): void {
  for (const element of [clone, ...Array.from(clone.querySelectorAll("*"))]) {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith("on") || name === "nonce") element.removeAttribute(attribute.name);
      if ((name === "href" || name === "src") && /^\s*javascript:/i.test(attribute.value)) {
        element.removeAttribute(attribute.name);
      }
    }
    element.removeAttribute("contenteditable");
    element.removeAttribute("autofocus");
    element.removeAttribute("spellcheck");
    element.removeAttribute("tabindex");
    element.removeAttribute("data-export-normal-stroke");
    element.classList.remove("selected", "dragging", "connecting", "updating");
    if (element instanceof HTMLElement || element instanceof SVGElement) {
      element.style.removeProperty("outline");
      element.style.removeProperty("outline-offset");
      element.style.setProperty("pointer-events", "none", "important");
    }
  }
}

/** Clone and sanitize the visual viewport without mutating board state. */
export function cloneReactFlowViewport(
  container: HTMLElement,
  options: CloneReactFlowViewportOptions = {}
): SanitizedViewportClone {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new ExportError({
      stage: "clone-content",
      code: "UNSUPPORTED_ELEMENT",
      message: "Board DOM export is only available in the browser.",
      diagnostics: { renderer: "dom-foreign-object" },
    });
  }
  abortIfRequested(options.signal);
  const sourceViewport = locateReactFlowViewport(container);
  if (!sourceViewport.isConnected) {
    throw new ExportError({
      stage: "clone-content",
      code: "UNSUPPORTED_ELEMENT",
      message: "The React Flow viewport must be attached while computed styles are captured.",
      diagnostics: { renderer: "dom-foreign-object", offendingElement: ".react-flow__viewport" },
    });
  }

  try {
    const clone = sourceViewport.cloneNode(true) as HTMLElement;
    const pairs = pairedElements(sourceViewport, clone);
    const includedNodeIds = filterByIds(
      clone,
      ".react-flow__node[data-id]",
      options.nodeIds
    );
    const includedEdgeIds = filterByIds(
      clone,
      ".react-flow__edge[data-id]",
      options.edgeIds
    );
    filterIdentifiedEdgeLabels(clone, options.edgeIds);

    const editorElements = Array.from(clone.querySelectorAll(EDITOR_UI_SELECTORS));
    for (const element of editorElements) element.remove();
    for (const element of Array.from(clone.querySelectorAll("script, noscript, iframe, object, embed"))) {
      element.remove();
    }

    // Filter the detached clone before any expensive or failure-prone work.
    // The source/clone pairs preserve the original mapping, while this set
    // ensures styles, live state, canvas conversion, and later asset embedding
    // are performed only for content that will actually be exported.
    const retainedTargets = new Set<Element>([
      clone,
      ...Array.from(clone.querySelectorAll("*")),
    ]);
    let convertedCanvasCount = 0;
    for (const [source, target] of pairs) {
      if (!retainedTargets.has(target)) continue;
      abortIfRequested(options.signal);
      inlineComputedStyle(source, target);
      copyLiveElementState(source, target);
      if (source instanceof HTMLCanvasElement && target instanceof HTMLCanvasElement) {
        convertCanvas(source, target);
        convertedCanvasCount += 1;
      }
    }

    restoreExportElements(clone);
    for (const fill of Array.from(clone.querySelectorAll<HTMLElement>("[data-export-fill-node]"))) {
      fill.style.setProperty("width", "100%", "important");
      fill.style.setProperty("height", "100%", "important");
      fill.style.setProperty("flex", "1 1 100%", "important");
      for (const svg of Array.from(fill.querySelectorAll<SVGSVGElement>("svg"))) {
        svg.style.setProperty("width", "100%", "important");
        svg.style.setProperty("height", "100%", "important");
        svg.setAttribute("width", "100%");
        svg.setAttribute("height", "100%");
      }
      fill.removeAttribute("data-export-fill-node");
    }
    const removedSelectionElementCount = removeEditorSelectionChrome(clone);
    if (isTransparentExportBackground(options.background) && options.appearanceBackground) {
      // A transparent PNG may be viewed on black or another arbitrary color.
      // Preserve how translucent cards looked on the board without filling the
      // transparent area outside those cards.
      flattenTransparentNodePaint(clone, options.appearanceBackground);
    }
    sanitizeAttributes(clone);

    if (!includedNodeIds.length && !includedEdgeIds.length) {
      throw new ExportError({
        stage: "resolve-scope",
        code: "EMPTY_SCOPE",
        message: "The requested board export does not contain any rendered nodes or edges.",
        diagnostics: { renderer: "dom-foreign-object" },
      });
    }

    return {
      sourceViewport,
      clone,
      includedNodeIds,
      includedEdgeIds,
      sourceElementCount: pairs.length,
      removedEditorElementCount: editorElements.length + removedSelectionElementCount,
      convertedCanvasCount,
    };
  } catch (cause) {
    if (cause instanceof ExportError) throw cause;
    throw new ExportError({
      stage: "clone-content",
      cause,
      diagnostics: { renderer: "dom-foreign-object" },
    });
  }
}

function svgElement<K extends keyof SVGElementTagNameMap>(name: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NAMESPACE, name);
}

function appendExportStyle(root: HTMLElement, fontFaceCss: string): void {
  const style = document.createElement("style");
  style.setAttribute("type", "text/css");
  style.textContent = `
${fontFaceCss}
*, *::before, *::after {
  animation: none !important;
  transition: none !important;
  caret-color: transparent !important;
}
.react-flow__viewport { transform-origin: 0 0 !important; }
`.trim();
  root.insertBefore(style, root.firstChild);
}

function createStandaloneSvg(
  clone: HTMLElement,
  bounds: ExportBounds,
  padding: number,
  background: string | null | undefined,
  title: string | undefined,
  fontFaceCss: string
): { svg: SVGSVGElement; width: number; height: number } {
  const width = Math.max(1, Math.ceil(bounds.width + padding * 2));
  const height = Math.max(1, Math.ceil(bounds.height + padding * 2));
  const svg = svgElement("svg");
  svg.setAttribute("xmlns", SVG_NAMESPACE);
  svg.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("role", "img");
  if (title) {
    const titleElement = svgElement("title");
    titleElement.textContent = title;
    svg.appendChild(titleElement);
    svg.setAttribute("aria-label", title);
  }

  if (background) {
    const backgroundRect = svgElement("rect");
    backgroundRect.setAttribute("x", "0");
    backgroundRect.setAttribute("y", "0");
    backgroundRect.setAttribute("width", String(width));
    backgroundRect.setAttribute("height", String(height));
    backgroundRect.setAttribute("fill", background);
    svg.appendChild(backgroundRect);
  }

  const foreignObject = svgElement("foreignObject");
  foreignObject.setAttribute("x", "0");
  foreignObject.setAttribute("y", "0");
  foreignObject.setAttribute("width", String(width));
  foreignObject.setAttribute("height", String(height));

  const wrapper = document.createElement("div");
  wrapper.setAttribute("xmlns", XHTML_NAMESPACE);
  wrapper.style.position = "relative";
  wrapper.style.width = `${width}px`;
  wrapper.style.height = `${height}px`;
  wrapper.style.overflow = "hidden";
  wrapper.style.boxSizing = "border-box";
  if (background) wrapper.style.background = background;
  appendExportStyle(wrapper, fontFaceCss);

  clone.style.setProperty("position", "absolute", "important");
  clone.style.setProperty("left", "0", "important");
  clone.style.setProperty("top", "0", "important");
  clone.style.setProperty("width", `${width}px`, "important");
  clone.style.setProperty("height", `${height}px`, "important");
  clone.style.setProperty("overflow", "visible", "important");
  clone.style.setProperty("transform-origin", "0 0", "important");
  clone.style.setProperty(
    "transform",
    `translate(${padding - bounds.x}px, ${padding - bounds.y}px) scale(1)`,
    "important"
  );
  wrapper.appendChild(clone);
  foreignObject.appendChild(wrapper);
  svg.appendChild(foreignObject);
  return { svg, width, height };
}

/**
 * Prepare a self-contained SVG whose foreignObject contains the selected
 * React Flow content at identity scale. PNG orchestration can decode this SVG
 * into its already safety-checked canvas; SVG orchestration can download it as
 * is.
 */
export async function prepareReactFlowDomSvg(
  options: PrepareDomExportSvgOptions
): Promise<PreparedDomExportSvg> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new ExportError({
      stage: "clone-content",
      code: "UNSUPPORTED_ELEMENT",
      message: "Board DOM export is only available in the browser.",
      diagnostics: { renderer: "dom-foreign-object" },
    });
  }

  validateBounds(options.bounds);
  const padding = Math.max(0, Number.isFinite(options.padding) ? options.padding ?? 0 : 0);
  abortIfRequested(options.signal);
  const fontReadinessWarnings = await waitForDomExportFontReadiness(options);

  const cloneStartedAt = performance.now();
  const preparedClone = cloneReactFlowViewport(options.viewport, options);
  options.onStageComplete?.("clone-content", {
    renderer: "dom-foreign-object",
    includedNodeCount: preparedClone.includedNodeIds.length,
    includedEdgeCount: preparedClone.includedEdgeIds.length,
    sourceElementCount: preparedClone.sourceElementCount,
    removedEditorElementCount: preparedClone.removedEditorElementCount,
    convertedCanvasCount: preparedClone.convertedCanvasCount,
    stageDurationsMs: { "clone-content": performance.now() - cloneStartedAt },
  });

  const assetsStartedAt = performance.now();
  const embeddedAssets = await embedDomExportAssets(preparedClone.clone, options);
  const assets: ExportAssetReport = fontReadinessWarnings.length === 0
    ? embeddedAssets
    : {
        ...embeddedAssets,
        warnings: [...fontReadinessWarnings, ...embeddedAssets.warnings],
      };
  options.onStageComplete?.("prepare-assets", {
    renderer: "dom-foreign-object",
    embeddedImageCount: assets.embeddedImageCount,
    embeddedStyleAssetCount: assets.embeddedStyleAssetCount,
    embeddedFontCount: assets.embeddedFontCount,
    assetWarningCount: assets.warnings.length,
    proxiedRemoteAssetCount: assets.proxiedRemoteAssetCount,
    preservedRemoteAssetCount: assets.preservedRemoteAssetCount,
    substitutedRemoteAssetCount: assets.substitutedRemoteAssetCount,
    assetWarnings: assets.warnings,
    stageDurationsMs: { "prepare-assets": performance.now() - assetsStartedAt },
  });
  abortIfRequested(options.signal);

  try {
    const { svg, width, height } = createStandaloneSvg(
      preparedClone.clone,
      options.bounds,
      padding,
      options.background,
      options.title,
      assets.fontFaceCss
    );
    const serialized = new XMLSerializer().serializeToString(svg);
    return {
      source: `<?xml version="1.0" encoding="UTF-8"?>\n${serialized}`,
      width,
      height,
      bounds: options.bounds,
      padding,
      renderer: "dom-foreign-object",
      includedNodeIds: preparedClone.includedNodeIds,
      includedEdgeIds: preparedClone.includedEdgeIds,
      sourceElementCount: preparedClone.sourceElementCount,
      removedEditorElementCount: preparedClone.removedEditorElementCount,
      convertedCanvasCount: preparedClone.convertedCanvasCount,
      assets,
    };
  } catch (cause) {
    if (cause instanceof ExportError) throw cause;
    throw new ExportError({
      stage: "serialize-content",
      code: "SERIALIZE_FAILED",
      cause,
      diagnostics: { bounds: options.bounds, renderer: "dom-foreign-object" },
    });
  }
}
