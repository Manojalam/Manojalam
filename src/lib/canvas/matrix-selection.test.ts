import assert from "node:assert/strict";
import test from "node:test";
import type { Node } from "@xyflow/react";
import { buildHierarchy } from "../layout/hierarchy";
import { sameLevelMatrixSelection } from "./matrix-selection";

function node(
  id: string,
  parentId?: string,
  data: Record<string, unknown> = {}
): Node {
  return {
    id,
    type: "shape",
    position: { x: 0, y: 0 },
    data: {
      ...(parentId ? { parentId } : {}),
      ...data,
    },
  };
}

test("same-level Matrix siblings expose their parent's arrangement", () => {
  const nodes = [
    node("root", undefined, { layoutMode: "matrix" }),
    node("child-a", "root", { matrixCell: true, matrixRootId: "root" }),
    node("child-b", "root", { matrixCell: true, matrixRootId: "root" }),
  ];
  const hierarchy = buildHierarchy(nodes, []);

  assert.deepEqual(
    sameLevelMatrixSelection([nodes[1], nodes[2]], nodes, hierarchy),
    { rootId: "root", depth: 1, parentIds: ["root"] }
  );
});

test("same-level Matrix cousins expose every represented sibling group", () => {
  const nodes = [
    node("root", undefined, { layoutMode: "matrix" }),
    node("parent-a", "root", { matrixCell: true, matrixRootId: "root" }),
    node("parent-b", "root", { matrixCell: true, matrixRootId: "root" }),
    node("cousin-a", "parent-a", { matrixCell: true, matrixRootId: "root" }),
    node("cousin-b", "parent-b", { matrixCell: true, matrixRootId: "root" }),
  ];
  const hierarchy = buildHierarchy(nodes, []);

  assert.deepEqual(
    sameLevelMatrixSelection([nodes[3], nodes[4]], nodes, hierarchy),
    { rootId: "root", depth: 2, parentIds: ["parent-a", "parent-b"] }
  );
});

test("mixed hierarchy levels do not expose one Matrix arrangement", () => {
  const nodes = [
    node("root", undefined, { layoutMode: "matrix" }),
    node("child", "root", { matrixCell: true, matrixRootId: "root" }),
    node("grandchild", "child", { matrixCell: true, matrixRootId: "root" }),
  ];
  const hierarchy = buildHierarchy(nodes, []);

  assert.equal(
    sameLevelMatrixSelection([nodes[1], nodes[2]], nodes, hierarchy),
    null
  );
});

test("selections spanning Matrix roots or non-Matrix nodes are rejected", () => {
  const nodes = [
    node("root-a", undefined, { layoutMode: "matrix" }),
    node("root-b", undefined, { layoutMode: "matrix" }),
    node("child-a", "root-a", { matrixCell: true, matrixRootId: "root-a" }),
    node("child-b", "root-b", { matrixCell: true, matrixRootId: "root-b" }),
    node("plain", "root-a"),
  ];
  const hierarchy = buildHierarchy(nodes, []);

  assert.equal(
    sameLevelMatrixSelection([nodes[2], nodes[3]], nodes, hierarchy),
    null
  );
  assert.equal(
    sameLevelMatrixSelection([nodes[2], nodes[4]], nodes, hierarchy),
    null
  );
});
