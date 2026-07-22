import type { Node } from "@xyflow/react";

export interface StructuredReflowPlacement {
  x: number;
  y: number;
}

/**
 * Apply an automatic structured-layout position while preserving a deliberate
 * manual move during ordinary content reflow. Explicit layout commands such as
 * Fold force the calculated geometry and clear any stale manual override.
 */
export function applyStructuredReflowPlacement<NodeType extends Node>(
  node: NodeType,
  placement: StructuredReflowPlacement,
  forceAutomatic: boolean
): NodeType {
  const data = (node.data ?? {}) as Record<string, unknown>;
  if (data.treeManualOverride === true && !forceAutomatic) return node;

  let nextData = data;
  if (forceAutomatic && "treeManualOverride" in data) {
    const { treeManualOverride: _treeManualOverride, ...rest } = data;
    void _treeManualOverride;
    nextData = rest;
  }
  const positionChanged = Math.abs(node.position.x - placement.x) >= 0.75
    || Math.abs(node.position.y - placement.y) >= 0.75;
  if (!positionChanged && nextData === data) return node;

  return {
    ...node,
    ...(positionChanged ? { position: { x: placement.x, y: placement.y } } : {}),
    ...(nextData !== data ? { data: nextData } : {}),
  };
}
