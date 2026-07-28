import { isSafeLinkHref } from "../canvas/rich-text-link";

import {
  clientRectToFlowBounds,
  type ExportViewportTransform,
} from "./bounds";
import type { ExportBounds } from "./types";

const CSS_PIXEL_TO_POINT = 0.75;
const PDF_MAX_PAGE_POINTS = 14_400;

export interface PdfLinkAnnotation {
  href: string;
  bounds: ExportBounds;
}

export interface PdfPageSize {
  width: number;
  height: number;
  pointsPerPixel: number;
}

export interface CreateBoardPdfOptions {
  png: Blob | Uint8Array;
  sourceWidth: number;
  sourceHeight: number;
  exportBounds: ExportBounds;
  links?: PdfLinkAnnotation[];
  title?: string;
}

export interface CreatedBoardPdf {
  blob: Blob;
  pageWidth: number;
  pageHeight: number;
  linkAnnotationCount: number;
}

export type PdfPaperSize = "letter" | "a4";
export type PdfPageOrientation = "auto" | "portrait" | "landscape";

export interface PrintPdfPagePlacement {
  pageWidth: number;
  pageHeight: number;
  imageX: number;
  imageY: number;
  imageWidth: number;
  imageHeight: number;
  pointsPerPixel: number;
}

export interface BoardPdfPage {
  png: Blob | Uint8Array;
  sourceWidth: number;
  sourceHeight: number;
  exportBounds: ExportBounds;
  links?: PdfLinkAnnotation[];
}

export interface CreateMultiPageBoardPdfOptions {
  pages: BoardPdfPage[];
  paperSize?: PdfPaperSize;
  orientation?: PdfPageOrientation;
  margin?: number;
  title?: string;
}

export interface CreatedMultiPageBoardPdf extends CreatedBoardPdf {
  pageCount: number;
}

type CollectPdfLinkOptions = {
  root: HTMLElement;
  nodeIds: readonly string[];
  edgeIds: readonly string[];
  exportBounds: ExportBounds;
  viewport: ExportViewportTransform;
  baseUrl?: string;
};

