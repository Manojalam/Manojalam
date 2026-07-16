export interface RelationshipDiagramItemTarget {
  id: string;
  label: string;
  color?: string;
}

export interface RelationshipDiagramItemGroup {
  itemId: string;
  itemLabel?: string;
  sourceNodeId: string;
  sourceColor?: string;
  targets: RelationshipDiagramItemTarget[];
  count: number;
}

export function singleRelationshipItemId(sourceNodeId: string, targetNodeId: string): string {
  return `relationship:${encodeURIComponent(sourceNodeId)}:${encodeURIComponent(targetNodeId)}`;
}

/**
 * Presentation layouts need one independently addressable item per saved
 * relationship when the diagram scope contains a single source.
 */
export function splitSingleSourceRelationshipItems<T extends RelationshipDiagramItemGroup>(
  groups: readonly T[]
): T[] {
  if (groups.length !== 1) return [...groups];
  const group = groups[0];
  return group.targets.map((target) => ({
    ...group,
    itemId: singleRelationshipItemId(group.sourceNodeId, target.id),
    itemLabel: target.label,
    sourceColor: target.color ?? group.sourceColor,
    targets: [target],
    count: 1,
  }));
}
