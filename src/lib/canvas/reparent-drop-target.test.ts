import assert from "node:assert/strict";
import test from "node:test";
import type { Edge, Node } from "@xyflow/react";
import { findReparentDropTarget } from "./reparent-drop-target";

function node(
  id: string,
  position: { x: number; y: number },
  size: { width: number; height: number },
  data: Record<string, unknown> = {}
): Node {
  return { id, type: "shape", position, style: size, data };
}

function edge(id: string, source: string, target: string): Edge {
  return { id, source, target, data: {} };
}

test("a wide Matrix row can be dropped on a narrow parent using the pointer", () => {
  const nodes = [
    node("old-parent", { x: 0, y: 0 }, { width: 220, height: 100 }),
    node("wide-row", { x: 240, y: 120 }, { width: 900, height: 70 }, { parentId: "old-parent" }),
    node("new-parent", { x: 40, y: 260 }, { width: 180, height: 140 }),
  ];
  const edges = [edge("old-wide", "old-parent", "wide-row")];

  assert.equal(
    findReparentDropTarget(nodes, edges, "wide-row", new Set(["wide-row"]), { x: 120, y: 320 }),
    "new-parent"
  );
});

test("a branch cannot be dropped on its own descendant", () => {
  const nodes = [
    node("parent", { x: 0, y: 0 }, { width: 200, height: 100 }),
    node("child", { x: 260, y: 0 }, { width: 200, height: 100 }, { parentId: "parent" }),
  ];
  const edges = [edge("parent-child", "parent", "child")];

  assert.equal(
    findReparentDropTarget(nodes, edges, "parent", new Set(["parent"]), { x: 300, y: 40 }),
    null
  );
});