function finitePositive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive finite number.`);
  }
  return value;
}

export function resolvePdfPageSize(sourceWidth: number, sourceHeight: number): PdfPageSize {
  finitePositive(sourceWidth, "PDF source width");
  finitePositive(sourceHeight, "PDF source height");
  const naturalWidth = sourceWidth * CSS_PIXEL_TO_POINT;
  const naturalHeight = sourceHeight * CSS_PIXEL_TO_POINT;
  const clampScale = Math.min(
    1,
    PDF_MAX_PAGE_POINTS / naturalWidth,
    PDF_MAX_PAGE_POINTS / naturalHeight
  );
  const width = naturalWidth * clampScale;
  const height = naturalHeight * clampScale;
  return {
    width,
    height,
    pointsPerPixel: width / sourceWidth,
  };
}

const PDF_PAPER_POINTS: Record<PdfPaperSize, readonly [number, number]> = {
  letter: [612, 792],
  a4: [595.28, 841.89],
};

function printPlacementForDimensions(
  sourceWidth: number,
  sourceHeight: number,
  pageWidth: number,
  pageHeight: number,
  margin: number
): PrintPdfPagePlacement {
  const safeMargin = Math.min(
    Math.max(0, margin),
    Math.max(0, Math.min(pageWidth, pageHeight) / 2 - 1)
  );
  const availableWidth = Math.max(1, pageWidth - safeMargin * 2);
  const availableHeight = Math.max(1, pageHeight - safeMargin * 2);
  const pointsPerPixel = Math.min(
    availableWidth / sourceWidth,
    availableHeight / sourceHeight
  );
  const imageWidth = sourceWidth * pointsPerPixel;
  const imageHeight = sourceHeight * pointsPerPixel;
  return {
    pageWidth,
    pageHeight,
    imageX: (pageWidth - imageWidth) / 2,
    imageY: (pageHeight - imageHeight) / 2,
    imageWidth,
    imageHeight,
    pointsPerPixel,
  };
}

export function resolvePrintPdfPagePlacement(
  sourceWidth: number,
  sourceHeight: number,
  paperSize: PdfPaperSize = "letter",
  orientation: PdfPageOrientation = "auto",
  margin = 24
): PrintPdfPagePlacement {
  finitePositive(sourceWidth, "PDF source width");
  finitePositive(sourceHeight, "PDF source height");
  if (!Number.isFinite(margin) || margin < 0) {
    throw new RangeError("PDF page margin must be a finite non-negative number.");
  }
  const [portraitWidth, portraitHeight] = PDF_PAPER_POINTS[paperSize];
  const resolvedOrientation = orientation === "auto"
    ? sourceWidth >= sourceHeight ? "landscape" : "portrait"
    : orientation;
  const pageWidth = resolvedOrientation === "landscape" ? portraitHeight : portraitWidth;
  const pageHeight = resolvedOrientation === "landscape" ? portraitWidth : portraitHeight;
  return printPlacementForDimensions(
    sourceWidth,
    sourceHeight,
    pageWidth,
    pageHeight,
    margin
  );
}

function intersection(first: ExportBounds, second: ExportBounds): ExportBounds | null {
  const x = Math.max(first.x, second.x);
  const y = Math.max(first.y, second.y);
  const right = Math.min(first.x + first.width, second.x + second.width);
  const bottom = Math.min(first.y + first.height, second.y + second.height);
  if (right <= x || bottom <= y) return null;
  return { x, y, width: right - x, height: bottom - y };
}

export function pdfRectForExportLink(
  linkBounds: ExportBounds,
  exportBounds: ExportBounds,
  page: PdfPageSize
): ExportBounds | null {
  const clipped = intersection(linkBounds, exportBounds);
  if (!clipped) return null;
  return {
    x: (clipped.x - exportBounds.x) * page.pointsPerPixel,
    y: (clipped.y - exportBounds.y) * page.pointsPerPixel,
    width: clipped.width * page.pointsPerPixel,
    height: clipped.height * page.pointsPerPixel,
  };
}

export function pdfRectForPlacedExportLink(
  linkBounds: ExportBounds,
  exportBounds: ExportBounds,
  page: PrintPdfPagePlacement
): ExportBounds | null {
  const clipped = intersection(linkBounds, exportBounds);
  if (!clipped) return null;
  return {
    x: page.imageX + (clipped.x - exportBounds.x) * page.pointsPerPixel,
    y: page.imageY + (clipped.y - exportBounds.y) * page.pointsPerPixel,
    width: clipped.width * page.pointsPerPixel,
    height: clipped.height * page.pointsPerPixel,
  };
}

export function resolvePdfLinkHref(href: string, baseUrl: string): string | null {
  if (!isSafeLinkHref(href)) return null;
  if (/^(?:https?:|mailto:|tel:)/i.test(href)) return href;
  try {
    return new URL(href, baseUrl).href;
  } catch {
    return null;
  }
}

function belongsToExportScope(
  element: Element,
  nodeIds: ReadonlySet<string>,
  edgeIds: ReadonlySet<string>
): boolean {
  const node = element.closest(".react-flow__node[data-id]");
  if (node) return nodeIds.has(node.getAttribute("data-id") ?? "");
  const edge = element.closest("[data-export-edge-id]");
  return !!edge && edgeIds.has(edge.getAttribute("data-export-edge-id") ?? "");
}

/** Collect one annotation per rendered link fragment so wrapped labels stay precise. */
export function collectPdfLinkAnnotations(options: CollectPdfLinkOptions): PdfLinkAnnotation[] {
  const nodeIds = new Set(options.nodeIds);
  const edgeIds = new Set(options.edgeIds);
  const containerRect = options.root.getBoundingClientRect();
  const baseUrl = options.baseUrl
    ?? (typeof window !== "undefined" ? window.location.href : "https://localhost/");
  const annotations: PdfLinkAnnotation[] = [];

  for (const link of Array.from(options.root.querySelectorAll<Element>("a[href]"))) {
    if (link.closest("[data-export-ignore]") || !belongsToExportScope(link, nodeIds, edgeIds)) continue;
    const href = resolvePdfLinkHref(link.getAttribute("href") ?? "", baseUrl);
    if (!href) continue;
    for (const rect of Array.from(link.getClientRects())) {
      if (rect.width <= 0 || rect.height <= 0) continue;
      const flowBounds = clientRectToFlowBounds(rect, containerRect, options.viewport);
      const clipped = intersection(flowBounds, options.exportBounds);
      if (clipped) annotations.push({ href, bounds: clipped });
    }
  }
  return annotations;
}

export async function createBoardPdf(options: CreateBoardPdfOptions): Promise<CreatedBoardPdf> {
  const sourceWidth = finitePositive(options.sourceWidth, "PDF source width");
  const sourceHeight = finitePositive(options.sourceHeight, "PDF source height");
  const page = resolvePdfPageSize(sourceWidth, sourceHeight);
  const { jsPDF } = await import("jspdf");
  const orientation = page.width >= page.height ? "landscape" : "portrait";
  const document = new jsPDF({
    orientation,
    unit: "pt",
    format: [page.width, page.height],
    compress: true,
    putOnlyUsedFonts: true,
    precision: 6,
  });
  const pageWidth = document.internal.pageSize.getWidth();
  const pageHeight = document.internal.pageSize.getHeight();
  const actualPage: PdfPageSize = {
    width: pageWidth,
    height: pageHeight,
    pointsPerPixel: pageWidth / sourceWidth,
  };
  const png = options.png instanceof Blob
    ? new Uint8Array(await options.png.arrayBuffer())
    : options.png;
  document.addImage(png, "PNG", 0, 0, pageWidth, pageHeight, undefined, "FAST");
  if (options.title?.trim()) {
    document.setDocumentProperties({ title: options.title.trim() });
  }
  document.viewerPreferences({ FitWindow: true, DisplayDocTitle: true });

  let linkAnnotationCount = 0;
  for (const link of options.links ?? []) {
    const rect = pdfRectForExportLink(link.bounds, options.exportBounds, actualPage);
    if (!rect) continue;
    document.link(rect.x, rect.y, rect.width, rect.height, { url: link.href });
    linkAnnotationCount += 1;
  }

  const blob = document.output("blob");
  if (!blob || blob.size === 0) throw new Error("jsPDF returned an empty PDF Blob.");
  return { blob, pageWidth, pageHeight, linkAnnotationCount };
}

export async function createMultiPageBoardPdf(
  options: CreateMultiPageBoardPdfOptions
): Promise<CreatedMultiPageBoardPdf> {
  if (options.pages.length === 0) {
    throw new RangeError("A multi-page PDF requires at least one page.");
  }
  const margin = options.margin ?? 24;
  const paperSize = options.paperSize ?? "letter";
  const orientation = options.orientation ?? "auto";
  const first = options.pages[0];
  const firstPlacement = resolvePrintPdfPagePlacement(
    first.sourceWidth,
    first.sourceHeight,
    paperSize,
    orientation,
    margin
  );
  const { jsPDF } = await import("jspdf");
  const document = new jsPDF({
    orientation: firstPlacement.pageWidth >= firstPlacement.pageHeight ? "landscape" : "portrait",
    unit: "pt",
    format: [firstPlacement.pageWidth, firstPlacement.pageHeight],
    compress: true,
    putOnlyUsedFonts: true,
    precision: 6,
  });

  if (options.title?.trim()) {
    document.setDocumentProperties({ title: options.title.trim() });
  }
  document.viewerPreferences({ FitWindow: true, DisplayDocTitle: true });

  let firstPageWidth = 0;
  let firstPageHeight = 0;
  let linkAnnotationCount = 0;
  for (const [index, page] of options.pages.entries()) {
    const requestedPlacement = resolvePrintPdfPagePlacement(
      page.sourceWidth,
      page.sourceHeight,
      paperSize,
      orientation,
      margin
    );
    const pageOrientation = requestedPlacement.pageWidth >= requestedPlacement.pageHeight
      ? "landscape"
      : "portrait";
    if (index > 0) {
      document.addPage(
        [requestedPlacement.pageWidth, requestedPlacement.pageHeight],
        pageOrientation
      );
    }
    const pageWidth = document.internal.pageSize.getWidth();
    const pageHeight = document.internal.pageSize.getHeight();
    if (index === 0) {
      firstPageWidth = pageWidth;
      firstPageHeight = pageHeight;
    }
    const actualPlacement = printPlacementForDimensions(
      page.sourceWidth,
      page.sourceHeight,
      pageWidth,
      pageHeight,
      margin
    );
    const png = page.png instanceof Blob
      ? new Uint8Array(await page.png.arrayBuffer())
      : page.png;
    document.addImage(
      png,
      "PNG",
      actualPlacement.imageX,
      actualPlacement.imageY,
      actualPlacement.imageWidth,
      actualPlacement.imageHeight,
      undefined,
      "FAST"
    );
    for (const link of page.links ?? []) {
      const rect = pdfRectForPlacedExportLink(
        link.bounds,
        page.exportBounds,
        actualPlacement
      );
      if (!rect) continue;
      document.link(rect.x, rect.y, rect.width, rect.height, { url: link.href });
      linkAnnotationCount += 1;
    }
  }

  const blob = document.output("blob");
  if (!blob || blob.size === 0) throw new Error("jsPDF returned an empty PDF Blob.");
  return {
    blob,
    pageWidth: firstPageWidth,
    pageHeight: firstPageHeight,
    pageCount: options.pages.length,
    linkAnnotationCount,
  };
}
