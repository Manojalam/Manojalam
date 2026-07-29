import { geometryLinesToRawHierarchy } from "./draft";
import type {
  GeometryTextLine,
  HierarchyParseOptions,
  HierarchyPreviewPage,
} from "./types";

const IMAGE_LIMIT_BYTES = 25 * 1024 * 1024;
const IMAGE_LIMIT_PIXELS = 40_000_000;
export const OCR_MAX_EDGE = 4000;
const PREVIEW_MAX_EDGE = 1400;
const OCR_RETRY_WORD_CONFIDENCE = 60;
const OCR_RETRY_MAX_LINES = 8;

type OcrWorker = Awaited<
  ReturnType<typeof import("tesseract.js").createWorker>
>;

interface OcrBoundingBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface OcrWordLike {
  text: string;
  confidence: number;
}

interface OcrLineLike {
  text: string;
  confidence: number;
  bbox: OcrBoundingBox;
  words: OcrWordLike[];
}

interface OcrScriptCounts {
  devanagari: number;
  latin: number;
}

interface DevanagariRetryAssessment {
  text: string;
  confidence: number;
  words: OcrWordLike[];
  pageText: string;
  nativeHint?: string;
}

interface DevanagariRetryChoice {
  originalText: string;
  originalConfidence: number;
  retryText: string;
  retryConfidence: number;
  nativeHint?: string;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Import cancelled", "AbortError");
}

function ocrScriptCounts(value: string): OcrScriptCounts {
  let devanagari = 0;
  let latin = 0;
  for (const character of value) {
    if (/[\u0900-\u097f]/u.test(character)) devanagari += 1;
    else if (/[A-Za-z]/u.test(character)) latin += 1;
  }
  return { devanagari, latin };
}

function latinTokens(value: string): string[] {
  return value.match(/[A-Za-z]{2,}/gu)?.map((token) => token.toLowerCase()) ?? [];
}

function hasMatchingNativeLatinToken(text: string, nativeHint?: string): boolean {
  if (!nativeHint) return false;
  const nativeTokens = new Set(latinTokens(nativeHint));
  return latinTokens(text).some((token) => nativeTokens.has(token));
}

export function shouldRetryDevanagariOcrLine({
  text,
  confidence,
  words,
  pageText,
  nativeHint,
}: DevanagariRetryAssessment): boolean {
  const page = ocrScriptCounts(pageText);
  if (page.devanagari < 12 || page.devanagari < page.latin * 2) return false;
  if (hasMatchingNativeLatinToken(text, nativeHint)) return false;

  const suspiciousLatinWord = words.some((word) =>
    word.confidence < OCR_RETRY_WORD_CONFIDENCE &&
    /[A-Za-z]{2,}/u.test(word.text)
  );
  if (!suspiciousLatinWord) return false;

  const source = ocrScriptCounts(nativeHint || text);
  const line = ocrScriptCounts(text);
  const probablyDevanagari =
    source.devanagari >= 2 && source.devanagari >= source.latin ||
    line.devanagari >= 4 && line.devanagari >= line.latin * 2;
  return probablyDevanagari && confidence < 0.85;
}

export function shouldUseDevanagariOcrRetry({
  originalText,
  originalConfidence,
  retryText,
  retryConfidence,
  nativeHint,
}: DevanagariRetryChoice): boolean {
  const original = ocrScriptCounts(originalText);
  const retry = ocrScriptCounts(retryText);
  if (!retryText.trim() || retryConfidence < 0.3) return false;
  if (retry.devanagari < 2 || retry.latin >= original.latin) return false;
  if (hasMatchingNativeLatinToken(originalText, nativeHint)) return false;

  const replacedLatin = original.latin - retry.latin;
  const addedDevanagari = retry.devanagari - original.devanagari;
  return replacedLatin >= 2 &&
    addedDevanagari >= 1 &&
    retryConfidence >= originalConfidence - 0.2;
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not create an image preview."));
    }, "image/png");
  });
}

