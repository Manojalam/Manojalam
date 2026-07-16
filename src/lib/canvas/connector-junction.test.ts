import assert from "node:assert/strict";
import test from "node:test";
import { MarkerType, type Edge } from "@xyflow/react";
import { clearConnectorJunctionGraph, splitConnectorAtJunction } from "./connector-junction";

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

test("clearing a junction restores the original through-connection", () => {
  const original: Edge = {
    id: "edge",
    source: "source",
    target: "target",
    sourceHandle: "right",
    targetHandle: "left",
    markerEnd: { type: MarkerType.ArrowClosed },
    data: { label: "Approved", arrowEnd: true, color: "#123456" },
  };
  const split = splitConnectorAtJunction(
    original,
    { x: 300, y: 100 },
    { x: 100, y: 100 },
    { x: 500, y: 100 },
    { junctionId: "junction", firstEdgeId: "first", secondEdgeId: "second" }
  );
  const result = clearConnectorJunctionGraph(
    [{ id: "source", position: { x: 0, y: 0 }, data: {} }, split.junction, { id: "target", position: { x: 0, y: 0 }, data: {} }],
    split.edges,
    "junction"
  );

  assert.equal(result.merged, true);
  assert.equal(result.nodes.some((node) => node.id === "junction"), false);
  assert.equal(result.edges.length, 1);
  assert.equal(result.edges[0].source, "source");
  assert.equal(result.edges[0].target, "target");
  assert.equal(result.edges[0].sourceHandle, "right");
  assert.equal(result.edges[0].targetHandle, "left");
  assert.deepEqual(result.edges[0].markerEnd, original.markerEnd);
  assert.equal(result.edges[0].data?.label, "Approved");
  assert.equal(result.edges[0].data?.connectorJunctionId, undefined);
});

test("clearing a branched junction merges the main line and removes branch edges", () => {
  const split = splitConnectorAtJunction(
    { id: "edge", source: "source", target: "target", data: {} },
    { x: 300, y: 100 },
    { x: 100, y: 100 },
    { x: 500, y: 100 },
    { junctionId: "junction", firstEdgeId: "first", secondEdgeId: "second" }
  );
  const result = clearConnectorJunctionGraph(
    [split.junction],
    [...split.edges, { id: "branch", source: "junction", target: "branch-target", data: {} }],
    "junction"
  );

  assert.equal(result.merged, true);
  assert.equal(result.removedEdgeCount, 3);
  assert.deepEqual(result.edges.map((edge) => edge.id), ["second"]);
  assert.equal(result.edges[0].source, "source");
  assert.equal(result.edges[0].target, "target");
});
