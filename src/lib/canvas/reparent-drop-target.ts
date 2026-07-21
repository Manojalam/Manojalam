import type { Edge, Node } from "@xyflow/react";
import { getNodeRect } from "../layout/geometry";
import { buildHierarchy, getSubtree } from "../layout/hierarchy";

export interface CanvasPoint {
  x: number;
  y: number;
}

function isExternalNote(node: Node): boolean {
  return (node.data as { externalNote?: unknown } | undefined)?.externalNote === true;
}

/** Find the smallest valid parent under the pointer receiving the dragged branch. */
export function findReparentDropTarget(
  nodes: Node[],
  edges: Edge[],
  draggedNodeId: string,
  movingIds: ReadonlySet<string>,
  pointer: CanvasPoint
): string | null {
  const draggedNode = nodes.find((node) => node.id === draggedNodeId);
  if (!draggedNode || draggedNode.hidden || isExternalNote(draggedNode)) return null;

  const hierarchy = buildHierarchy(nodes, edges);
  const descendants = new Set(getSubtree(draggedNodeId, hierarchy));
  const unsupportedParentTypes = new Set(["frame", "junction", "sunburst", "relationshipDiagram"]);

  return nodes
    .filter((candidate) => {
      if (candidate.hidden || movingIds.has(candidate.id) || descendants.has(candidate.id)) return false;
      if (unsupportedParentTypes.has(candidate.type ?? "")) return false;
      if (isExternalNote(candidate)) return false;
      const rect = getNodeRect(candidate);
      return pointer.x >= rect.left && pointer.x <= rect.right
        && pointer.y >= rect.top && pointer.y <= rect.bottom;
    })
    .sort((a, b) => {
      const aRect = getNodeRect(a);
      const bRect = getNodeRect(b);
      return aRect.width * aRect.height - bRect.width * bRect.height;
    })[0]?.id ?? null;
}
