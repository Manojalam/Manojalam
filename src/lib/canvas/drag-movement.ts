import { imageNotePairs } from "./image-note-pairs";
import type { Edge, Node } from "@xyflow/react";
import { buildHierarchy } from "../layout/hierarchy";
import { includeAttachedExternalNoteIds } from "./node-note";
import {
  frameOwnedNodeIds,
  isStandaloneFrameNode,
} from "./frame-collision";

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
  const matrixRootId = draggedData.layoutMode === "matrix" ? draggedNode.id
    : typeof draggedData.matrixRootId === "string" ? draggedData.matrixRootId : null;
  const movesWholeMatrix = matrixRootId === draggedNode.id
    && (draggedData.layoutMode === "matrix" || draggedData.matrixCellRole === "header");
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
  } else if (isStandaloneFrameNode(draggedNode)) {
    const frameIds = new Set([draggedNode.id]);
    movingIds = [draggedNode.id, ...frameOwnedNodeIds(nodes, frameIds)]
      .filter((nodeId) => !isLocked(byId.get(nodeId)));
    moveAsGroup = movingIds.length > 1;
  } else if (draggedData.layoutMode === "list") {
    movingIds = [draggedNode.id];
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

  // React Flow moves every selected root itself. Include the contents of ALL
  // selected matrices too, otherwise only the matrix under the pointer follows
  // its header and the other selected headers tear away from their cells.
  if ((selectedGroup && !moveOnlyDraggedNode) || movesWholeMatrix) {
    const expanded = new Set([...movingIds, ...(selectedGroup ? selectedNodeIds.filter(id => !isLocked(byId.get(id))) : [])]);
    const roots = new Set([...expanded].filter(id => {
      const data = byId.get(id)?.data;
      return data?.layoutMode === "matrix"
        || (data?.matrixCellRole === "header" && data.matrixRootId === id);
    }));
    const hierarchy = buildHierarchy(nodes, edges);
    const visited = new Set<string>();
    const includeBranch = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);
      for (const child of hierarchy.get(id)?.childIds ?? []) {
        expanded.add(child);
        includeBranch(child);
      }
    };
    roots.forEach(includeBranch);
    nodes.forEach(node => {
      if (roots.has(String(node.data.matrixRootId)) || roots.has(String(node.data.matrixFrameFor))) expanded.add(node.id);
    });
    movingIds = [...expanded];
    moveAsGroup = true;
  }

  if (!moveOnlyDraggedNode || movesWholeMatrix) {
    // Image-note pairs share movement, not selection or editing state.
    const paired = new Set(movingIds);
    const imagePairs = imageNotePairs(nodes);
    for (const { image: owner, note } of imagePairs) {
      if (paired.has(note.id) && !isLocked(owner) && !isLocked(note)) paired.add(owner.id);
    }
    for (const { image: owner, note } of imagePairs) {
      if (isLocked(note) || isLocked(owner)) continue;
      if (paired.has(note.id) || paired.has(owner.id)) { paired.add(note.id); paired.add(owner.id); }
    }
    movingIds = [...paired];
    moveAsGroup ||= movingIds.length > 1;
    movingIds = includeAttachedExternalNoteIds(nodes, movingIds);
  }

  return { movingIds, matrixRootId, moveAsGroup };
}
