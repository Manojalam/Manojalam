import type {
  ExportDiagnostics,
  ExportErrorCode,
  ExportErrorSnapshot,
  ExportStage,
} from "./types";

const USER_MESSAGES: Record<ExportErrorCode, string> = {
  EMPTY_SCOPE: "There is no visible content in the selected export area.",
  INVALID_BOUNDS: "The selected content has invalid export bounds.",
  INVALID_SCALE: "Choose a valid PNG export scale greater than zero.",
  FONT_LOAD_FAILED: "One or more fonts could not be prepared for export.",
  FONT_LOAD_TIMEOUT: "The chart fonts did not finish loading in time.",
  ASSET_EMBED_FAILED: "An image or font could not be embedded in the export.",
  REMOTE_IMAGE_CORS: "A remote image in this chart prevents PNG export. Remove it, embed it, or export as SVG.",
  REMOTE_FONT_CORS: "A remote font could not be embedded. PNG export will use a browser-safe fallback font.",
  REMOTE_ASSET_CORS: "A remote asset in this chart could not be prepared for PNG export.",
  UNSUPPORTED_ELEMENT: "The chart renderer could not serialize one of the elements.",
  SERIALIZE_FAILED: "The chart renderer could not serialize one of the elements.",
  SVG_DECODE_FAILED: "The serialized chart could not be rendered as an image.",
  CANVAS_TOO_LARGE: "The chart is too large to render at this resolution.",
  CANVAS_MEMORY_EXHAUSTED: "PNG rendering ran out of browser memory.",
  CANVAS_ALLOCATION_FAILED: "The browser could not allocate a canvas for this PNG.",
  CANVAS_CONTEXT_FAILED: "The browser could not initialize PNG rendering.",
  CANVAS_DRAW_FAILED: "The chart could not be drawn into the PNG renderer.",
  CANVAS_TAINTED: "The browser blocked PNG encoding after rendering this chart. Export as SVG or remove unsupported embedded content.",
  PNG_BLOB_CREATION_FAILED: "PNG encoding failed.",
  SVG_BLOB_CREATION_FAILED: "SVG encoding failed.",
  DOWNLOAD_FAILED: "The file was created, but the download could not be started.",
  DOWNLOAD_BLOCKED: "The file was created, but the browser blocked the download.",
  ABORTED: "The export was canceled.",
  UNKNOWN: "The export could not be completed.",
};

export interface ExportErrorOptions {
  stage: ExportStage;
  code?: ExportErrorCode;
  cause?: unknown;
  message?: string;
  userMessage?: string;
  diagnostics?: Partial<ExportDiagnostics>;
}

function snapshotError(error: unknown): ExportErrorSnapshot | undefined {
  if (error instanceof ExportError && error.originalError) {
    return error.originalError;
  }
  if (error instanceof Error) {
    return {
      name: error.name || "Error",
      message: error.message,
      ...(error.stack ? { stack: error.stack } : {}),
    };
  }
  if (typeof error === "string") return { name: "Error", message: error };
  if (error === null || error === undefined) return undefined;
  try {
    return { name: "Error", message: JSON.stringify(error) ?? String(error) };
  } catch {
    return { name: "Error", message: String(error) };
  }
}

function normalizedErrorText(error: unknown): { name: string; message: string; combined: string } {
  const snapshot = snapshotError(error);
  const name = snapshot?.name.toLowerCase() ?? "";
  const message = snapshot?.message.toLowerCase() ?? "";
  return { name, message, combined: `${name} ${message}`.trim() };
}

export function exportErrorUserMessage(code: ExportErrorCode): string {
  return USER_MESSAGES[code];
}

