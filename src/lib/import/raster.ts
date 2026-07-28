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

type OcrWorker = Awaited<
  ReturnType<typeof import("tesseract.js").createWorker>
>;

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Import cancelled", "AbortError");
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
          stage: "Recognizing Sanskrit and English",
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
  options: HierarchyParseOptions = {}
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
  const lines: GeometryTextLine[] = [];
  for (const block of result.data.blocks ?? []) {
    for (const paragraph of block.paragraphs) {
      for (const line of paragraph.lines) {
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
    }
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
