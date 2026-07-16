import assert from "node:assert/strict";
import test from "node:test";
import { MarkerType, type Edge } from "@xyflow/react";
import { splitConnectorAtJunction } from "./connector-junction";

test("a connector junction preserves the line endpoints and terminal arrow", () => {
  const edge: Edge = {
    id: "edge",
    source: "source",
    target: "target",
    sourceHandle: "right",
    targetHandle: "left",
    markerEnd: { type: MarkerType.ArrowClosed },
    data: { label: "Approved", color: "#123456", waypoints: [{ x: 50, y: 50 }] },
  };
  const result = splitConnectorAtJunction(
    edge,
    { x: 300, y: 100 },
    { x: 100, y: 100 },
    { x: 500, y: 100 },
    { junctionId: "junction", firstEdgeId: "first", secondEdgeId: "second" }
  );

  assert.equal(result.edges[0].source, "source");
  assert.equal(result.edges[0].target, "junction");
  assert.equal(result.edges[0].markerEnd, undefined);
  assert.equal(result.edges[0].data?.label, undefined);
  assert.equal(result.edges[1].source, "junction");
  assert.equal(result.edges[1].target, "target");
  assert.deepEqual(result.edges[1].markerEnd, edge.markerEnd);
  assert.equal(result.edges[1].data?.label, "Approved");
  assert.equal(result.edges[1].data?.waypoints, undefined);
});
