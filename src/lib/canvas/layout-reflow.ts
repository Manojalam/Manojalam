import type { ContentResizeReason } from "./node-sizing";

const AUTOFIT_REFLOW_FIELDS = new Set([
  "text", "richText", "label", "title", "topic", "devanagari", "iast", "translation",
  "rule", "fontSize", "fontFamily", "fontStyle", "fontWeight", "textAlign",
  "shapeType", "petalCount", "borderWidth", "cornerRadiusPercent", "borderRadius", "borderStyle",
]);

const MATRIX_TEXT_CONTENT_FIELDS = new Set([
  "text", "richText", "label", "title", "topic", "devanagari", "iast", "translation", "rule",
]);

const MATRIX_TYPOGRAPHY_FIELDS = new Set([
  "fontSize", "fontFamily", "fontStyle", "fontWeight", "textAlign", "layoutAutoTypography",
]);

const MATRIX_REFLOW_FIELDS = new Set([
  ...AUTOFIT_REFLOW_FIELDS,
  "fillColor", "fillOpacity", "color", "layoutAutoFill",
  "collapsed", "parentId", "childOrder", "layoutFoldCount", "layoutFoldBreakAfter", "layoutWrapAfter", "matrixFoldRootMode", "matrixDensity", "matrixCompositionMode", "matrixOuterBorderVisible", "matrixGridVisible", "matrixOrientation", "matrixChildFlow", "matrixPackCompactGroups", "matrixIncompleteRowMode", "matrixFillCellLabels",
  "matrixSiblingGap", "matrixWidthOverride", "matrixHeightOverride", "matrixTableWidthOverride", "matrixTableHeightOverride",
]);

const LIST_REFLOW_FIELDS = new Set([
  ...AUTOFIT_REFLOW_FIELDS,
  "collapsed", "parentId", "childOrder", "layoutFoldCount", "layoutFoldBreakAfter", "layoutWrapAfter", "listDensity",
]);

const ORIENTED_MATRIX_COMPOSITION_FIELDS = new Set([
  "layoutFoldCount",
  "layoutFoldBreakAfter",
  "layoutWrapAfter",
  "matrixOrientation",
  "matrixChildFlow",
  "matrixPackCompactGroups",
  "matrixSiblingGap",
  "matrixWidthOverride",
  "matrixHeightOverride",
]);

function stripRichText(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .split(/\r?\n/u)
    .map((line) => line.replace(/\s+/gu, " ").trim())
    .join("\n")
    .replace(/\n{2,}/gu, "\n")
    .trim();
}

function matrixTextContent(data: Record<string, unknown>): string {
  if (typeof data.richText === "string" && data.richText.trim()) {
    return stripRichText(data.richText);
  }
  return ["text", "title", "topic", "label", "devanagari", "iast", "translation", "rule"]
    .map((field) => data[field])
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.replace(/\s+/gu, " ").trim())
    .join("\n");
}

/**
 * Matrix owns its cell rectangles. Typography-only changes are fitted inside
 * those existing rectangles; asking the layout engine to size the rows from
 * the authored font at the same time makes a font edit unexpectedly resize the
 * table. Text edits still reflow whenever their visible content changes.
 */
export function patchNeedsMatrixReflow(
  patch: Record<string, unknown>,
  currentData?: Record<string, unknown>
): boolean {
  const reflowKeys = Object.keys(patch).filter((key) => MATRIX_REFLOW_FIELDS.has(key));
  if (!reflowKeys.length) return false;

  const hasStructuralOrShapeChange = reflowKeys.some((key) =>
    !MATRIX_TEXT_CONTENT_FIELDS.has(key) && !MATRIX_TYPOGRAPHY_FIELDS.has(key)
  );
  if (hasStructuralOrShapeChange) return true;

  const hasTextPatch = reflowKeys.some((key) => MATRIX_TEXT_CONTENT_FIELDS.has(key));
  if (!hasTextPatch) return false;
  if (!currentData) return true;

  return matrixTextContent(currentData) !== matrixTextContent({ ...currentData, ...patch });
}

/** Passive and formatting remeasurements refresh Matrix metrics, not geometry. */
export function matrixMeasurementNeedsReflow(reason: ContentResizeReason): boolean {
  return reason !== "format" && reason !== "layout";
}

/**
 * These edits opt a Matrix into mixed branch composition. Remember that choice
 * on the root so returning the individual control to Auto cannot silently
 * switch the whole table back to the legacy depth-column composer.
 */
export function patchUsesOrientedMatrixComposition(
  patch: Record<string, unknown>
): boolean {
  return Object.keys(patch).some((key) => ORIENTED_MATRIX_COMPOSITION_FIELDS.has(key));
}

export function patchNeedsListReflow(patch: Record<string, unknown>): boolean {
  return Object.keys(patch).some((key) => LIST_REFLOW_FIELDS.has(key));
}
