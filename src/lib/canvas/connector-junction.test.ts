import assert from "node:assert/strict";
import test from "node:test";
import { MarkerType, type Edge, type Node } from "@xyflow/react";
import {
  clearConnectorJunctionGraph,
  refreshConnectorJunctionHandles,
  releaseConnectorJunctionRouteAnchors,
  splitConnectorAtJunction,
} from "./connector-junction";

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

test("adding a junction preserves the existing route on both split edges", () => {
  const result = splitConnectorAtJunction(
    { id: "edge", source: "source", target: "target", data: {} },
    { x: 300, y: 20 },
    { x: 100, y: 100 },
    { x: 500, y: 100 },
    { junctionId: "junction", firstEdgeId: "first", secondEdgeId: "second" },
    [
      { x: 100, y: 100 },
      { x: 100, y: 20 },
      { x: 500, y: 20 },
      { x: 500, y: 100 },
    ]
  );

  assert.deepEqual(result.edges[0].data?.waypoints, [{ x: 100, y: 20 }]);
  assert.deepEqual(result.edges[1].data?.waypoints, [{ x: 500, y: 20 }]);
});

test("moving a junction releases its temporary route anchors", () => {
  const split = splitConnectorAtJunction(
    { id: "edge", source: "source", target: "target", data: {} },
    { x: 300, y: 20 },
    { x: 100, y: 100 },
    { x: 500, y: 100 },
    { junctionId: "junction", firstEdgeId: "first", secondEdgeId: "second" },
    [
      { x: 100, y: 100 },
      { x: 100, y: 20 },
      { x: 500, y: 20 },
      { x: 500, y: 100 },
    ]
  );
  const released = releaseConnectorJunctionRouteAnchors(split.edges, new Set(["junction"]));

  assert.equal(released[0].data?.waypoints, undefined);
  assert.equal(released[1].data?.waypoints, undefined);
  assert.equal(released[0].data?.junctionPreservedWaypoints, undefined);
  assert.equal(released[1].data?.junctionPreservedWaypoints, undefined);
});

test("moving a junction retains user-created bends while dropping preservation anchors", () => {
  const split = splitConnectorAtJunction(
    {
      id: "edge",
      source: "source",
      target: "target",
      data: { waypoints: [{ x: 100, y: 20 }] },
    },
    { x: 300, y: 20 },
    { x: 100, y: 100 },
    { x: 500, y: 100 },
    { junctionId: "junction", firstEdgeId: "first", secondEdgeId: "second" },
    [
      { x: 100, y: 100 },
      { x: 100, y: 20 },
      { x: 500, y: 20 },
      { x: 500, y: 100 },
    ]
  );
  const released = releaseConnectorJunctionRouteAnchors(split.edges, new Set(["junction"]));

  assert.deepEqual(released[0].data?.waypoints, [{ x: 100, y: 20 }]);
  assert.equal(released[1].data?.waypoints, undefined);
});

test("a moved junction keeps its handles facing connected nodes", () => {
  const junction: Node = {
    id: "junction",
    type: "junction",
    position: { x: 300, y: 100 },
    style: { width: 28, height: 28 },
    data: {},
  };
  const target: Node = {
    id: "target",
    position: { x: 100, y: 100 },
    style: { width: 120, height: 80 },
    data: {},
  };
  const edges = refreshConnectorJunctionHandles(
    [junction, target],
    [{ id: "edge", source: "junction", target: "target", sourceHandle: "top" }],
    new Set(["junction"])
  );

  assert.equal(edges[0].sourceHandle, "left");
});
