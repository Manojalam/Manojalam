import { classifyExportError, ExportError, toExportError } from "./errors";
import { createPngExportPlan } from "./limits";
import { collectPdfLinkAnnotations, createBoardPdf } from "./pdf";
import {
  prepareReactFlowDomSvg,
  type ExportBackgroundTexture,
} from "./dom-renderer";
import { createSvgRasterDataUrl } from "./svg-raster-source";
import type { ExportAssetWarning } from "./resources";
import type {
  ExportBounds,
  ExportDiagnostics,
  ExportFormat,
  ExportPlan,
  ExportScopeKind,
  ExportStage,
} from "./types";

const SVG_MIME = "image/svg+xml;charset=utf-8";
const PNG_MIME = "image/png";
const DOWNLOAD_URL_LIFETIME_MS = 1_000;

export interface ExportBoardVisualOptions {
  viewport: HTMLElement;
  bounds: ExportBounds;
  nodeIds: string[];
  edgeIds: string[];
  scopeKind: ExportScopeKind;
  format: ExportFormat;
  requestedScale: number;
  filename: string;
  title?: string;
  background?: string | null;
  /** CSS texture layered over the exported background. */
  backgroundTexture?: ExportBackgroundTexture | null;
  /** Preserve translucent object colors against this matte even when the outer export is transparent. */
  appearanceBackground?: string | null;
  viewportTransform?: { x: number; y: number; zoom: number };
  signal?: AbortSignal;
}

export interface ExportBoardVisualResult {
  exportId: string;
  format: ExportFormat;
  width: number;
  height: number;
  effectiveScale: number;
  plan?: ExportPlan;
  assetWarnings: ExportAssetWarning[];
  downloadInitiated: true;
}

type StageStatus = "completed" | "failed";

type RunStageOptions<T> = {
  signal?: AbortSignal;
  checkAbortAfter?: boolean;
  completedDiagnostics?: Partial<ExportDiagnostics> | ((result: T) => Partial<ExportDiagnostics>);
};

