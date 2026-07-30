import assert from "node:assert/strict";
import test from "node:test";
import type { Edge, Node } from "@xyflow/react";
import { buildHierarchy } from "../layout/hierarchy";
import {
  deleteNodesPreservingHierarchy,
  hierarchyDeletionNodeIds,
  reparentHierarchy,
  unselectedHierarchyDescendants,
} from "./hierarchy-mutations";
import {
  matrixMeasurementNeedsReflow,
  patchNeedsListReflow,
  patchNeedsMatrixReflow,
} from "./layout-reflow";

function node(id: string, parentId: string | null, childOrder: string[] = []): Node {
  return { id, type: "shape", position: { x: 0, y: 0 }, data: { parentId, childOrder } };
}

function edge(source: string, target: string): Edge {
  return { id: `${source}-${target}`, source, target, type: "branch" };
}

const createEdge = (source: string, target: string): Edge => edge(source, target);

test("Matrix fill-anchor edits refresh automatic descendants immediately", () => {
  assert.equal(patchNeedsMatrixReflow({
    fillColor: "#8b5cf6",
    layoutAutoFill: false,
  }), true);
  assert.equal(patchNeedsMatrixReflow({ fillOpacity: 0.7 }), true);
  assert.equal(patchNeedsMatrixReflow({ matrixOuterBorderVisible: false }), true);
  assert.equal(patchNeedsMatrixReflow({ matrixFoldRootMode: "divided" }), true);
  assert.equal(patchNeedsMatrixReflow({ textColor: "#1d4ed8" }), false);
  assert.equal(patchNeedsListReflow({ fillColor: "#8b5cf6" }), false);
});

test("Matrix typography changes preserve layout-owned cell geometry", () => {
  const current = {
    text: "स्थानेऽन्तरतमः",
    richText: "<p>स्थानेऽन्तरतमः</p>",
    fontSize: 17,
  };

  assert.equal(patchNeedsMatrixReflow({ fontSize: 24 }, current), false);
  assert.equal(patchNeedsMatrixReflow({
    fontSize: 24,
    richText: '<p><span style="font-size: 24px">स्थानेऽन्तरतमः</span></p>',
    layoutAutoTypography: false,
  }, current), false);
  assert.equal(patchNeedsMatrixReflow({
    text: "स्थानेऽन्तरतमम्",
    richText: "<p>स्थानेऽन्तरतमम्</p>",
  }, current), true);
  assert.equal(matrixMeasurementNeedsReflow("format"), false);
  assert.equal(matrixMeasurementNeedsReflow("layout"), false);
  assert.equal(matrixMeasurementNeedsReflow("input"), true);
});

test("deleting a parent promotes its children to the grandparent in sibling order", () => {
  const nodes = [
    node("grandparent", null, ["before", "parent", "after"]),
    node("before", "grandparent"),
    node("parent", "grandparent", ["child-a", "child-b"]),
    node("child-a", "parent"),
    node("child-b", "parent"),
    node("after", "grandparent"),
  ];
  const edges = [
    edge("grandparent", "before"), edge("grandparent", "parent"),
    edge("parent", "child-a"), edge("parent", "child-b"), edge("grandparent", "after"),
  ];

  const result = deleteNodesPreservingHierarchy(nodes, edges, new Set(["parent"]), createEdge);
  const hierarchy = buildHierarchy(result.nodes, result.edges);

  assert.deepEqual(hierarchy.get("grandparent")?.childIds, ["before", "child-a", "child-b", "after"]);
  assert.equal(hierarchy.get("child-a")?.parentId, "grandparent");
  assert.equal(hierarchy.get("child-b")?.parentId, "grandparent");
  assert.ok(result.edges.some((candidate) => candidate.source === "grandparent" && candidate.target === "child-a"));
  assert.ok(result.edges.every((candidate) => candidate.source !== "parent" && candidate.target !== "parent"));
});

test("deleting consecutive ancestors promotes surviving descendants to the nearest survivor", () => {
  const nodes = [
    node("root", null, ["parent"]),
    node("parent", "root", ["middle"]),
    node("middle", "parent", ["leaf"]),
    node("leaf", "middle"),
  ];
  const edges = [edge("root", "parent"), edge("parent", "middle"), edge("middle", "leaf")];

  const result = deleteNodesPreservingHierarchy(nodes, edges, new Set(["parent", "middle"]), createEdge);
  const hierarchy = buildHierarchy(result.nodes, result.edges);

  assert.equal(hierarchy.get("leaf")?.parentId, "root");
  assert.deepEqual(hierarchy.get("root")?.childIds, ["leaf"]);
});

test("hierarchy deletion choices identify surviving descendants or expand the whole branch", () => {
  const nodes = [
    node("root", null, ["parent", "sibling"]),
    node("parent", "root", ["child-a", "child-b"]),
    node("child-a", "parent", ["grandchild"]),
    node("grandchild", "child-a"),
    node("child-b", "parent"),
    node("sibling", "root"),
    {
      id: "parent-note",
      type: "text",
      position: { x: 0, y: 0 },
      data: { externalNote: true, noteForNodeId: "parent" },
    },
    {
      id: "grandchild-note",
      type: "text",
      position: { x: 0, y: 0 },
      data: { externalNote: true, noteForNodeId: "grandchild" },
    },
    {
      id: "sibling-note",
      type: "text",
      position: { x: 0, y: 0 },
      data: { externalNote: true, noteForNodeId: "sibling" },
    },
  ];
  const edges = [
    edge("root", "parent"),
    edge("parent", "child-a"),
    edge("child-a", "grandchild"),
    edge("parent", "child-b"),
    edge("root", "sibling"),
  ];
  const selected = new Set(["parent", "child-a"]);

  assert.deepEqual(
    unselectedHierarchyDescendants(nodes, edges, selected),
    ["grandchild", "child-b"]
  );
  assert.deepEqual(
    [...hierarchyDeletionNodeIds(nodes, edges, selected, false)].sort(),
    ["parent", "child-a", "parent-note"].sort()
  );
  assert.deepEqual(
    [...hierarchyDeletionNodeIds(nodes, edges, selected, true)].sort(),
    ["parent", "child-a", "grandchild", "child-b", "parent-note", "grandchild-note"].sort()
  );
});

test("drag reparenting moves the canonical edge and rejects descendant cycles", () => {
  const nodes = [
    node("root", null, ["left", "right"]),
    node("left", "root", ["leaf"]),
    node("right", "root"),
    node("leaf", "left"),
  ];
  const edges = [edge("root", "left"), edge("root", "right"), edge("left", "leaf")];

  const moved = reparentHierarchy(nodes, edges, "leaf", "right", createEdge);
  const hierarchy = buildHierarchy(moved.nodes, moved.edges);
  assert.equal(hierarchy.get("leaf")?.parentId, "right");
  assert.deepEqual(hierarchy.get("left")?.childIds, []);
  assert.deepEqual(hierarchy.get("right")?.childIds, ["leaf"]);
  assert.ok(moved.edges.some((candidate) => candidate.source === "right" && candidate.target === "leaf"));

  const cycle = reparentHierarchy(nodes, edges, "left", "leaf", createEdge);
  assert.equal(cycle.changed, false);
});
