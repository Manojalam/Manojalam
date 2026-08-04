import type { Node } from "@xyflow/react";
import {
  getNodeDimensions,
  getNodeRect,
  nodePositionFromTopLeft,
} from "../layout/geometry";

const CHILD_HORIZONTAL_GAP = 104;
const CHILD_VERTICAL_GAP = 28;

/**
 * Place a newly created child beside its parent using the child's final size.
 * The first child shares the parent's centerline; later children stack below it.
 */
export function placeNewChild(
  parent: Node,
  child: Node,
  siblingIndex: number
): Node {
  const parentRect = getNodeRect(parent);
  const childSize = getNodeDimensions(child);
  const topLeft = {
    x: parentRect.right + CHILD_HORIZONTAL_GAP,
    y: parentRect.centerY - childSize.height / 2
      + Math.max(0, siblingIndex) * (childSize.height + CHILD_VERTICAL_GAP),
  };

  return {
    ...child,
    position: nodePositionFromTopLeft(child, topLeft, childSize),
  };
}
