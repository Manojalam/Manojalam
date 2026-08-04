import assert from "node:assert/strict";
import test from "node:test";
import type { Node } from "@xyflow/react";
import {
  frameOwnedNodeIds,
  resolveFrameDropCollisions,
} from "./frame-collision";

function frame(id: string, x: number, y = 0, locked = false): Node {
  return {
    id,
    type: "frame",
    position: { x, y },
    data: { title: id, locked },
    style: { width: 400, height: 600 },
  };
}

function card(id: string, x: number, y = 100): Node {
  return {
    id,
    type: "sticky",
    position: { x, y },
    data: { text: id },
    style: { width: 180, height: 120 },
  };
}

test("dropping a lane to the right pushes an overlapping lane and its card", () => {
  const nodes = [
    frame("inserted", 250),
    frame("done", 500),
    card("done-card", 610),
  ];

  const placements = resolveFrameDropCollisions(
    nodes,
    new Set(["inserted"]),
    { x: 250, y: 0 }
  );

  assert.deepEqual(placements.done, { x: 682, y: 0 });
  assert.deepEqual(placements["done-card"], { x: 792, y: 100 });
});

test("a displaced lane cascades into the remaining lane row", () => {
  const nodes = [
    frame("inserted", 250),
    frame("second", 500),
    frame("third", 920),
  ];

  const placements = resolveFrameDropCollisions(
    nodes,
    new Set(["inserted"]),
    { x: 250, y: 0 }
  );

  assert.deepEqual(placements.second, { x: 682, y: 0 });
  assert.deepEqual(placements.third, { x: 1114, y: 0 });
});

test("inserting to the right leaves the lane behind the gesture in place", () => {
  const nodes = [
    frame("left", 0),
    frame("inserted", 410),
    frame("right", 700),
  ];

  const placements = resolveFrameDropCollisions(
    nodes,
    new Set(["inserted"]),
    { x: 300, y: 0 }
  );

  assert.equal(placements.left, undefined);
  assert.deepEqual(placements.right, { x: 842, y: 0 });
});

test("dragging a lane left pushes the covered lane left", () => {
  const nodes = [frame("first", 100), frame("inserted", 250)];

  const placements = resolveFrameDropCollisions(
    nodes,
    new Set(["inserted"]),
    { x: -300, y: 0 }
  );

  assert.deepEqual(placements.first, { x: -182, y: 0 });
});

test("dragging an ordinary card does not rearrange frames", () => {
  const nodes = [frame("lane", 0), card("card", 100)];
  const placements = resolveFrameDropCollisions(
    nodes,
    new Set(["card"]),
    { x: 100, y: 0 }
  );

  assert.deepEqual(placements, {});
});

test("cards belong to the closest containing lane when frames overlap", () => {
  const nodes = [
    frame("left", 0),
    frame("right", 300),
    card("shared", 410),
  ];

  assert.deepEqual(frameOwnedNodeIds(nodes, new Set(["right"])), ["shared"]);
  assert.deepEqual(frameOwnedNodeIds(nodes, new Set(["left"])), []);
});
