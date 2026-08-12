import assert from "node:assert/strict";
import test from "node:test";
import type { Edge, Node } from "@xyflow/react";

import {
  applyCanvasLayerOrder,
  assignCanvasItemsToLayer,
  canvasItemLayerId,
  canvasLayerMemberIds,
  canvasLayerById,
  isCanvasItemLayerLocked,
  isCanvasItemLayerVisible,
  moveCanvasLayer,
  normalizeCanvasLayerMembership,
  normalizeCanvasLayers,
} from "./layers";

function node(id: string, layerId?: string, zIndex?: number): Node {
  return {
    id,
    position: { x: 0, y: 0 },
    data: layerId ? { layerId } : {},
    ...(zIndex === undefined ? {} : { zIndex }),
  };
}

function edge(id: string, layerId?: string): Edge {
  return {
    id,
    source: "a",
    target: "b",
    data: layerId ? { layerId } : {},
  };
}

test("normalizes layer names, flags, duplicates, and back-to-front order", () => {
  assert.deepEqual(normalizeCanvasLayers([
    { id: "front", name: " Front ", order: 8, visible: false },
    { id: "back", name: "", order: -2, locked: true },
    { id: "front", name: "Duplicate", order: 0 },
  ]), [
    { id: "back", name: "Layer 2", order: 0, visible: true, locked: true },
    { id: "front", name: "Front", order: 1, visible: false, locked: false },
  ]);
});

test("assigns and removes selected node and connector memberships", () => {
  const assigned = assignCanvasItemsToLayer(
    [node("a"), node("b", "old")],
    [edge("edge")],
    new Set(["a"]),
    new Set(["edge"]),
    "lesson"
  );
  assert.equal(assigned.changedCount, 2);
  assert.equal(canvasItemLayerId(assigned.nodes[0]), "lesson");
  assert.equal(canvasItemLayerId(assigned.nodes[1]), "old");
  assert.deepEqual(canvasLayerMemberIds(assigned.nodes, assigned.edges, "lesson"), {
    nodeIds: ["a"],
    edgeIds: ["edge"],
  });

  const removed = assignCanvasItemsToLayer(
    assigned.nodes,
    assigned.edges,
    new Set(["a"]),
    new Set(["edge"])
  );
  assert.equal(removed.changedCount, 2);
  assert.equal(canvasItemLayerId(removed.nodes[0]), null);
  assert.equal(canvasItemLayerId(removed.edges[0]), null);
});

test("removes orphaned memberships while preserving valid layers", () => {
  const result = normalizeCanvasLayerMembership(
    [node("a", "kept"), node("b", "missing")],
    [edge("edge", "missing")],
    [{ id: "kept", name: "Kept", order: 0, visible: true, locked: false }]
  );
  assert.equal(canvasItemLayerId(result.nodes[0]), "kept");
  assert.equal(canvasItemLayerId(result.nodes[1]), null);
  assert.equal(canvasItemLayerId(result.edges[0]), null);
});

test("moves layers and restacks each layer as a stable block", () => {
  const layers = normalizeCanvasLayers([
    { id: "back", name: "Back", order: 0 },
    { id: "front", name: "Front", order: 1 },
  ]);
  const moved = moveCanvasLayer(layers, "back", "forward");
  assert.deepEqual(moved.map((layer) => layer.id), ["front", "back"]);

  const ordered = applyCanvasLayerOrder([
    node("back-b", "back", 9),
    node("front", "front", 2),
    node("back-a", "back", 1),
    node("unlayered", undefined, 100),
  ], moved);
  assert.equal(ordered.find((item) => item.id === "front")?.zIndex, 1);
  assert.equal(ordered.find((item) => item.id === "back-a")?.zIndex, 2);
  assert.equal(ordered.find((item) => item.id === "back-b")?.zIndex, 3);
  assert.equal(ordered.find((item) => item.id === "unlayered")?.zIndex, 100);
});

test("resolves layer visibility and locking without mutating item data", () => {
  const layersById = canvasLayerById(normalizeCanvasLayers([
    { id: "hidden", name: "Hidden", order: 0, visible: false },
    { id: "locked", name: "Locked", order: 1, locked: true },
  ]));
  assert.equal(isCanvasItemLayerVisible(node("hidden-node", "hidden"), layersById), false);
  assert.equal(isCanvasItemLayerLocked(edge("locked-edge", "locked"), layersById), true);
  assert.equal(isCanvasItemLayerVisible(node("plain"), layersById), true);
  assert.equal(isCanvasItemLayerLocked(node("plain"), layersById), false);
});
