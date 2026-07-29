import type { Edge, Node } from "@xyflow/react";
import { buildHierarchy, getRoots } from "../layout/hierarchy";

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
 * Derive display numbers for each branch-local numbering scope without
 * changing authored labels. Each enabled branch starts at 1. Nested scopes
 * are applied after their ancestors so they can restart their own subtree.
 */
export function hierarchyNumberMap(
  nodes: Node[],
  edges: Edge[]
): Map<string, string> {
  const contentNodes = nodes.filter(participatesInHierarchyNumbering);
  const contentNodeIds = new Set(contentNodes.map((node) => node.id));
  const hierarchy = buildHierarchy(
    contentNodes,
    edges.filter((edge) => contentNodeIds.has(edge.source) && contentNodeIds.has(edge.target))
  );
  const numbers = new Map<string, string>();

  const depthById = new Map<string, number>();
  const depthOf = (nodeId: string): number => {
    const cached = depthById.get(nodeId);
    if (cached !== undefined) return cached;
    const parentId = hierarchy.get(nodeId)?.parentId;
    const depth = parentId ? depthOf(parentId) + 1 : 0;
    depthById.set(nodeId, depth);
    return depth;
  };

  const scopes = contentNodes
    .filter((node) => (
      node.data as { hierarchicalNumbering?: unknown } | undefined
    )?.hierarchicalNumbering === true)
    .sort((left, right) => depthOf(left.id) - depthOf(right.id));

  const visit = (
    nodeId: string,
    outlineNumber: string,
    siblingNumber: number,
    format: HierarchyNumberFormat
  ) => {
    numbers.set(
      nodeId,
      format === "sibling" ? String(siblingNumber) : outlineNumber
    );
    const childIds = hierarchy.get(nodeId)?.childIds ?? [];
    childIds.forEach((childId, index) => {
      const childNumber = index + 1;
      visit(childId, `${outlineNumber}.${childNumber}`, childNumber, format);
    });
  };

  scopes.forEach((scope) => {
    const format = (
      scope.data as { hierarchicalNumberingFormat?: unknown } | undefined
    )?.hierarchicalNumberingFormat === "sibling"
      ? "sibling"
      : "outline";
    visit(scope.id, "1", 1, format);
  });
  return numbers;
}

/**
 * Convert the short-lived board-wide setting into one numbering scope per
 * layout diagram. The legacy setting is cleared separately by board loading.
 */
export function migrateLegacyHierarchyNumberingScopes(
  nodes: Node[],
  edges: Edge[],
  enabled: boolean,
  format: HierarchyNumberFormat = "outline"
): Node[] {
  if (!enabled) return nodes;

  const contentNodes = nodes.filter(participatesInHierarchyNumbering);
  const contentNodeIds = new Set(contentNodes.map((node) => node.id));
  const hierarchy = buildHierarchy(
    contentNodes,
    edges.filter((edge) => contentNodeIds.has(edge.source) && contentNodeIds.has(edge.target))
  );
  const scopeIds = new Set(
    getRoots(hierarchy).filter((rootId) => (hierarchy.get(rootId)?.childIds.length ?? 0) > 0)
  );
  if (!scopeIds.size) return nodes;

  return nodes.map((node) => {
    if (!scopeIds.has(node.id)) return node;
    const data = node.data as {
      hierarchicalNumbering?: unknown;
      hierarchicalNumberingFormat?: unknown;
    };
    return {
      ...node,
      data: {
        ...data,
        hierarchicalNumbering: true,
        hierarchicalNumberingFormat:
          data.hierarchicalNumberingFormat === "sibling"
            ? "sibling"
            : data.hierarchicalNumberingFormat === "outline"
              ? "outline"
              : format,
      },
    };
  });
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
