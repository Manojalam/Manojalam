import type { Node } from "@xyflow/react";
import { isExternalNoteNode } from "./node-note";

/** Free annotations never participate in automatic connector routing. */
export function isConnectorRoutingObstacle(node: Node): boolean {
  return !node.hidden && node.type !== "frame" && !isExternalNoteNode(node);
}
