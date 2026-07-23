const NODE_LAYOUT_GEOMETRY_FIELDS = [
  "layoutMode",
  "layoutFoldCount",
  "layoutFoldBreakAfter",
  "layoutWrapAfter",
  "layoutSizeOverride",
  "listManualOverride",
  "listDensity",
  "treeManualOverride",
  "matrixDensity",
  "matrixDensityUserSet",
  "matrixGridVisible",
  "matrixOrientation",
  "matrixWidthOverride",
  "matrixHeightOverride",
  "matrixIntrinsicSize",
  "matrixCell",
  "matrixCellRole",
  "matrixRootId",
  "matrixColumn",
  "matrixColumnWidth",
  "matrixRowStart",
  "matrixRowSpan",
  "radialWeight",
  "radialCenterRatio",
  "radialRingWidths",
  "radialDebugLabelBoxes",
  "radialTextRotation",
  "radialChartDiameter",
  "radialRingWidth",
] as const;

const EDGE_LAYOUT_ROUTING_FIELDS = [
  "layoutMode",
  "curveStyle",
  "manualRoute",
  "preserveHandles",
  "waypoints",
  "waypointOrigin",
  "labelPosition",
  "labelPathEdgeId",
  "labelOffset",
  "toolbarOffset",
  "junctionPreservedWaypoints",
  "junctionUserWaypoints",
] as const;

function omitFields(
  data: Record<string, unknown>,
  fields: readonly string[]
): Record<string, unknown> {
  let next = data;
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(next, field)) continue;
    if (next === data) next = { ...data };
    delete next[field];
  }
  return next;
}

/**
 * Keep authored content, styling, and hierarchy while discarding geometry
 * owned by the source chart. The target layout must derive a fresh diagram
 * from parent/child relationships instead of inheriting old arrangement state.
 */
export function clearLayoutNodeGeometry(
  data: Record<string, unknown>
): Record<string, unknown> {
  return omitFields(data, NODE_LAYOUT_GEOMETRY_FIELDS);
}

/** Remove route anchors owned by the source chart while retaining edge content and style. */
export function clearLayoutEdgeRouting(
  data: Record<string, unknown>
): Record<string, unknown> {
  return omitFields(data, EDGE_LAYOUT_ROUTING_FIELDS);
}
