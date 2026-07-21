import type { Edge, Node } from "@xyflow/react";
import { buildHierarchy } from "../layout/hierarchy";
import { includeAttachedExternalNoteIds } from "./node-note";

export interface DragMovementPlan {
  movingIds: string[];
  matrixRootId: string | null;
  moveAsGroup: boolean;
}

function isLocked(node: Node | undefined): boolean {
  return ((node?.data ?? {}) as Record<string, unknown>).locked === true;
}

/** Resolves the objects that should follow a node for one drag gesture. */
export function planNodeDragMovement(
  nodes: Node[],
  edges: Edge[],
  draggedNodeId: string,
  selectedNodeIds: string[],
  moveOnlyDraggedNode = false
): DragMovementPlan {
  const draggedNode = nodes.find((node) => node.id === draggedNodeId);
  if (!draggedNode || isLocked(draggedNode)) {
    return { movingIds: [], matrixRootId: null, moveAsGroup: false };
  }

  const draggedData = (draggedNode.data ?? {}) as Record<string, unknown>;
  const matrixRootId = typeof draggedData.matrixRootId === "string"
    ? draggedData.matrixRootId
    : null;
  const movesWholeMatrix = draggedData.matrixCellRole === "header"
    && matrixRootId === draggedNode.id;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const selectedGroup = selectedNodeIds.length > 1 && selectedNodeIds.includes(draggedNode.id);
  let movingIds: string[];
  let moveAsGroup = false;

  // Matrix frames are a single generated object and cannot be separated safely.
  if (movesWholeMatrix && matrixRootId) {
    movingIds = nodes
      .filter((node) => {
        const data = (node.data ?? {}) as Record<string, unknown>;
        return node.id === matrixRootId
          || data.matrixRootId === matrixRootId
          || data.matrixFrameFor === matrixRootId;
      })
      .map((node) => node.id);
    moveAsGroup = true;
  } else if (moveOnlyDraggedNode) {
    movingIds = [draggedNode.id];
  } else if (selectedGroup) {
    movingIds = selectedNodeIds.filter((nodeId) => !isLocked(byId.get(nodeId)));
  } else {
    const hierarchy = buildHierarchy(nodes, edges);
    movingIds = [];
    const collectMovableBranch = (nodeId: string) => {
      const node = byId.get(nodeId);
      if (!node || isLocked(node)) return;
      movingIds.push(nodeId);
      for (const childId of hierarchy.get(nodeId)?.childIds ?? []) collectMovableBranch(childId);
    };
    collectMovableBranch(draggedNode.id);
    moveAsGroup = movingIds.length > 1;
  }

  if (!moveOnlyDraggedNode || movesWholeMatrix) {
    movingIds = includeAttachedExternalNoteIds(nodes, movingIds);
  }

  return { movingIds, matrixRootId, moveAsGroup };
}
