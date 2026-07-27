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
  inheritChildNodeStyle,
  inheritSiblingNodeStyle,
} from "./node-style-inheritance";

function node(id: string, parentId: string | null, childOrder: string[] = []): Node {
  return { id, type: "shape", position: { x: 0, y: 0 }, data: { parentId, childOrder } };
}

function edge(source: string, target: string): Edge {
  return { id: `${source}-${target}`, source, target, type: "branch" };
}

const createEdge = (source: string, target: string): Edge => edge(source, target);

test("a new sibling preserves manual colors without copying generated palette ownership", () => {
  const source = {
    text: "अ",
    fillColor: "#d9468d",
    borderColor: "#f8fafc",
    textColor: "#1d4ed8",
    fontSize: 22,
    layoutAutoFill: false,
    layoutAutoBorder: false,
    layoutAutoText: false,
    layoutAutoTypography: false,
    layoutVisualStyle: {
      rootId: "matrix-root",
      mode: "matrix",
      fillColor: "#ffffff",
    },
    matrixRootId: "matrix-root",
  };

  const childStyle = inheritChildNodeStyle(source);
  const siblingStyle = inheritSiblingNodeStyle(source);

  assert.equal(childStyle.fillColor, "#d9468d");
  assert.equal(childStyle.layoutAutoFill, undefined);
  assert.equal(siblingStyle.fillColor, "#d9468d");
  assert.equal(siblingStyle.layoutAutoFill, false);
  assert.equal(siblingStyle.layoutAutoBorder, false);
  assert.equal(siblingStyle.layoutAutoText, false);
  assert.equal(siblingStyle.layoutAutoTypography, false);
  assert.equal(siblingStyle.layoutVisualStyle, undefined);
  assert.equal(siblingStyle.matrixRootId, undefined);
  assert.equal(siblingStyle.text, undefined);
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
    [...hierarchyDeletionNodeIds(nodes, edges, selected, false)],
    ["parent", "child-a"]
  );
  assert.deepEqual(
    [...hierarchyDeletionNodeIds(nodes, edges, selected, true)],
    ["parent", "child-a", "grandchild", "child-b"]
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