export function classifyExportError(stage: ExportStage, error: unknown): ExportErrorCode {
  if (error instanceof ExportError) return error.code;

  const { name, combined } = normalizedErrorText(error);
  if (name === "aborterror" || combined.includes("aborted") || combined.includes("canceled")) {
    return "ABORTED";
  }

  const securityError = name === "securityerror";
  const corsRelated = [
    "cross-origin",
    "cross origin",
    "cors",
    "tainted",
    "insecure",
  ].some((fragment) => combined.includes(fragment));
  if (securityError || corsRelated) {
    if (stage === "initiate-download") return "DOWNLOAD_BLOCKED";
    if (stage === "prepare-assets") {
      if (combined.includes("font")) return "REMOTE_FONT_CORS";
      if (combined.includes("image")) return "REMOTE_IMAGE_CORS";
      return "REMOTE_ASSET_CORS";
    }
    return "CANVAS_TAINTED";
  }

  const memoryRelated = [
    "out of memory",
    "not enough memory",
    "memory exhausted",
    "allocation failed",
    "failed to allocate",
  ].some((fragment) => combined.includes(fragment));
  if (memoryRelated) return "CANVAS_MEMORY_EXHAUSTED";

  const sizeRelated = [
    "too large",
    "maximum canvas",
    "max canvas",
    "exceeds the configured canvas",
    "invalid canvas size",
  ].some((fragment) => combined.includes(fragment));
  if (sizeRelated) return "CANVAS_TOO_LARGE";

  switch (stage) {
    case "resolve-scope":
      return "EMPTY_SCOPE";
    case "resolve-bounds":
      return "INVALID_BOUNDS";
    case "plan-output":
      return combined.includes("scale") ? "INVALID_SCALE" : "CANVAS_TOO_LARGE";
    case "prepare-assets":
      return combined.includes("font") ? "FONT_LOAD_FAILED" : "ASSET_EMBED_FAILED";
    case "clone-content":
      return "UNSUPPORTED_ELEMENT";
    case "serialize-content":
      return "SERIALIZE_FAILED";
    case "decode-image":
      return "SVG_DECODE_FAILED";
    case "create-canvas":
      return name === "rangeerror" ? "CANVAS_ALLOCATION_FAILED" : "CANVAS_CONTEXT_FAILED";
    case "draw-canvas":
      return "CANVAS_DRAW_FAILED";
    case "encode-png":
      return "PNG_BLOB_CREATION_FAILED";
    case "create-svg-blob":
      return "SVG_BLOB_CREATION_FAILED";
    case "initiate-download":
      return "DOWNLOAD_FAILED";
    default:
      return "UNKNOWN";
  }
}

export class ExportError extends Error {
  readonly code: ExportErrorCode;
  readonly stage: ExportStage;
  readonly userMessage: string;
  readonly diagnostics: ExportDiagnostics;
  readonly originalError?: ExportErrorSnapshot;
  readonly cause?: unknown;

  constructor(options: ExportErrorOptions) {
    const code = options.code ?? classifyExportError(options.stage, options.cause);
    const originalError = snapshotError(options.cause);
    const userMessage = options.userMessage ?? exportErrorUserMessage(code);
    const technicalMessage = options.message ?? originalError?.message ?? userMessage;
    super(technicalMessage);

    this.name = "ExportError";
    this.code = code;
    this.stage = options.stage;
    this.userMessage = userMessage;
    this.cause = options.cause;
    this.originalError = originalError;
    this.diagnostics = {
      ...options.diagnostics,
      stage: options.stage,
      ...(originalError ? { error: originalError } : {}),
    };
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      ...(this.stack ? { stack: this.stack } : {}),
      code: this.code,
      stage: this.stage,
      userMessage: this.userMessage,
      diagnostics: this.diagnostics,
      ...(this.originalError ? { cause: this.originalError } : {}),
    };
  }
}

export function toExportError(error: unknown, options: Omit<ExportErrorOptions, "cause">): ExportError {
  if (error instanceof ExportError) {
    // Keep the original ExportError instance so its creation stack and root
    // cause survive orchestration wrappers. Only enrich its diagnostics with
    // context (export id, scope, dimensions) learned by the outer pipeline.
    Object.assign(error.diagnostics, {
      ...options.diagnostics,
      ...error.diagnostics,
      stage: error.stage,
      ...(error.originalError ? { error: error.originalError } : {}),
    });
    return error;
  }
  return new ExportError({ ...options, cause: error });
}
