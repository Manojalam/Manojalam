import assert from "node:assert/strict";
import test from "node:test";
import type { Node } from "@xyflow/react";

import {
  keepsFrameBehindOnSelection,
  nodeLayer,
  reorderSelectedNodeLayers,
} from "./layer-order";

function node(id: string, type: string, zIndex?: number): Node {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: type === "frame" ? { title: id } : {},
    ...(zIndex === undefined ? {} : { zIndex }),
  };
}

test("an ordinary frame defaults behind cards and stays there when selected", () => {
  const frame = node("lane", "frame");
  assert.equal(nodeLayer(frame), -1);
  assert.equal(keepsFrameBehindOnSelection(frame), true);
  assert.equal(keepsFrameBehindOnSelection(node("card", "sticky")), false);
});

test("bring to front and send to back place the selection beyond every peer", () => {
  const nodes = [node("lane", "frame", -1), node("a", "sticky", 0), node("b", "sticky", 3)];

  const front = reorderSelectedNodeLayers(nodes, new Set(["lane"]), "front");
  assert.equal(front.find((candidate) => candidate.id === "lane")?.zIndex, 4);
  assert.equal(keepsFrameBehindOnSelection(front[0]), false);

  const back = reorderSelectedNodeLayers(nodes, new Set(["b"]), "back");
  assert.equal(back.find((candidate) => candidate.id === "b")?.zIndex, -2);
});

test("forward and backward cross the nearest occupied layer", () => {
  const nodes = [node("lane", "frame", -1), node("a", "sticky", 0), node("b", "sticky", 5)];

  const forward = reorderSelectedNodeLayers(nodes, new Set(["a"]), "forward");
  assert.equal(forward.find((candidate) => candidate.id === "a")?.zIndex, 6);

  const backward = reorderSelectedNodeLayers(nodes, new Set(["a"]), "backward");
  assert.equal(backward.find((candidate) => candidate.id === "a")?.zIndex, -2);
});

test("a multi-selection keeps its internal order while moving as one block", () => {
  const nodes = [
    node("back", "sticky", -3),
    node("first", "sticky", 1),
    node("second", "sticky", 2),
    node("front", "sticky", 8),
  ];
  const reordered = reorderSelectedNodeLayers(
    nodes,
    new Set(["first", "second"]),
    "front"
  );
  assert.equal(reordered.find((candidate) => candidate.id === "first")?.zIndex, 9);
  assert.equal(reordered.find((candidate) => candidate.id === "second")?.zIndex, 10);
});
