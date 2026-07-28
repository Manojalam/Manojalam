import { compactRawHierarchy, geometryLinesToRawHierarchy } from "./draft";
import {
  canvasPreview,
  createLocalOcrWorker,
  OCR_MAX_EDGE,
  recognizeCanvasLines,
} from "./raster";
import { filenameWithoutExtension } from "./text";
import type {
  GeometryTextLine,
  HierarchyDraft,
  HierarchyParseOptions,
  HierarchyPreviewPage,
} from "./types";
import type {
  PDFPageProxy,
  TextItem,
} from "pdfjs-dist/types/src/display/api";

type PdfPageViewport = ReturnType<PDFPageProxy["getViewport"]>;

const PDF_LIMIT_BYTES = 25 * 1024 * 1024;
const PDF_PAGE_LIMIT = 20;
const PDF_OCR_SCALE = 300 / 72;

interface PdfTextItemLike {
  str: string;
  transform: number[];
  width: number;
  height: number;
  hasEOL: boolean;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Import cancelled", "AbortError");
}

export function hasUsablePdfText(value: string): boolean {
  if (!value || value.includes("\u0000")) return false;
  const characters = Array.from(value);
  const visible = characters.filter((character) => !/\s/u.test(character));
  if (visible.length < 20) return false;
  const invalid = visible.filter((character) =>
    character === "\ufffd" ||
    (/[\u0000-\u001f\u007f-\u009f]/u.test(character) && character !== "\n")
  );
  const letters = visible.filter((character) =>
    /[\p{L}\p{N}\u0900-\u097f]/u.test(character)
  );
  return invalid.length / visible.length < 0.02 &&
    letters.length / visible.length >= 0.35;
}

function groupPdfTextItems(
  items: PdfTextItemLike[],
  viewport: { width: number; height: number; transform: number[] },
  transform: (first: number[], second: number[]) => number[],
  pageNumber: number
): GeometryTextLine[] {
  const pieces = items
    .map((item) => {
      const matrix = transform(viewport.transform, item.transform);
      const height = Math.max(1, Math.hypot(matrix[2], matrix[3]) || item.height);
      return {
        text: item.str,
        x: matrix[4],
        y: matrix[5] - height,
        width: Math.max(1, item.width * Math.hypot(viewport.transform[0], viewport.transform[1])),
        height,
        hasEOL: item.hasEOL,
      };
    })
    .filter((piece) => piece.text.trim().length > 0)
    .sort((a, b) => a.y - b.y || a.x - b.x);

  const rows: Array<{
    pieces: typeof pieces;
    y: number;
    height: number;
  }> = [];
  for (const piece of pieces) {
    const tolerance = Math.max(3, piece.height * 0.55);
    const row = rows.find((candidate) => Math.abs(candidate.y - piece.y) <= tolerance);
    if (row) {
      row.pieces.push(piece);
      row.y = (row.y + piece.y) / 2;
      row.height = Math.max(row.height, piece.height);
    } else {
      rows.push({ pieces: [piece], y: piece.y, height: piece.height });
    }
  }

  return rows
    .sort((a, b) => a.y - b.y)
    .map((row) => {
      row.pieces.sort((a, b) => a.x - b.x);
      const x = Math.min(...row.pieces.map((piece) => piece.x));
      const right = Math.max(...row.pieces.map((piece) => piece.x + piece.width));
      return {
        text: row.pieces.map((piece) => piece.text).join(" ").replace(/\s+/gu, " ").trim(),
        x,
        y: row.y,
        width: Math.max(1, right - x),
        height: row.height,
        page: pageNumber,
        pageWidth: viewport.width,
        pageHeight: viewport.height,
        confidence: 0.99,
      };
    })
    .filter((line) => line.text.length > 0);
}

