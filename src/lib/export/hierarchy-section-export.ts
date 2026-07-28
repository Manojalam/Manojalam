import type { ExportViewportTransform } from "./bounds";
import type { ExportBackgroundTexture } from "./dom-renderer";
import type { HierarchySectionExport } from "./hierarchy-sections";
import {
  collectPdfLinkAnnotations,
  createMultiPageBoardPdf,
  type PdfPaperSize,
} from "./pdf";
import {
  exportBoardVisual,
  initiateBlobDownload,
  type ExportBoardVisualResult,
} from "./pipeline";
import type { ExportAssetWarning, ExportFormat } from "./types";

export interface ExportHierarchySectionsOptions {
  viewport: HTMLElement;
  sections: readonly HierarchySectionExport[];
  format: ExportFormat;
  requestedScale: number;
  filename: string;
  title?: string;
  background?: string | null;
  backgroundTexture?: ExportBackgroundTexture | null;
  appearanceBackground?: string | null;
  viewportTransform?: ExportViewportTransform;
  pdfPaperSize?: PdfPaperSize;
  signal?: AbortSignal;
  onProgress?: (completed: number, total: number) => void;
}

export interface ExportHierarchySectionsResult {
  format: ExportFormat;
  outputCount: number;
  pageCount: number;
  width: number;
  height: number;
  effectiveScale: number;
  adjusted: boolean;
  assetWarnings: ExportAssetWarning[];
  downloadInitiated: true;
}

function safeFilenameStem(value: string): string {
  return value
    .trim()
    .replace(/\.(?:png|jpe?g|svg|pdf)$/i, "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.\s-]+|[.\s-]+$/g, "") || "hierarchy";
}

export function hierarchySectionDownloadFilename(
  base: string,
  section: Pick<HierarchySectionExport, "index" | "label">,
  total: number,
  format: ExportFormat
): string {
  const numberWidth = Math.max(2, String(Math.max(1, total)).length);
  const number = String(section.index + 1).padStart(numberWidth, "0");
  const label = safeFilenameStem(section.label).slice(0, 80) || `section-${number}`;
  const extension = format === "jpg" ? "jpg" : format;
  return `${safeFilenameStem(base)}-${number}-${label}.${extension}`;
}

export async function exportHierarchySections(
  options: ExportHierarchySectionsOptions
): Promise<ExportHierarchySectionsResult> {
  if (options.sections.length === 0) {
    throw new RangeError("Select at least one hierarchy section to export.");
  }

  const rasterFormat = options.format === "pdf" ? "png" : options.format;
  const rendered: Array<{
    section: HierarchySectionExport;
    result: ExportBoardVisualResult;
  }> = [];
  for (const [index, section] of options.sections.entries()) {
    const result = await exportBoardVisual({
      viewport: options.viewport,
      bounds: section.bounds,
      nodeIds: section.nodeIds,
      edgeIds: section.edgeIds,
      scopeKind: "subtree",
      format: rasterFormat,
      requestedScale: options.requestedScale,
      filename: hierarchySectionDownloadFilename(
        options.filename,
        section,
        options.sections.length,
        rasterFormat
      ),
      title: `${options.title || options.filename} — ${section.label}`,
      background: options.background,
      backgroundTexture: options.backgroundTexture,
      headerOverlay: section.headerOverlay,
      layoutAdjustment: section.layoutAdjustment,
      appearanceBackground: options.appearanceBackground,
      viewportTransform: options.viewportTransform,
      download: false,
      signal: options.signal,
    });
    rendered.push({ section, result });
    options.onProgress?.(index + 1, options.sections.length);
  }

  let width = rendered[0].result.width;
  let height = rendered[0].result.height;
  let pageCount = 0;
  if (options.format === "pdf") {
    const pdf = await createMultiPageBoardPdf({
      pages: rendered.map(({ section, result }) => ({
        png: result.blob,
        sourceWidth: Math.max(1, Math.ceil(section.bounds.width)),
        sourceHeight: Math.max(1, Math.ceil(section.bounds.height)),
        exportBounds: section.bounds,
        links: options.viewportTransform
          ? collectPdfLinkAnnotations({
              root: options.viewport,
              nodeIds: section.nodeIds,
              edgeIds: section.edgeIds,
              exportBounds: section.bounds,
              viewport: options.viewportTransform,
            })
          : [],
      })),
      paperSize: options.pdfPaperSize ?? "letter",
      orientation: "auto",
      margin: 24,
      title: options.title || options.filename,
    });
    initiateBlobDownload(
      pdf.blob,
      `${safeFilenameStem(options.filename)}.pdf`,
      options.signal
    );
    width = Math.round(pdf.pageWidth);
    height = Math.round(pdf.pageHeight);
    pageCount = pdf.pageCount;
  } else {
    // Trigger the prepared files together so the browser can handle them as
    // one intentional multi-download action. It may still show its standard
    // permission prompt when more than one section is selected.
    for (const { section, result } of rendered) {
      initiateBlobDownload(
        result.blob,
        hierarchySectionDownloadFilename(
          options.filename,
          section,
          options.sections.length,
          options.format
        ),
        options.signal
      );
    }
  }

  return {
    format: options.format,
    outputCount: options.format === "pdf" ? 1 : rendered.length,
    pageCount,
    width,
    height,
    effectiveScale: Math.min(...rendered.map(({ result }) => result.effectiveScale)),
    adjusted: rendered.some(({ result }) => result.plan?.adjusted === true),
    assetWarnings: rendered.flatMap(({ result }) => result.assetWarnings),
    downloadInitiated: true,
  };
}
