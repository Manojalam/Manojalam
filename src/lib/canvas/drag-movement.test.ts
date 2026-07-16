import assert from "node:assert/strict";
import test from "node:test";
import type { Edge, Node } from "@xyflow/react";
import { planNodeDragMovement } from "./drag-movement";

function node(id: string, data: Record<string, unknown> = {}): Node {
  return { id, type: "shape", position: { x: 0, y: 0 }, data };
}

function edge(id: string, source: string, target: string): Edge {
  return { id, source, target, data: {} };
}

test("a normal parent drag moves its branch and attached notes", () => {
  const nodes = [
    node("parent"),
    node("child"),
    node("grandchild"),
    node("note", { externalNote: true, noteForNodeId: "parent" }),
    node("other"),
  ];
  const edges = [
    edge("parent-child", "parent", "child"),
    edge("child-grandchild", "child", "grandchild"),
  ];

  const plan = planNodeDragMovement(nodes, edges, "parent", ["parent"]);

  assert.deepEqual(new Set(plan.movingIds), new Set(["parent", "child", "grandchild", "note"]));
  assert.equal(plan.moveAsGroup, true);
});

test("move-only keeps descendants and attached notes in place", () => {
  const nodes = [
    node("parent"),
    node("child"),
    node("note", { externalNote: true, noteForNodeId: "parent" }),
  ];
  const edges = [edge("parent-child", "parent", "child")];

  const plan = planNodeDragMovement(nodes, edges, "parent", ["parent"], true);

  assert.deepEqual(plan.movingIds, ["parent"]);
  assert.equal(plan.moveAsGroup, false);
});

test("matrix frames stay together even when move-only is requested", () => {
  const nodes = [
    node("matrix", { matrixCellRole: "header", matrixRootId: "matrix" }),
    node("cell", { matrixRootId: "matrix" }),
    node("frame", { matrixFrameFor: "matrix" }),
  ];

  const plan = planNodeDragMovement(nodes, [], "matrix", ["matrix"], true);

  assert.deepEqual(new Set(plan.movingIds), new Set(["matrix", "cell", "frame"]));
  assert.equal(plan.matrixRootId, "matrix");
  assert.equal(plan.moveAsGroup, true);
});
