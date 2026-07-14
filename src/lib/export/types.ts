export type ExportFormat = "png" | "svg";

export type ExportScopeKind = "selection" | "frame" | "board";

export type ExportScope =
  | {
      kind: "selection";
      nodeIds: string[];
      edgeIds?: string[];
    }
  | {
      kind: "frame";
      frameId: string;
    }
  | {
      kind: "board";
    };

export interface ExportRequest {
  scope: ExportScope;
  format: ExportFormat;
  requestedScale: number;
  padding: number;
  includeBackground: boolean;
  filename?: string;
}

export interface ExportBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ExportSafetyLimits {
  maxDimension: number;
  maxTotalPixels: number;
}

export type ExportSafetyConstraint = "width" | "height" | "total-pixels";

export type ExportPlanStatus = "safe" | "adjusted";

/**
 * A deterministic PNG rasterization plan. `requested*` fields describe the
 * user's original choice; the other output fields describe the safe result.
 */
export interface ExportPlan {
  format: "png";
  bounds: ExportBounds;
  limits: ExportSafetyLimits;
  requestedScale: number;
  effectiveScale: number;
  maxSafeScale: number;
  requestedOutputWidth: number;
  requestedOutputHeight: number;
  requestedTotalPixels: number;
  outputWidth: number;
  outputHeight: number;
  totalPixels: number;
  megapixels: number;
  estimatedRgbaBytes: number;
  requestedSafe: boolean;
  adjusted: boolean;
  status: ExportPlanStatus;
  limitingConstraints: ExportSafetyConstraint[];
}

export type ExportStage =
  | "resolve-scope"
  | "resolve-bounds"
  | "plan-output"
  | "prepare-assets"
  | "clone-content"
  | "serialize-content"
  | "decode-image"
  | "create-canvas"
  | "draw-canvas"
  | "encode-png"
  | "create-svg-blob"
  | "initiate-download"
  | "unknown";

export type ExportErrorCode =
  | "EMPTY_SCOPE"
  | "INVALID_BOUNDS"
  | "INVALID_SCALE"
  | "FONT_LOAD_FAILED"
  | "FONT_LOAD_TIMEOUT"
  | "ASSET_EMBED_FAILED"
  | "REMOTE_IMAGE_CORS"
  | "REMOTE_FONT_CORS"
  | "REMOTE_ASSET_CORS"
  | "UNSUPPORTED_ELEMENT"
  | "SERIALIZE_FAILED"
  | "SVG_DECODE_FAILED"
  | "CANVAS_TOO_LARGE"
  | "CANVAS_MEMORY_EXHAUSTED"
  | "CANVAS_ALLOCATION_FAILED"
  | "CANVAS_CONTEXT_FAILED"
  | "CANVAS_DRAW_FAILED"
  | "CANVAS_TAINTED"
  | "PNG_BLOB_CREATION_FAILED"
  | "SVG_BLOB_CREATION_FAILED"
  | "DOWNLOAD_FAILED"
  | "DOWNLOAD_BLOCKED"
  | "ABORTED"
  | "UNKNOWN";

export type ExportRenderer =
  | "native-svg"
  | "dom-foreign-object"
  | "canvas-2d";

export interface ExportErrorSnapshot {
  name: string;
  message: string;
  stack?: string;
}

export type ExportAssetWarningKind =
  | "stylesheet"
  | "font-face"
  | "font-resource"
  | "remote-asset";

export type ExportAssetFallbackAction =
  | "preserved-reference"
  | "substituted-placeholder"
  | "font-fallback";

/** A non-fatal resource issue retained in logs and export results. */
export interface ExportAssetWarning {
  kind: ExportAssetWarningKind;
  message: string;
  url?: string;
  element?: string;
  action?: ExportAssetFallbackAction;
}

/** Serializable diagnostics suitable for structured console logging. */
export interface ExportDiagnostics {
  exportId?: string;
  stage: ExportStage;
  scopeKind?: ExportScopeKind;
  format?: ExportFormat;
  bounds?: ExportBounds;
  requestedScale?: number;
  effectiveScale?: number;
  maxSafeScale?: number;
  outputWidth?: number;
  outputHeight?: number;
  totalPixels?: number;
  megapixels?: number;
  estimatedRgbaBytes?: number;
  devicePixelRatio?: number;
  renderer?: ExportRenderer;
  includedNodeCount?: number;
  includedEdgeCount?: number;
  sourceElementCount?: number;
  removedEditorElementCount?: number;
  convertedCanvasCount?: number;
  embeddedImageCount?: number;
  embeddedStyleAssetCount?: number;
  embeddedFontCount?: number;
  assetWarningCount?: number;
  proxiedRemoteAssetCount?: number;
  preservedRemoteAssetCount?: number;
  substitutedRemoteAssetCount?: number;
  assetWarnings?: ExportAssetWarning[];
  canvasCreated?: boolean;
  canvasContextCreated?: boolean;
  blobCreated?: boolean;
  downloadInitiated?: boolean;
  offendingElement?: string;
  offendingUrl?: string;
  offendingAssetKind?: "image" | "font" | "style";
  stageDurationsMs?: Partial<Record<ExportStage, number>>;
  error?: ExportErrorSnapshot;
}