export async function canvasPreview(
  source: HTMLCanvasElement,
  page: number
): Promise<HierarchyPreviewPage> {
  const scale = Math.min(1, PREVIEW_MAX_EDGE / Math.max(source.width, source.height));
  const preview = document.createElement("canvas");
  preview.width = Math.max(1, Math.round(source.width * scale));
  preview.height = Math.max(1, Math.round(source.height * scale));
  const context = preview.getContext("2d");
  if (!context) throw new Error("Canvas rendering is not available.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, preview.width, preview.height);
  context.drawImage(source, 0, 0, preview.width, preview.height);
  const blob = await canvasBlob(preview);
  preview.width = 1;
  preview.height = 1;
  return {
    page,
    url: URL.createObjectURL(blob),
    width: source.width,
    height: source.height,
  };
}

function connectorColumns(
  canvas: HTMLCanvasElement
): number[] {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return [];
  const width = Math.max(1, Math.floor(canvas.width * 0.48));
  const height = canvas.height;
  const image = context.getImageData(0, 0, width, height);
  const candidates: number[] = [];
  const minRun = Math.max(32, Math.round(height * 0.025));

  for (let x = 3; x < width; x += 3) {
    let run = 0;
    let best = 0;
    let gap = 0;
    for (let y = 0; y < height; y += 2) {
      const offset = (y * width + x) * 4;
      const dark =
        image.data[offset + 3] > 32 &&
        image.data[offset] + image.data[offset + 1] + image.data[offset + 2] < 420;
      if (dark) {
        run += 2 + gap;
        gap = 0;
        best = Math.max(best, run);
      } else if (run > 0 && gap < 4) {
        gap += 2;
      } else {
        run = 0;
        gap = 0;
      }
    }
    if (best >= minRun) candidates.push(x);
  }

  const columns: number[] = [];
  for (const candidate of candidates) {
    const last = columns.at(-1);
    if (last === undefined || candidate - last > 9) columns.push(candidate);
    else columns[columns.length - 1] = (last + candidate) / 2;
  }
  return columns;
}

function applyConnectorAnchors(
  canvas: HTMLCanvasElement,
  lines: GeometryTextLine[]
): GeometryTextLine[] {
  const columns = connectorColumns(canvas);
  if (!columns.length) return lines;
  return lines.map((line) => {
    const leftColumns = columns.filter(
      (column) => column < line.x - 4 && line.x - column < canvas.width * 0.14
    );
    const anchor = leftColumns.at(-1);
    return anchor === undefined ? line : { ...line, indentX: anchor };
  });
}

function nearestNativeHint(
  line: OcrLineLike,
  nativeHints: GeometryTextLine[]
): string | undefined {
  const lineCenterY = (line.bbox.y0 + line.bbox.y1) / 2;
  const lineHeight = Math.max(1, line.bbox.y1 - line.bbox.y0);
  let best: GeometryTextLine | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const hint of nativeHints) {
    const hintCenterY = hint.y + hint.height / 2;
    const distance = Math.abs(hintCenterY - lineCenterY);
    const tolerance = Math.max(lineHeight, hint.height) * 0.8;
    if (distance <= tolerance && distance < bestDistance) {
      best = hint;
      bestDistance = distance;
    }
  }
  return best?.text;
}

function lineRetryCanvas(
  source: HTMLCanvasElement,
  bbox: OcrBoundingBox,
  scale: number
): HTMLCanvasElement {
  const sourcePadding = 2;
  const left = Math.max(0, Math.floor(bbox.x0 - sourcePadding));
  const top = Math.max(0, Math.floor(bbox.y0 - sourcePadding));
  const right = Math.min(source.width, Math.ceil(bbox.x1 + sourcePadding));
  const bottom = Math.min(source.height, Math.ceil(bbox.y1 + sourcePadding));
  const sourceWidth = Math.max(1, right - left);
  const sourceHeight = Math.max(1, bottom - top);
  const margin = Math.max(6, Math.round(sourceHeight * scale * 0.25));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(sourceWidth * scale) + margin * 2);
  canvas.height = Math.max(1, Math.ceil(sourceHeight * scale) + margin * 2);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas rendering is not available.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(
    source,
    left,
    top,
    sourceWidth,
    sourceHeight,
    margin,
    margin,
    sourceWidth * scale,
    sourceHeight * scale
  );
  return canvas;
}

