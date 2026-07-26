import type { Node } from "@xyflow/react";

/**
 * Authored shape nodes always support shape changes. Matrix cells additionally
 * allow card-like content nodes to become shapes without affecting unrelated
 * callouts, frames, charts, or notes in a mixed selection.
 */
export function supportsShapeTransform(
  node: Pick<Node, "type" | "data">
): boolean {
  const data = (node.data ?? {}) as Record<string, unknown>;
  return node.type === "shape" || data.matrixCell === true;
}
