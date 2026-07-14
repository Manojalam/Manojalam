import type { VidyaBoard, VidyaNode } from "@/lib/types";
import { BOARD_CONTENT_VERSION } from "@/lib/config";
import { ExportError } from "./errors";
import { createPngExportPlan } from "./limits";
import { initiateBlobDownload } from "./pipeline";

export * from "./errors";
export * from "./limits";
export * from "./types";
export * from "./pipeline";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const XLINK_NAMESPACE = "http://www.w3.org/1999/xlink";
const SUNBURST_EXPORT_SELECTOR = 'svg[data-sunburst-export="true"]';
const RELATIONSHIP_DIAGRAM_EXPORT_ATTRIBUTE = "data-relationship-diagram-export";
const EXPORT_SCALE = 2;

type PreparedSvg = {
  source: string;
  width: number;
  height: number;
};

function safeFilename(
  title: string,
  extension: "svg" | "png",
  fallback = "radial-chart"
): string {
  const base = title
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.\s-]+|[.\s-]+$/g, "") || fallback;
  return `${base}.${extension}`;
}

function downloadBlob(blob: Blob, filename: string): void {
  initiateBlobDownload(blob, filename);
}

function isVisibleSvg(svg: SVGSVGElement): boolean {
  const style = window.getComputedStyle(svg);
  const bounds = svg.getBoundingClientRect();
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    Number.parseFloat(style.opacity || "1") > 0 &&
    bounds.width > 0 &&
    bounds.height > 0
  );
}

function findVisibleSunburstSvg(): SVGSVGElement {
  const candidates = Array.from(
    document.querySelectorAll<SVGSVGElement>(SUNBURST_EXPORT_SELECTOR)
  ).filter(isVisibleSvg);

  const svg = candidates.sort((a, b) => {
    const aBounds = a.getBoundingClientRect();
    const bBounds = b.getBoundingClientRect();
    return bBounds.width * bBounds.height - aBounds.width * aBounds.height;
  })[0];

  if (!svg) {
    throw new Error("No visible radial chart is available to export.");
  }
  return svg;
}

function findVisibleRelationshipDiagramSvg(nodeId: string): SVGSVGElement {
  const candidates = Array.from(
    document.querySelectorAll<SVGSVGElement>(`svg[${RELATIONSHIP_DIAGRAM_EXPORT_ATTRIBUTE}]`)
  ).filter((svg) =>
    svg.getAttribute(RELATIONSHIP_DIAGRAM_EXPORT_ATTRIBUTE) === nodeId && isVisibleSvg(svg)
  );

  const svg = candidates.sort((a, b) => {
    const aBounds = a.getBoundingClientRect();
    const bBounds = b.getBoundingClientRect();
    return bBounds.width * bBounds.height - aBounds.width * aBounds.height;
  })[0];

  if (!svg) {
    throw new Error("The selected relationship diagram is not visible and cannot be exported.");
  }
  return svg;
}

function isSameOriginStylesheet(sheet: CSSStyleSheet): boolean {
  if (!sheet.href) return true;
  try {
    return new URL(sheet.href, document.baseURI).origin === window.location.origin;
  } catch {
    return false;
  }
}