async function refineDevanagariOcrLines(
  worker: OcrWorker,
  canvas: HTMLCanvasElement,
  detectedLines: OcrLineLike[],
  nativeHints: GeometryTextLine[],
  options: HierarchyParseOptions
): Promise<OcrLineLike[]> {
  const pageText = detectedLines.map((line) => line.text).join("\n");
  const candidates = detectedLines
    .map((line) => ({
      line,
      nativeHint: nearestNativeHint(line, nativeHints),
    }))
    .filter(({ line, nativeHint }) =>
      shouldRetryDevanagariOcrLine({
        text: line.text,
        confidence: line.confidence / 100,
        words: line.words,
        pageText,
        nativeHint,
      })
    )
    .slice(0, OCR_RETRY_MAX_LINES);
  if (!candidates.length) return detectedLines;

  const { OEM, PSM } = await import("tesseract.js");
  const replacements = new Map<OcrLineLike, OcrLineLike>();
  let switchedToSanskrit = false;
  try {
    throwIfAborted(options.signal);
    options.onProgress?.({
      stage: "Refining low-confidence Devanagari",
      progress: 0.86,
    });
    await worker.reinitialize("san", OEM.LSTM_ONLY);
    switchedToSanskrit = true;

    for (const { line, nativeHint } of candidates) {
      throwIfAborted(options.signal);
      const meaningfulWords = line.words.filter((word) =>
        /[\p{L}\p{N}]/u.test(word.text)
      );
      const multipleWords = meaningfulWords.length > 1;
      const lineHeight = Math.max(1, line.bbox.y1 - line.bbox.y0);
      const scale = multipleWords || lineHeight < 28 ? 2 : 1;
      const retryCanvas = lineRetryCanvas(canvas, line.bbox, scale);
      try {
        await worker.setParameters({
          tessedit_pageseg_mode: PSM.SINGLE_LINE,
          preserve_interword_spaces: "1",
        });
        const result = await worker.recognize(
          retryCanvas,
          {},
          { blocks: false, text: true }
        );
        throwIfAborted(options.signal);
        const retryText = result.data.text.replace(/\s+/gu, " ").trim();
        const retryConfidence = result.data.confidence / 100;
        if (shouldUseDevanagariOcrRetry({
          originalText: line.text,
          originalConfidence: line.confidence / 100,
          retryText,
          retryConfidence,
          nativeHint,
        })) {
          replacements.set(line, {
            ...line,
            text: retryText,
            confidence: result.data.confidence,
          });
        }
      } finally {
        retryCanvas.width = 1;
        retryCanvas.height = 1;
      }
    }
  } catch (error) {
    if (options.signal?.aborted) throw error;
    return detectedLines;
  } finally {
    if (switchedToSanskrit && !options.signal?.aborted) {
      await worker.reinitialize("san+eng", OEM.LSTM_ONLY);
    }
  }

  return detectedLines.map((line) => replacements.get(line) ?? line);
}

export async function createLocalOcrWorker(
  options: HierarchyParseOptions = {}
): Promise<OcrWorker> {
  throwIfAborted(options.signal);
  const { createWorker, OEM } = await import("tesseract.js");
  const origin = window.location.origin;
  return createWorker(["san", "eng"], OEM.LSTM_ONLY, {
    workerPath: `${origin}/ocr/worker.min.js`,
    corePath: `${origin}/ocr/core`,
    langPath: `${origin}/ocr/lang`,
    gzip: true,
    logger: (message) => {
      if (message.status === "recognizing text") {
        options.onProgress?.({
          stage: "Recognizing text locally",
          progress: Math.max(0, Math.min(1, message.progress)),
        });
      }
    },
  });
}

