import assert from "node:assert/strict";
import test from "node:test";
import type { Node } from "@xyflow/react";
import { getNodeRect } from "../layout/geometry";
import { compactEqualSpacing } from "./selection-geometry";

function node(id: string, x: number, y: number, width: number, height: number, origin?: [number, number]): Node {
  return { id, position: { x, y }, origin, data: {}, style: { width, height } };
}

test("horizontal compact spacing uses equal edge gaps and preserves the group center", () => {
  const nodes = [
    node("a", 0, 20, 80, 40),
    node("b", 380, 70, 140, 60),
    node("c", 900, 10, 100, 50),
  ];
  const before = nodes.map(getNodeRect);
  const positions = compactEqualSpacing(nodes, "x", 28);
  const after = nodes.map((item) => getNodeRect({ ...item, position: positions.get(item.id)! }));

  assert.equal(after[1].left - after[0].right, 28);
  assert.equal(after[2].left - after[1].right, 28);
  assert.equal((after[0].left + after[2].right) / 2, (before[0].left + before[2].right) / 2);
  assert.deepEqual(after.map((rect) => rect.top), before.map((rect) => rect.top));
});

test("vertical compact spacing supports centered node origins", () => {
  const nodes = [
    node("a", 200, 100, 100, 50, [0.5, 0.5]),
    node("b", 260, 500, 120, 80, [0.5, 0.5]),
  ];
  const positions = compactEqualSpacing(nodes, "y", 24);
  const after = nodes.map((item) => getNodeRect({ ...item, position: positions.get(item.id)! }));

  assert.equal(after[1].top - after[0].bottom, 24);
  assert.equal(after[0].left, 150);
  assert.equal(after[1].left, 200);
});
