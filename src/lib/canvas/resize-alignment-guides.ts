import type { Node } from "@xyflow/react";
import { getNodeRect, createNodeRect, type NodeRect } from "../layout/geometry";

/** Parent-relative nodes must be compared in board coordinates. */
export function boardNodeRect(node: Node, nodes: Node[]): NodeRect {
  const rect = getNodeRect(node);
  const seen = new Set([node.id]);
  let parentId = node.parentId;
  let x = rect.x, y = rect.y;
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = nodes.find(item => item.id === parentId);
    if (!parent) break;
    const bounds = getNodeRect(parent);
    x += bounds.x; y += bounds.y; parentId = parent.parentId;
  }
  return createNodeRect(node.id, x, y, rect.width, rect.height);
}

/** Show every matching edge/center, so a fixed edge cannot mask the resizing edge. */
export function resizeAlignmentGuides(rect: NodeRect, others: NodeRect[], threshold: number) {
  const h = new Set<number>(), v = new Set<number>();
  for (const other of others) {
    for (const x of [other.left, other.centerX, other.right]) {
      if ([rect.left, rect.centerX, rect.right].some(value => Math.abs(value - x) <= threshold)) v.add(x);
    }
    for (const y of [other.top, other.centerY, other.bottom]) {
      if ([rect.top, rect.centerY, rect.bottom].some(value => Math.abs(value - y) <= threshold)) h.add(y);
    }
  }
  return { h: [...h], v: [...v] };
}
