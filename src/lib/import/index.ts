import {
  compactRawHierarchy,
  ensureSingleDraftRoot,
  geometryLinesToRawHierarchy,
} from "./draft";
import { parsePdfFile } from "./pdf";
import { parseRasterImage } from "./raster";
import { filenameWithoutExtension, parseTextFile } from "./text";
import type {
  HierarchyDraft,
  HierarchyImportKind,
  HierarchyParseOptions,
} from "./types";

export * from "./types";
export * from "./script";
export * from "./draft";
export * from "./layouts";

const ACCEPTED_EXTENSIONS: Record<string, HierarchyImportKind> = {
  ".txt": "text",
  ".html": "html",
  ".htm": "html",
  ".pdf": "pdf",
  ".jpg": "jpeg",
  ".jpeg": "jpeg",
  ".png": "png",
};

export function hierarchyImportKindForFile(file: File): HierarchyImportKind {
  const lower = file.name.toLocaleLowerCase();
  const extension = Object.keys(ACCEPTED_EXTENSIONS).find((candidate) =>
    lower.endsWith(candidate)
  );
  if (extension) return ACCEPTED_EXTENSIONS[extension];
  if (file.type === "application/pdf") return "pdf";
  if (file.type === "text/plain") return "text";
  if (file.type === "text/html") return "html";
  if (file.type === "image/jpeg") return "jpeg";
  if (file.type === "image/png") return "png";
  throw new Error("Choose a PDF, TXT, HTML, JPEG, or PNG file.");
}

export async function parseHierarchyFile(
  file: File,
  options: HierarchyParseOptions = {}
): Promise<HierarchyDraft> {
  const kind = hierarchyImportKindForFile(file);
  if (kind === "text" || kind === "html") {
    const draft = await parseTextFile(file, kind, options);
    return ensureSingleDraftRoot(draft, filenameWithoutExtension(file.name));
  }
  if (kind === "pdf") {
    const draft = await parsePdfFile(file, options);
    return ensureSingleDraftRoot(draft, filenameWithoutExtension(file.name));
  }
  const raster = await parseRasterImage(file, kind, options);
  const roots = compactRawHierarchy(geometryLinesToRawHierarchy(raster.lines));
  if (!roots.length) throw new Error("No hierarchy could be recovered from this image.");
  return ensureSingleDraftRoot({
    title: roots[0]?.label ?? filenameWithoutExtension(file.name),
    sourceName: file.name,
    sourceKind: kind,
    roots,
    warnings: raster.warnings,
    previewPages: raster.previewPages,
  }, filenameWithoutExtension(file.name));
}