async function renderPdfPage(
  page: PDFPageProxy,
  requestedScale: number
): Promise<{
  canvas: HTMLCanvasElement;
  viewport: PdfPageViewport;
}> {
  const unscaled = page.getViewport({ scale: 1 });
  const scale = Math.min(
    requestedScale,
    OCR_MAX_EDGE / Math.max(unscaled.width, unscaled.height)
  );
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  await page.render({ canvas, viewport, background: "#ffffff" }).promise;
  return { canvas, viewport };
}

export async function parsePdfFile(
  file: File,
  options: HierarchyParseOptions = {}
): Promise<HierarchyDraft> {
  if (file.size > PDF_LIMIT_BYTES) {
    throw new Error("PDF files must be 25 MB or smaller.");
  }
  throwIfAborted(options.signal);
  options.onProgress?.({ stage: "Opening PDF", progress: 0.02 });
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  });
  const previewPages: HierarchyPreviewPage[] = [];
  let ocrWorker: Awaited<ReturnType<typeof createLocalOcrWorker>> | null = null;
  const warnings: string[] = [];
  const abortHandler = () => {
    void ocrWorker?.terminate();
    void loadingTask.destroy();
  };
  options.signal?.addEventListener("abort", abortHandler, { once: true });

  try {
    const document = await loadingTask.promise;
    if (document.numPages > PDF_PAGE_LIMIT) {
      throw new Error(`PDF files may contain at most ${PDF_PAGE_LIMIT} pages.`);
    }
    const lines: GeometryTextLine[] = [];

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      throwIfAborted(options.signal);
      options.onProgress?.({
        stage: `Reading page ${pageNumber} of ${document.numPages}`,
        progress: (pageNumber - 1) / document.numPages,
        page: pageNumber,
        pageCount: document.numPages,
      });
      const page = await document.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const textItems = textContent.items.filter(
        (item): item is TextItem => "str" in item
      );
      const nativeText = textItems.map((item) => item.str).join(" ");
      const usableText = hasUsablePdfText(nativeText);
      const rendered = await renderPdfPage(page, usableText ? 1.7 : PDF_OCR_SCALE);
      try {
        previewPages.push(await canvasPreview(rendered.canvas, pageNumber));
        if (usableText) {
          lines.push(
            ...groupPdfTextItems(
              textItems,
              rendered.viewport,
              pdfjs.Util.transform,
              pageNumber
            )
          );
        } else {
          warnings.push(
            `Page ${pageNumber} used OCR because its embedded text was missing or corrupt.`
          );
          if (!ocrWorker) {
            options.onProgress?.({
              stage: "Loading local Sanskrit and English OCR",
              progress: (pageNumber - 1) / document.numPages,
              page: pageNumber,
              pageCount: document.numPages,
            });
            ocrWorker = await createLocalOcrWorker(options);
          }
          lines.push(
            ...(await recognizeCanvasLines(
              ocrWorker,
              rendered.canvas,
              pageNumber,
              options
            ))
          );
        }
      } finally {
        rendered.canvas.width = 1;
        rendered.canvas.height = 1;
        page.cleanup();
      }
    }

    throwIfAborted(options.signal);
    if (!lines.length) throw new Error("No readable text was found in this PDF.");
    options.onProgress?.({ stage: "Recovering hierarchy", progress: 0.94 });
    const roots = compactRawHierarchy(geometryLinesToRawHierarchy(lines));
    if (!roots.length) throw new Error("No hierarchy could be recovered from this PDF.");
    options.onProgress?.({ stage: "Hierarchy ready for review", progress: 1 });
    return {
      title: roots[0]?.label ?? filenameWithoutExtension(file.name),
      sourceName: file.name,
      sourceKind: "pdf",
      roots,
      warnings,
      previewPages,
    };
  } catch (error) {
    previewPages.forEach((preview) => URL.revokeObjectURL(preview.url));
    const name = error instanceof Error ? error.name : "";
    if (name === "PasswordException") {
      throw new Error("Encrypted or password-protected PDFs are not supported.");
    }
    throw error;
  } finally {
    options.signal?.removeEventListener("abort", abortHandler);
    await ocrWorker?.terminate();
    await loadingTask.destroy();
  }
}
