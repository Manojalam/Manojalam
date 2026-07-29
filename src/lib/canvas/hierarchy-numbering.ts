import type { Edge, Node } from "@xyflow/react";
import { buildHierarchy, getRoots } from "../layout/hierarchy";
import { getNodeRect } from "../layout/geometry";

const NON_CONTENT_NODE_TYPES = new Set([
  "frame",
  "junction",
  "relationshipDiagram",
  "sunburst",
]);

export type HierarchyNumberFormat = "outline" | "sibling";

export function participatesInHierarchyNumbering(node: Node): boolean {
  if (NON_CONTENT_NODE_TYPES.has(node.type ?? "")) return false;
  return (node.data as { externalNote?: unknown } | undefined)?.externalNote !== true;
}

/**
 * Derive display numbers from the board hierarchy without changing authored
 * labels. Outline mode appends descendant ordinals; sibling mode shows only
 * the local one-based ordinal and restarts under each parent.
 */
export function hierarchyNumberMap(
  nodes: Node[],
  edges: Edge[],
  format: HierarchyNumberFormat = "outline"
): Map<string, string> {
  const contentNodes = nodes.filter(participatesInHierarchyNumbering);
  const contentNodeIds = new Set(contentNodes.map((node) => node.id));
  const hierarchy = buildHierarchy(
    contentNodes,
    edges.filter((edge) => contentNodeIds.has(edge.source) && contentNodeIds.has(edge.target))
  );
  const nodeById = new Map(contentNodes.map((node) => [node.id, node]));
  const roots = getRoots(hierarchy).sort((leftId, rightId) => {
    const left = getNodeRect(nodeById.get(leftId)!);
    const right = getNodeRect(nodeById.get(rightId)!);
    return left.centerY - right.centerY || left.centerX - right.centerX;
  });
  const numbers = new Map<string, string>();

  const visit = (nodeId: string, outlineNumber: string, siblingNumber: number) => {
    numbers.set(
      nodeId,
      format === "sibling" ? String(siblingNumber) : outlineNumber
    );
    const childIds = hierarchy.get(nodeId)?.childIds ?? [];
    childIds.forEach((childId, index) => {
      const childNumber = index + 1;
      visit(childId, `${outlineNumber}.${childNumber}`, childNumber);
    });
  };

  roots.forEach((rootId, index) => {
    const rootNumber = index + 1;
    visit(rootId, String(rootNumber), rootNumber);
  });
  return numbers;
}

export function hierarchyNumberForNode(
  node: Node,
  numbers: ReadonlyMap<string, string>
): string | undefined {
  if ((node.data as { hideHierarchyNumber?: unknown } | undefined)?.hideHierarchyNumber === true) {
    return undefined;
  }
  return numbers.get(node.id);
}