function createExportId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `export-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function rootCause(error: unknown): unknown {
  const visited = new Set<unknown>();
  let current = error;
  while (current instanceof ExportError && current.cause !== undefined && !visited.has(current)) {
    visited.add(current);
    current = current.cause;
  }
  return current;
}

function errorSnapshot(error: unknown) {
  if (error instanceof ExportError && error.originalError) return error.originalError;
  const original = rootCause(error);
  if (!(original instanceof Error)) return { name: "Error", message: String(original) };
  return {
    name: original.name || "Error",
    message: original.message,
    ...(original.stack ? { stack: original.stack } : {}),
  };
}

function logExportStage(
  status: StageStatus,
  diagnostics: ExportDiagnostics,
  error?: unknown
): void {
  const { error: diagnosticError, ...details } = diagnostics;
  const originalError = diagnosticError ?? (error !== undefined ? errorSnapshot(error) : undefined);
  const payload = {
    event: "manojalam.export",
    status,
    timestamp: new Date().toISOString(),
    ...details,
    ...(originalError ? { error: originalError } : {}),
  };
  if (status === "failed") {
    // The second argument remains serializable for diagnostics collection; the
    // final argument preserves the native exception and its browser stack.
    console.error("[Manojalam export]", payload, rootCause(error));
  } else if ((diagnostics.assetWarningCount ?? 0) > 0) {
    console.warn("[Manojalam export]", payload);
  } else {
    console.info("[Manojalam export]", payload);
  }
}

function abortReason(signal: AbortSignal): unknown {
  if (signal.reason !== undefined) return signal.reason;
  const error = new Error("The export was canceled.");
  error.name = "AbortError";
  return error;
}

function abortError(
  signal: AbortSignal,
  stage: ExportStage,
  diagnostics?: Partial<ExportDiagnostics>
): ExportError {
  return new ExportError({
    stage,
    code: "ABORTED",
    cause: abortReason(signal),
    diagnostics,
  });
}

function abortIfRequested(
  signal: AbortSignal | undefined,
  stage: ExportStage,
  diagnostics?: Partial<ExportDiagnostics>
): void {
  if (signal?.aborted) throw abortError(signal, stage, diagnostics);
}

async function runStage<T>(
  stage: ExportStage,
  diagnostics: Omit<ExportDiagnostics, "stage">,
  work: () => Promise<T> | T,
  options: RunStageOptions<T> = {}
): Promise<T> {
  const startedAt = now();
  try {
    abortIfRequested(options.signal, stage, diagnostics);
    const result = await work();
    if (options.checkAbortAfter !== false) {
      abortIfRequested(options.signal, stage, diagnostics);
    }
    const completed = typeof options.completedDiagnostics === "function"
      ? options.completedDiagnostics(result)
      : options.completedDiagnostics;
    logExportStage("completed", {
      ...diagnostics,
      ...completed,
      stage,
      stageDurationsMs: { [stage]: now() - startedAt },
    });
    return result;
  } catch (cause) {
    const error = toExportError(cause, { stage, diagnostics });
    const duration = error.stage === stage
      ? { stageDurationsMs: { [stage]: now() - startedAt } }
      : {};
    logExportStage("failed", {
      ...diagnostics,
      ...error.diagnostics,
      ...duration,
      stage: error.stage,
    }, error);
    throw error;
  }
}

function sanitizedFilename(value: string, format: ExportFormat): string {
  const withoutExtension = value.trim().replace(/\.(?:png|svg|pdf)$/i, "");
  const base = withoutExtension
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.\s-]+|[.\s-]+$/g, "") || "board-export";
  return `${base}.${format}`;
}

function loadSvgImage(
  source: string,
  signal?: AbortSignal
): Promise<HTMLImageElement> {
  abortIfRequested(signal, "decode-image", { renderer: "dom-foreign-object" });
  let dataUrl: string;
  try {
    dataUrl = createSvgRasterDataUrl(source);
  } catch (cause) {
    throw new ExportError({
      stage: "decode-image",
      code: "SVG_DECODE_FAILED",
      cause,
      message: "The serialized board SVG could not be prepared for decoding.",
      diagnostics: { renderer: "dom-foreign-object" },
    });
  }

  return new Promise((resolve, reject) => {
    const image = new Image();
    let settled = false;
    const cleanup = () => signal?.removeEventListener("abort", onAbort);
    const rejectOnce = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onAbort = () => {
      image.onload = null;
      image.onerror = null;
      image.src = "";
      rejectOnce(abortError(signal!, "decode-image", {
        renderer: "dom-foreign-object",
      }));
    };

    image.decoding = "async";
    image.onload = () => {
      if (settled) return;
      if (signal?.aborted) {
        onAbort();
        return;
      }
      settled = true;
      cleanup();
      resolve(image);
    };
    image.onerror = () => rejectOnce(new ExportError({
      stage: "decode-image",
      code: "SVG_DECODE_FAILED",
      cause: new Error("The browser image decoder rejected the serialized board SVG."),
      message: "The serialized board SVG could not be decoded as an image.",
      diagnostics: { renderer: "dom-foreign-object" },
    }));

    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
      return;
    }
    image.src = dataUrl;
  });
}

function encodeCanvasPng(canvas: HTMLCanvasElement, signal?: AbortSignal): Promise<Blob> {
  abortIfRequested(signal, "encode-png", { renderer: "canvas-2d" });
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => signal?.removeEventListener("abort", onAbort);
    const resolveOnce = (blob: Blob) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(blob);
    };
    const rejectOnce = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onAbort = () => rejectOnce(abortError(signal!, "encode-png", {
      blobCreated: false,
      renderer: "canvas-2d",
    }));

    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
      return;
    }
    try {
      canvas.toBlob((blob) => {
        if (signal?.aborted) {
          onAbort();
          return;
        }
        if (blob) {
          resolveOnce(blob);
          return;
        }
        rejectOnce(new ExportError({
          stage: "encode-png",
          code: "PNG_BLOB_CREATION_FAILED",
          message: "Canvas encoding returned an empty PNG Blob.",
          diagnostics: { blobCreated: false, renderer: "canvas-2d" },
        }));
      }, PNG_MIME);
    } catch (cause) {
      rejectOnce(new ExportError({
        stage: "encode-png",
        cause,
        diagnostics: { blobCreated: false, renderer: "canvas-2d" },
      }));
    }
  });
}

export function initiateBlobDownload(
  blob: Blob,
  filename: string,
  signal?: AbortSignal
): void {
  abortIfRequested(signal, "initiate-download", {
    blobCreated: true,
    downloadInitiated: false,
  });
  let url: string | undefined;
  let anchor: HTMLAnchorElement | undefined;
  try {
    url = URL.createObjectURL(blob);
    abortIfRequested(signal, "initiate-download", {
      blobCreated: true,
      downloadInitiated: false,
    });
    anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    abortIfRequested(signal, "initiate-download", {
      blobCreated: true,
      downloadInitiated: false,
    });
    anchor.click();
  } catch (cause) {
    if (cause instanceof ExportError) throw cause;
    throw new ExportError({
      stage: "initiate-download",
      cause,
      diagnostics: { blobCreated: true, downloadInitiated: false },
    });
  } finally {
    anchor?.remove();
    if (url) {
      const downloadUrl = url;
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), DOWNLOAD_URL_LIFETIME_MS);
    }
  }
}

function validatePipelineBounds(bounds: ExportBounds): void {
  if (
    !Number.isFinite(bounds.x)
    || !Number.isFinite(bounds.y)
    || !Number.isFinite(bounds.width)
    || !Number.isFinite(bounds.height)
    || bounds.width <= 0
    || bounds.height <= 0
  ) {
    throw new ExportError({
      stage: "resolve-bounds",
      code: "INVALID_BOUNDS",
      message: "The selected content has invalid export bounds.",
      diagnostics: { bounds },
    });
  }
}

export async function exportBoardVisual(
  options: ExportBoardVisualOptions
): Promise<ExportBoardVisualResult> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new ExportError({
      stage: "resolve-scope",
      code: "UNSUPPORTED_ELEMENT",
      message: "Board image export is only available in the browser.",
    });
  }

  const exportId = createExportId();
  const baseDiagnostics: Omit<ExportDiagnostics, "stage"> = {
    exportId,
    scopeKind: options.scopeKind,
    format: options.format,
    bounds: options.bounds,
    requestedScale: options.requestedScale,
    renderer: "dom-foreign-object",
    devicePixelRatio: window.devicePixelRatio || 1,
  };

  await runStage("resolve-scope", baseDiagnostics, () => {
    if (options.nodeIds.length === 0 && options.edgeIds.length === 0) {
      throw new ExportError({
        stage: "resolve-scope",
        code: "EMPTY_SCOPE",
        message: "The requested board export contains no visible nodes or edges.",
      });
    }
  }, { signal: options.signal });
  await runStage("resolve-bounds", baseDiagnostics, () => {
    validatePipelineBounds(options.bounds);
  }, { signal: options.signal });

  let plan: ExportPlan | undefined;
  if (options.format !== "svg") {
    plan = await runStage("plan-output", baseDiagnostics, () =>
      createPngExportPlan(options.bounds, options.requestedScale), {
      signal: options.signal,
      completedDiagnostics: (result) => ({
        effectiveScale: result.effectiveScale,
        maxSafeScale: result.maxSafeScale,
        outputWidth: result.outputWidth,
        outputHeight: result.outputHeight,
        totalPixels: result.totalPixels,
        megapixels: result.megapixels,
        estimatedRgbaBytes: result.estimatedRgbaBytes,
      }),
    });
    Object.assign(baseDiagnostics, {
      effectiveScale: plan.effectiveScale,
      maxSafeScale: plan.maxSafeScale,
      outputWidth: plan.outputWidth,
      outputHeight: plan.outputHeight,
      totalPixels: plan.totalPixels,
      megapixels: plan.megapixels,
      estimatedRgbaBytes: plan.estimatedRgbaBytes,
    });
  }

  const prepared = await runStage("serialize-content", baseDiagnostics, () =>
    prepareReactFlowDomSvg({
      viewport: options.viewport,
      bounds: options.bounds,
      nodeIds: options.nodeIds,
      edgeIds: options.edgeIds,
      padding: 0,
      background: options.background,
      backgroundTexture: options.backgroundTexture,
      appearanceBackground: options.appearanceBackground,
      title: options.title,
      signal: options.signal,
      // A cross-origin font must never make an otherwise self-contained chart
      // impossible to export. The asset stage embeds it directly or via the
      // safe proxy, then applies a deterministic browser-safe fallback.
      strictFontEmbedding: false,
      preserveRemoteReferences: options.format === "svg",
      substituteInaccessibleRemoteAssets: options.format !== "svg",
      onStageComplete: (stage, diagnostics) => {
        logExportStage("completed", {
          ...baseDiagnostics,
          ...diagnostics,
          stage,
        });
      },
    }), {
    signal: options.signal,
    completedDiagnostics: (result) => ({ renderer: result.renderer }),
  });

  let blob: Blob;
  let width = prepared.width;
  let height = prepared.height;
  let effectiveScale = 1;

  if (options.format === "svg") {
    blob = await runStage("create-svg-blob", baseDiagnostics, () => {
      abortIfRequested(options.signal, "create-svg-blob", baseDiagnostics);
      try {
        return new Blob([prepared.source], { type: SVG_MIME });
      } catch (cause) {
        throw new ExportError({ stage: "create-svg-blob", cause });
      }
    }, {
      signal: options.signal,
      completedDiagnostics: { blobCreated: true },
    });
  } else {
    if (!plan) {
      throw new ExportError({
        stage: "plan-output",
        code: "CANVAS_TOO_LARGE",
        message: "The export did not produce a safe raster plan.",
      });
    }
    effectiveScale = plan.effectiveScale;
    width = plan.outputWidth;
    height = plan.outputHeight;
    const decodedImage = await runStage("decode-image", baseDiagnostics, () =>
      loadSvgImage(prepared.source, options.signal), {
      signal: options.signal,
    });
    const surface = await runStage("create-canvas", baseDiagnostics, () => {
      let canvas: HTMLCanvasElement;
      try {
        canvas = document.createElement("canvas");
        canvas.width = plan.outputWidth;
        canvas.height = plan.outputHeight;
      } catch (cause) {
        const classified = classifyExportError("create-canvas", cause);
        throw new ExportError({
          stage: "create-canvas",
          code: classified === "CANVAS_MEMORY_EXHAUSTED" || classified === "CANVAS_TOO_LARGE"
            ? classified
            : "CANVAS_ALLOCATION_FAILED",
          cause,
          diagnostics: { canvasCreated: false, renderer: "canvas-2d" },
        });
      }
      if (canvas.width !== plan.outputWidth || canvas.height !== plan.outputHeight) {
        throw new ExportError({
          stage: "create-canvas",
          code: "CANVAS_ALLOCATION_FAILED",
          message: "The browser did not allocate the requested canvas dimensions.",
          diagnostics: { canvasCreated: false, renderer: "canvas-2d" },
        });
      }

      let context: CanvasRenderingContext2D | null;
      try {
        context = canvas.getContext("2d");
      } catch (cause) {
        throw new ExportError({
          stage: "create-canvas",
          cause,
          diagnostics: { canvasCreated: true, canvasContextCreated: false, renderer: "canvas-2d" },
        });
      }
      if (!context) {
        throw new ExportError({
          stage: "create-canvas",
          code: "CANVAS_CONTEXT_FAILED",
          message: "Canvas 2D context creation returned null.",
          diagnostics: { canvasCreated: true, canvasContextCreated: false, renderer: "canvas-2d" },
        });
      }
      return { canvas, context };
    }, {
      signal: options.signal,
      completedDiagnostics: {
        renderer: "canvas-2d",
        canvasCreated: true,
        canvasContextCreated: true,
      },
    });

    try {
      await runStage("draw-canvas", {
        ...baseDiagnostics,
        renderer: "canvas-2d",
        canvasCreated: true,
        canvasContextCreated: true,
      }, () => {
        surface.context.drawImage(decodedImage, 0, 0, plan.outputWidth, plan.outputHeight);
      }, { signal: options.signal });
      const pngBlob = await runStage("encode-png", {
        ...baseDiagnostics,
        renderer: "canvas-2d",
        canvasCreated: true,
        canvasContextCreated: true,
      }, () => encodeCanvasPng(surface.canvas, options.signal), {
        signal: options.signal,
        completedDiagnostics: { blobCreated: true },
      });
      if (options.format === "pdf") {
        const links = options.viewportTransform
          ? collectPdfLinkAnnotations({
              root: options.viewport,
              nodeIds: options.nodeIds,
              edgeIds: options.edgeIds,
              exportBounds: options.bounds,
              viewport: options.viewportTransform,
            })
          : [];
        const pdf = await runStage("create-pdf-blob", {
          ...baseDiagnostics,
          renderer: "pdf-raster",
        }, () => createBoardPdf({
          png: pngBlob,
          sourceWidth: prepared.width,
          sourceHeight: prepared.height,
          exportBounds: options.bounds,
          links,
          title: options.title,
        }), {
          signal: options.signal,
          completedDiagnostics: (result) => ({
            renderer: "pdf-raster",
            blobCreated: true,
            linkAnnotationCount: result.linkAnnotationCount,
            pdfPageWidth: result.pageWidth,
            pdfPageHeight: result.pageHeight,
          }),
        });
        blob = pdf.blob;
        width = Math.round(pdf.pageWidth);
        height = Math.round(pdf.pageHeight);
      } else {
        blob = pngBlob;
      }
    } finally {
      decodedImage.onload = null;
      decodedImage.onerror = null;
      decodedImage.removeAttribute("src");
      surface.canvas.width = 1;
      surface.canvas.height = 1;
    }
  }

  const filename = sanitizedFilename(options.filename, options.format);
  await runStage("initiate-download", {
    ...baseDiagnostics,
    blobCreated: true,
  }, () => initiateBlobDownload(blob, filename, options.signal), {
    signal: options.signal,
    // Once anchor.click() returns, aborting cannot retract the initiated file.
    checkAbortAfter: false,
    completedDiagnostics: { downloadInitiated: true },
  });

  return {
    exportId,
    format: options.format,
    width,
    height,
    effectiveScale,
    ...(plan ? { plan } : {}),
    assetWarnings: prepared.assets.warnings,
    downloadInitiated: true,
  };
}