function absoluteCssUrls(cssText: string, baseUrl: string): string {
  return cssText.replace(
    /url\(\s*(?:(["'])(.*?)\1|([^)]*?))\s*\)/gi,
    (match, _quote: string | undefined, quotedUrl: string | undefined, rawUrl: string | undefined) => {
      const value = (quotedUrl ?? rawUrl ?? "").trim();
      if (!value || value.startsWith("data:") || value.startsWith("blob:") || value.startsWith("#")) {
        return match;
      }
      try {
        return `url("${new URL(value, baseUrl).href}")`;
      } catch {
        return match;
      }
    }
  );
}

function collectFontFacesFromRules(
  rules: CSSRuleList,
  fallbackBaseUrl: string,
  fontFaces: Set<string>
): void {
  for (const rule of Array.from(rules)) {
    if (rule.type === CSSRule.FONT_FACE_RULE) {
      const baseUrl = rule.parentStyleSheet?.href ?? fallbackBaseUrl;
      fontFaces.add(absoluteCssUrls(rule.cssText, baseUrl));
      continue;
    }

    if (rule.type === CSSRule.IMPORT_RULE) {
      const importedSheet = (rule as CSSImportRule).styleSheet;
      if (!importedSheet || !isSameOriginStylesheet(importedSheet)) continue;
      try {
        collectFontFacesFromRules(
          importedSheet.cssRules,
          importedSheet.href ?? fallbackBaseUrl,
          fontFaces
        );
      } catch {
        // Browsers intentionally block CSSOM access to inaccessible sheets.
      }
      continue;
    }

    if ("cssRules" in rule) {
      try {
        collectFontFacesFromRules(
          (rule as CSSGroupingRule).cssRules,
          rule.parentStyleSheet?.href ?? fallbackBaseUrl,
          fontFaces
        );
      } catch {
        // Ignore inaccessible nested rules while keeping the export usable.
      }
    }
  }
}

function embeddedFontFaceCss(): string {
  const fontFaces = new Set<string>();
  for (const sheet of Array.from(document.styleSheets)) {
    if (!isSameOriginStylesheet(sheet)) continue;
    try {
      collectFontFacesFromRules(
        sheet.cssRules,
        sheet.href ?? document.baseURI,
        fontFaces
      );
    } catch {
      // A sheet can still reject CSSOM access despite appearing same-origin.
    }
  }
  return Array.from(fontFaces).join("\n");
}

function restoreExportElements(svg: SVGSVGElement): void {
  for (const element of Array.from(svg.querySelectorAll<SVGElement>("[data-export-restore]"))) {
    element.removeAttribute("hidden");
    element.removeAttribute("aria-hidden");
    element.removeAttribute("display");
    element.removeAttribute("visibility");
    element.removeAttribute("opacity");
    element.style.removeProperty("display");
    element.style.removeProperty("visibility");
    element.style.removeProperty("opacity");
    element.removeAttribute("data-export-restore");
  }
}

function copyCssCustomProperties(source: SVGSVGElement, clone: SVGSVGElement): void {
  const computed = window.getComputedStyle(source);
  for (let index = 0; index < computed.length; index += 1) {
    const property = computed.item(index);
    if (!property.startsWith("--")) continue;
    const value = computed.getPropertyValue(property);
    if (value) clone.style.setProperty(property, value);
  }
}

function exportViewBox(svg: SVGSVGElement): { value: string; width: number; height: number } {
  const viewBox = svg.viewBox.baseVal;
  if (viewBox.width > 0 && viewBox.height > 0) {
    return {
      value: `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`,
      width: viewBox.width,
      height: viewBox.height,
    };
  }

  const bounds = svg.getBoundingClientRect();
  const width = Math.max(1, bounds.width || svg.width.baseVal.value || 1);
  const height = Math.max(1, bounds.height || svg.height.baseVal.value || 1);
  return { value: `0 0 ${width} ${height}`, width, height };
}

async function prepareSvgElement(sourceSvg: SVGSVGElement): Promise<PreparedSvg> {
  if (typeof document === "undefined") {
    throw new Error("SVG export is only available in the browser.");
  }

  if (document.fonts) await document.fonts.ready;

  const clone = sourceSvg.cloneNode(true) as SVGSVGElement;
  for (const element of Array.from(clone.querySelectorAll("[data-export-ignore]"))) {
    element.remove();
  }
  restoreExportElements(clone);

  const viewBox = exportViewBox(sourceSvg);
  clone.setAttribute("xmlns", SVG_NAMESPACE);
  clone.setAttribute("xmlns:xlink", XLINK_NAMESPACE);
  clone.setAttribute("viewBox", viewBox.value);
  clone.setAttribute("width", String(viewBox.width));
  clone.setAttribute("height", String(viewBox.height));
  clone.style.width = `${viewBox.width}px`;
  clone.style.height = `${viewBox.height}px`;
  clone.style.overflow = "visible";
  copyCssCustomProperties(sourceSvg, clone);

  const exportCss = `
.relationship-diagram-label,
.sunburst-rich-label {
  white-space: pre-wrap;
  word-break: keep-all;
  overflow-wrap: normal;
  hyphens: none;
}
.relationship-diagram-label > *,
.sunburst-rich-label > * {
  width: 100%;
  margin: 0;
}
.relationship-diagram-label *,
.sunburst-rich-label * {
  font-size: inherit !important;
  line-height: inherit !important;
}
.relationship-diagram-label[lang="sa"] *,
.sunburst-rich-label[lang="sa"] * {
  font-family: inherit !important;
}
.relationship-diagram-label mark,
.sunburst-rich-label mark {
  padding: 0 0.08em;
}
${embeddedFontFaceCss()}`.trim();
  if (exportCss) {
    const style = document.createElementNS(SVG_NAMESPACE, "style");
    style.setAttribute("type", "text/css");
    style.textContent = exportCss;
    clone.insertBefore(style, clone.firstChild);
  }

  const serialized = new XMLSerializer().serializeToString(clone);
  return {
    source: `<?xml version="1.0" encoding="UTF-8"?>\n${serialized}`,
    width: viewBox.width,
    height: viewBox.height,
  };
}

async function prepareSunburstSvg(): Promise<PreparedSvg> {
  if (typeof document === "undefined") {
    throw new Error("Radial chart export is only available in the browser.");
  }
  return prepareSvgElement(findVisibleSunburstSvg());
}

async function prepareRelationshipDiagramSvg(nodeId: string): Promise<PreparedSvg> {
  if (typeof document === "undefined") {
    throw new Error("Relationship diagram export is only available in the browser.");
  }
  return prepareSvgElement(findVisibleRelationshipDiagramSvg(nodeId));
}

function loadSvgImage(source: string): Promise<{ image: HTMLImageElement; url: string }> {
  const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve({ image, url });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("The exported SVG could not be rendered as an image."));
    };
    image.src = url;
  });
}

function canvasPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new ExportError({
          stage: "encode-png",
          code: "PNG_BLOB_CREATION_FAILED",
          message: "Canvas encoding returned an empty PNG Blob.",
          diagnostics: { blobCreated: false, renderer: "canvas-2d" },
        }));
      }, "image/png");
    } catch (cause) {
      reject(new ExportError({
        stage: "encode-png",
        cause,
        diagnostics: { blobCreated: false, renderer: "canvas-2d" },
      }));
    }
  });
}

async function preparedSvgPngBlob(prepared: PreparedSvg): Promise<Blob> {
  const plan = createPngExportPlan(
    { x: 0, y: 0, width: prepared.width, height: prepared.height },
    EXPORT_SCALE
  );
  const { image, url } = await loadSvgImage(prepared.source);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = plan.outputWidth;
    canvas.height = plan.outputHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new ExportError({
        stage: "create-canvas",
        code: "CANVAS_CONTEXT_FAILED",
        message: "Canvas 2D context creation returned null.",
        diagnostics: {
          outputWidth: plan.outputWidth,
          outputHeight: plan.outputHeight,
          totalPixels: plan.totalPixels,
          canvasCreated: true,
          canvasContextCreated: false,
          renderer: "canvas-2d",
        },
      });
    }

    try {
      context.drawImage(image, 0, 0, plan.outputWidth, plan.outputHeight);
    } catch (cause) {
      throw new ExportError({
        stage: "draw-canvas",
        cause,
        diagnostics: {
          outputWidth: plan.outputWidth,
          outputHeight: plan.outputHeight,
          totalPixels: plan.totalPixels,
          canvasCreated: true,
          canvasContextCreated: true,
          renderer: "canvas-2d",
        },
      });
    }
    return canvasPngBlob(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function getNodeText(node: VidyaNode): string {
  const d = node.data;
  if ("text" in d && d.text) return String(d.text);
  if ("title" in d && d.title) return String(d.title);
  if ("topic" in d && d.topic) return String(d.topic);
  if ("label" in d && d.label) return String(d.label);
  return "Untitled";
}

function formatSanskritCard(node: VidyaNode): string {
  const d = node.data as Record<string, unknown>;
  let md = `## Sanskrit Card: ${d.title ?? "Untitled"}\n\n`;
  if (d.source) md += `*Source:* ${d.source}\n\n`;
  if (d.devanagari) md += `### Devanāgarī\n${d.devanagari}\n\n`;
  if (d.iast) md += `### IAST\n${d.iast}\n\n`;
  if (d.translation) md += `### Translation\n${d.translation}\n\n`;
  if (d.grammarNotes) md += `### Grammar Notes\n${d.grammarNotes}\n\n`;
  if (Array.isArray(d.tags) && d.tags.length)
    md += `*Tags:* ${(d.tags as string[]).join(", ")}\n\n`;
  return md;
}

function formatShlokaCard(node: VidyaNode): string {
  const d = node.data as Record<string, unknown>;
  let md = `## Śloka: ${d.title ?? "Untitled"}\n\n`;
  if (d.sourceText) md += `*Source:* ${d.sourceText}\n\n`;
  if (d.devanagari) md += `### Devanāgarī\n${d.devanagari}\n\n`;
  if (d.iast) md += `### IAST\n${d.iast}\n\n`;
  if (d.padaccheda) md += `### Padaccheda\n${d.padaccheda}\n\n`;
  if (d.anvaya) md += `### Anvaya\n${d.anvaya}\n\n`;
  if (d.padartha) md += `### Padārtha\n${d.padartha}\n\n`;
  if (d.translation) md += `### Translation\n${d.translation}\n\n`;
  if (d.chandas) md += `### Chandas\n${d.chandas}\n\n`;
  if (d.notes) md += `### Notes\n${d.notes}\n\n`;
  return md;
}

function formatGrammarCard(node: VidyaNode): string {
  const d = node.data as Record<string, unknown>;
  let md = `## Grammar: ${d.topic ?? "Untitled"}\n\n`;
  if (d.category) md += `*Category:* ${d.category}\n\n`;
  if (d.rule) md += `### Rule\n${d.rule}\n\n`;
  if (Array.isArray(d.examples))
    md += `### Examples\n${(d.examples as string[]).map((e) => `- ${e}`).join("\n")}\n\n`;
  if (d.exceptions) md += `### Exceptions\n${d.exceptions}\n\n`;
  return md;
}

export function exportToMarkdown(board: VidyaBoard): string {
  let md = `# ${board.title}\n\n`;
  if (board.description) md += `${board.description}\n\n`;

  const mindmapNodes = board.content.nodes.filter((n) => n.type === "mindmap");
  const specialNodes = board.content.nodes.filter(
    (n) => n.type === "sanskrit" || n.type === "shloka" || n.type === "grammar"
  );
  const otherNodes = board.content.nodes.filter(
    (n) =>
      !["mindmap", "sanskrit", "shloka", "grammar"].includes(n.type ?? "")
  );

  if (mindmapNodes.length) {
    md += `## Mind Map\n\n`;
    for (const node of mindmapNodes) {
      md += `- ${getNodeText(node)}`;
      const tags = (node.data as { tags?: string[] }).tags;
      if (tags?.length) md += ` *[${tags.join(", ")}]*`;
      md += `\n`;
    }
    md += `\n`;
  }

  for (const node of specialNodes) {
    if (node.type === "sanskrit") md += formatSanskritCard(node);
    else if (node.type === "shloka") md += formatShlokaCard(node);
    else if (node.type === "grammar") md += formatGrammarCard(node);
  }

  if (otherNodes.length) {
    md += `## Other Elements\n\n`;
    for (const node of otherNodes) {
      md += `- **${node.type}:** ${getNodeText(node)}\n`;
    }
  }

  const labeledEdges = board.content.edges.filter((e) => e.data?.label);
  if (labeledEdges.length) {
    md += `\n## Connections\n\n`;
    for (const edge of labeledEdges) {
      md += `- ${edge.source} → ${edge.target}: ${edge.data?.label}\n`;
    }
  }

  return md;
}

export function downloadFile(content: string, filename: string, mime: string) {
  downloadBlob(new Blob([content], { type: mime }), filename);
}

export function downloadJson(board: VidyaBoard) {
  const json = JSON.stringify(
    { version: BOARD_CONTENT_VERSION, exportedAt: new Date().toISOString(), board },
    null,
    2
  );
  downloadFile(json, `${board.title.replace(/\s+/g, "-")}.vidyamap.json`, "application/json");
}

export function downloadMarkdown(board: VidyaBoard) {
  downloadFile(
    exportToMarkdown(board),
    `${board.title.replace(/\s+/g, "-")}.md`,
    "text/markdown"
  );
}

export async function downloadSunburstSvg(boardTitle: string): Promise<void> {
  const prepared = await prepareSunburstSvg();
  downloadBlob(
    new Blob([prepared.source], { type: "image/svg+xml;charset=utf-8" }),
    safeFilename(boardTitle, "svg")
  );
}

export async function downloadSunburstPng(boardTitle: string): Promise<void> {
  const prepared = await prepareSunburstSvg();
  const png = await preparedSvgPngBlob(prepared);
  downloadBlob(png, safeFilename(boardTitle, "png"));
}

export async function downloadRelationshipDiagramSvg(
  nodeId: string,
  title: string
): Promise<void> {
  const prepared = await prepareRelationshipDiagramSvg(nodeId);
  downloadBlob(
    new Blob([prepared.source], { type: "image/svg+xml;charset=utf-8" }),
    safeFilename(title, "svg", "relationship-diagram")
  );
}

export async function downloadRelationshipDiagramPng(
  nodeId: string,
  title: string
): Promise<void> {
  const prepared = await prepareRelationshipDiagramSvg(nodeId);
  const png = await preparedSvgPngBlob(prepared);
  downloadBlob(png, safeFilename(title, "png", "relationship-diagram"));
}
