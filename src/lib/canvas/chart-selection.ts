/**
 * A hierarchy radial chart remains the active editing surface while one of its
 * hidden source nodes is selected. This keeps whole-chart controls reachable
 * during normal sector editing.
 */
export function isHierarchyRadialChartActive(
  chartNodeSelected: boolean,
  selectedNodeIds: readonly string[],
  chartNodeIds: ReadonlySet<string>
): boolean {
  return chartNodeSelected || (
    selectedNodeIds.length > 0
    && selectedNodeIds.every((nodeId) => chartNodeIds.has(nodeId))
  );
}
