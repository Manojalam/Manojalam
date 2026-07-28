import type { ScriptMode } from "../types";

export type HierarchyImportKind =
  | "text"
  | "html"
  | "pdf"
  | "jpeg"
  | "png";

export interface ImportBoundingBox {
  /** Normalized coordinates in the rendered page/image, from 0 to 1. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export type HierarchySourceReference =
  | {
      kind: "text" | "html";
      lineStart: number;
      lineEnd?: number;
    }
  | {
      kind: "pdf" | "image";
      page: number;
      bbox?: ImportBoundingBox;
    };

export interface HierarchyDraftNode {
  id: string;
  label: string;
  notes: string;
  children: HierarchyDraftNode[];
  confidence: number;
  scriptMode: ScriptMode;
  source?: HierarchySourceReference;
  warnings?: string[];
}

export interface HierarchyPreviewPage {
  page: number;
  url: string;
  width: number;
  height: number;
}

export interface HierarchyDraft {
  title: string;
  sourceName: string;
  sourceKind: HierarchyImportKind;
  roots: HierarchyDraftNode[];
  warnings: string[];
  previewText?: string;
  previewPages?: HierarchyPreviewPage[];
}

export interface ImportProgress {
  stage: string;
  progress: number;
  page?: number;
  pageCount?: number;
}

export interface HierarchyParseOptions {
  signal?: AbortSignal;
  onProgress?: (progress: ImportProgress) => void;
}

export interface GeometryTextLine {
  text: string;
  x: number;
  /** Optional connector-derived indentation anchor. */
  indentX?: number;
  y: number;
  width: number;
  height: number;
  page: number;
  pageWidth: number;
  pageHeight: number;
  confidence: number;
}
