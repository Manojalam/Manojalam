const AUTOFIT_REFLOW_FIELDS = new Set([
  "text", "richText", "label", "title", "topic", "devanagari", "iast", "translation",
  "rule", "fontSize", "fontFamily", "fontStyle", "fontWeight", "textAlign",
  "shapeType", "petalCount", "borderWidth", "cornerRadiusPercent", "borderRadius", "borderStyle",
]);

const MATRIX_REFLOW_FIELDS = new Set([
  ...AUTOFIT_REFLOW_FIELDS,
  "fillColor", "fillOpacity", "color", "layoutAutoFill",
  "collapsed", "parentId", "childOrder", "layoutFoldCount", "layoutFoldBreakAfter", "layoutWrapAfter", "matrixDensity", "matrixCompositionMode", "matrixOuterBorderVisible", "matrixGridVisible", "matrixOrientation", "matrixChildFlow", "matrixPackCompactGroups", "matrixIncompleteRowMode", "matrixFillCellLabels",
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

export function patchNeedsMatrixReflow(patch: Record<string, unknown>): boolean {
  return Object.keys(patch).some((key) => MATRIX_REFLOW_FIELDS.has(key));
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
