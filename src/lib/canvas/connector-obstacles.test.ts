import assert from "node:assert/strict";
import test from "node:test";
import type { Node } from "@xyflow/react";
import { isConnectorRoutingObstacle } from "./connector-obstacles";

function node(id: string, overrides: Partial<Node> = {}): Node {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {},
    ...overrides,
  };
}

test("external notes never reroute connectors or their labels", () => {
  const note = node("note", { data: { externalNote: true, noteForNodeId: "source" } });

  assert.equal(isConnectorRoutingObstacle(note), false);
  assert.equal(isConnectorRoutingObstacle(node("shape", { type: "shape" })), true);
});

test("hidden nodes and frames remain excluded from connector routing", () => {
  assert.equal(isConnectorRoutingObstacle(node("hidden", { hidden: true })), false);
  assert.equal(isConnectorRoutingObstacle(node("frame", { type: "frame" })), false);
});