export async function recognizeCanvasLines(
  worker: OcrWorker,
  canvas: HTMLCanvasElement,
  page: number,
  options: HierarchyParseOptions = {},
  nativeHints: GeometryTextLine[] = []
): Promise<GeometryTextLine[]> {
  throwIfAborted(options.signal);
  const { PSM } = await import("tesseract.js");
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.AUTO,
    preserve_interword_spaces: "1",
  });
  const result = await worker.recognize(
    canvas,
    {},
    { blocks: true, text: true }
  );
  throwIfAborted(options.signal);
  const detectedLines: OcrLineLike[] = [];
  for (const block of result.data.blocks ?? []) {
    for (const paragraph of block.paragraphs) {
      detectedLines.push(...paragraph.lines);
    }
  }
  const refinedLines = await refineDevanagariOcrLines(
    worker,
    canvas,
    detectedLines,
    nativeHints,
    options
  );
  const lines: GeometryTextLine[] = [];
  for (const line of refinedLines) {
    const text = line.text.trim();
    if (!text) continue;
    lines.push({
      text,
      x: line.bbox.x0,
      y: line.bbox.y0,
      width: Math.max(1, line.bbox.x1 - line.bbox.x0),
      height: Math.max(1, line.bbox.y1 - line.bbox.y0),
      page,
      pageWidth: canvas.width,
      pageHeight: canvas.height,
      confidence: line.confidence / 100,
    });
  }
  return applyConnectorAnchors(canvas, lines);
}

async function imageCanvas(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    if (bitmap.width * bitmap.height > IMAGE_LIMIT_PIXELS) {
      throw new Error("Images must be 40 megapixels or smaller.");
    }
    const scale = Math.min(1, OCR_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas rendering is not available.");
    // White also makes transparent PNG text and connector strokes OCR-safe.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    bitmap.close();
  }
}

export async function parseRasterImage(
  file: File,
  kind: "jpeg" | "png",
  options: HierarchyParseOptions = {}
): Promise<{
  lines: GeometryTextLine[];
  previewPages: HierarchyPreviewPage[];
  warnings: string[];
}> {
  if (file.size > IMAGE_LIMIT_BYTES) {
    throw new Error("JPEG and PNG files must be 25 MB or smaller.");
  }
  throwIfAborted(options.signal);
  options.onProgress?.({ stage: "Preparing image", progress: 0.05 });
  const canvas = await imageCanvas(file);
  let worker: OcrWorker | null = null;
  let preview: HierarchyPreviewPage | null = null;
  const abortHandler = () => {
    void worker?.terminate();
  };
  options.signal?.addEventListener("abort", abortHandler, { once: true });
  try {
    throwIfAborted(options.signal);
    preview = await canvasPreview(canvas, 1);
    options.onProgress?.({ stage: "Loading local OCR", progress: 0.12 });
    worker = await createLocalOcrWorker(options);
    const lines = await recognizeCanvasLines(worker, canvas, 0, options);
    if (!lines.length) {
      URL.revokeObjectURL(preview.url);
      preview = null;
      throw new Error("No readable text was found in this image.");
    }
    options.onProgress?.({ stage: "Recovering hierarchy", progress: 0.92 });
    // Exercise hierarchy recovery here so a completely flat OCR result can be warned.
    const raw = geometryLinesToRawHierarchy(lines);
    const warnings = raw.length > 1
      ? ["Multiple possible roots were found; verify the hierarchy before importing."]
      : [];
    return { lines, previewPages: [preview], warnings };
  } catch (error) {
    if (preview) URL.revokeObjectURL(preview.url);
    throw error;
  } finally {
    options.signal?.removeEventListener("abort", abortHandler);
    await worker?.terminate();
    canvas.width = 1;
    canvas.height = 1;
  }
}
