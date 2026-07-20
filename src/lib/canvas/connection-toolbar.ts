export interface ConnectionToolbarContext {
  selected: boolean;
  selectedNodeIds: readonly string[];
  selectedEdgeIds: readonly string[];
  logicalEdgeIds: readonly string[];
}

/** A connector editor belongs to one logical connector, never a bulk selection. */
export function canShowConnectionToolbar({
  selected,
  selectedNodeIds,
  selectedEdgeIds,
  logicalEdgeIds,
}: ConnectionToolbarContext): boolean {
  if (!selected || selectedNodeIds.length > 0 || selectedEdgeIds.length === 0) return false;
  const logicalIds = new Set(logicalEdgeIds);
  return logicalIds.size > 0 && selectedEdgeIds.every((edgeId) => logicalIds.has(edgeId));
}
