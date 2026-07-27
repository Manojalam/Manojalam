const AUTOFIT_REFLOW_FIELDS = new Set([
  "text", "richText", "label", "title", "topic", "devanagari", "iast", "translation",
  "rule", "fontSize", "fontFamily", "fontStyle", "fontWeight", "textAlign",
  "shapeType", "petalCount", "borderWidth", "cornerRadiusPercent", "borderRadius", "borderStyle",
]);

const MATRIX_REFLOW_FIELDS = new Set([
  ...AUTOFIT_REFLOW_FIELDS,
  "fillColor", "fillOpacity", "color", "layoutAutoFill",
  "collapsed", "parentId", "childOrder", "layoutFoldCount", "layoutFoldBreakAfter", "layoutWrapAfter", "matrixDensity", "matrixGridVisible", "matrixOrientation", "matrixChildFlow", "matrixPackCompactGroups", "matrixIncompleteRowMode", "matrixFillCellLabels",
  "matrixSiblingGap", "matrixWidthOverride", "matrixHeightOverride", "matrixTableWidthOverride", "matrixTableHeightOverride",
]);

const LIST_REFLOW_FIELDS = new Set([
  ...AUTOFIT_REFLOW_FIELDS,
  "collapsed", "parentId", "childOrder", "layoutFoldCount", "layoutFoldBreakAfter", "layoutWrapAfter", "listDensity",
]);

export function patchNeedsMatrixReflow(patch: Record<string, unknown>): boolean {
  return Object.keys(patch).some((key) => MATRIX_REFLOW_FIELDS.has(key));
}

export function patchNeedsListReflow(patch: Record<string, unknown>): boolean {
  return Object.keys(patch).some((key) => LIST_REFLOW_FIELDS.has(key));
}
