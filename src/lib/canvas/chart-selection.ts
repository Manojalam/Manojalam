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

/**
 * Relationship diagrams only need one eligible source. Preserve selection
 * order while dropping sources that do not have a saved relationship.
 */
export function relationshipDiagramSourceIds(
  selectedNodeIds: readonly string[],
  relationships: readonly { sourceNodeId: string }[]
): string[] {
  const relationshipSources = new Set(
    relationships.map((relationship) => relationship.sourceNodeId)
  );
  return Array.from(new Set(selectedNodeIds)).filter((nodeId) =>
    relationshipSources.has(nodeId)
  );
}
