import assert from "node:assert/strict";
import test from "node:test";
import type { Edge, Node } from "@xyflow/react";
import { createNodeRect, getNodeDimensions, getNodeRect, rectsOverlap } from "./geometry";
import { buildHierarchy } from "./hierarchy";
import {
  LIST_COLUMN_GUTTER,
  LIST_ROW_GAP,
  buildListConnectorModel,
  computeListLayout,
  diagnoseListLayout,
  getPreorderTraversal,
} from "./list-layout";

type TreeSpec = {
  id: string;
  parentId: string | null;
  width: number;
  height: number;
};

function buildTree(specs: TreeSpec[]): { nodes: Node[]; edges: Edge[] } {
  const childOrder = new Map<string, string[]>();
  for (const spec of specs) {
    if (spec.parentId) childOrder.set(spec.parentId, [...(childOrder.get(spec.parentId) ?? []), spec.id]);
  }
  const nodes = specs.map<Node>((spec, index) => ({
    id: spec.id,
    type: "shape",
    position: index === 0 ? { x: 320, y: 180 } : { x: index * 3, y: index * 2 },
    measured: { width: spec.width, height: spec.height },
    data: {
      text: spec.id,
      parentId: spec.parentId,
      childOrder: childOrder.get(spec.id) ?? [],
      ...(index === 0 ? { layoutMode: "list" } : {}),
    },
  }));
  const edges = specs
    .filter((spec): spec is TreeSpec & { parentId: string } => spec.parentId !== null)
    .map<Edge>((spec) => ({
      id: `edge-${spec.parentId}-${spec.id}`,
      source: spec.parentId,
      target: spec.id,
      type: "branch",
      data: { layoutMode: "list", curveStyle: "step", arrowEnd: true },
    }));
  return { nodes, edges };
}

function positionedNodes(nodes: Node[], placements: Record<string, { x: number; y: number }>): Node[] {
  return nodes.map((node) => ({ ...node, position: placements[node.id] ?? node.position }));
}

function assertNoOverlap(nodes: Node[]): void {
  for (let first = 0; first < nodes.length; first++) {
    for (let second = first + 1; second < nodes.length; second++) {
      assert.equal(
        rectsOverlap(getNodeRect(nodes[first]), getNodeRect(nodes[second]), 10),
        false,
        `${nodes[first].id} overlaps ${nodes[second].id}`
      );
    }
  }
}

test("geometry uses measured dimensions, safe fallbacks, and node origin", () => {
  const measured: Node = {
    id: "measured",
    position: { x: 200, y: 120 },
    origin: [0.5, 0.5],
    measured: { width: 240, height: 100 },
    style: { width: 10, height: 10 },
    data: {},
  };
  assert.deepEqual(getNodeDimensions(measured), { width: 240, height: 100 });
  assert.deepEqual(getNodeRect(measured), createNodeRect("measured", 80, 70, 240, 100));

  const fallback: Node = {
    id: "fallback",
    position: { x: 0, y: 0 },
    style: { width: "320px", height: Number.NaN },
    data: { height: 96 },
  };
  assert.deepEqual(getNodeDimensions(fallback), { width: 320, height: 96 });
});

test("List places a basic tree in stable preorder rows and columns", () => {
  const { nodes, edges } = buildTree([
    { id: "root", parentId: null, width: 220, height: 56 },
    { id: "child-a", parentId: "root", width: 180, height: 120 },
    { id: "grandchild-a1", parentId: "child-a", width: 260, height: 72 },
    { id: "child-b", parentId: "root", width: 190, height: 64 },
  ]);
  const hierarchy = buildHierarchy(nodes, edges);
  const traversal = getPreorderTraversal("root", hierarchy);
  assert.deepEqual(traversal.map((entry) => entry.nodeId), ["root", "child-a", "grandchild-a1", "child-b"]);
  assert.deepEqual(traversal.map((entry) => entry.depth), [0, 1, 2, 1]);

  const placements = computeListLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));
  const placed = positionedNodes(nodes, placements);
  const rects = new Map(placed.map((node) => [node.id, getNodeRect(node)]));
  assert.equal(rects.get("root")?.left, 320);
  assert.ok(rects.get("child-a")!.left > rects.get("root")!.right);
  assert.ok(rects.get("grandchild-a1")!.left > rects.get("child-a")!.right);
  assert.equal(rects.get("child-a")!.left, rects.get("child-b")!.left);
  assert.ok(rects.get("child-a")!.top >= rects.get("root")!.bottom + LIST_ROW_GAP);
  assert.ok(rects.get("grandchild-a1")!.top >= rects.get("child-a")!.bottom + LIST_ROW_GAP);
  assert.ok(rects.get("child-b")!.top > rects.get("grandchild-a1")!.bottom + LIST_ROW_GAP);
  assertNoOverlap(placed);
});

test("List row heights follow mixed rendered heights", () => {
  const heights = [56, 120, 72, 200, 64];
  const specs = heights.map((height, index): TreeSpec => ({
    id: `node-${index}`,
    parentId: index === 0 ? null : `node-${index - 1}`,
    width: 180,
    height,
  }));
  const { nodes, edges } = buildTree(specs);
  const hierarchy = buildHierarchy(nodes, edges);
  const traversal = getPreorderTraversal("node-0", hierarchy);
  const placements = computeListLayout("node-0", hierarchy, new Map(nodes.map((node) => [node.id, node])));
  const placed = positionedNodes(nodes, placements);
  const byId = new Map(placed.map((node) => [node.id, node]));
  for (let index = 1; index < traversal.length; index++) {
    const previous = getNodeRect(byId.get(traversal[index - 1].nodeId)!);
    const current = getNodeRect(byId.get(traversal[index].nodeId)!);
    assert.ok(current.top >= previous.bottom + LIST_ROW_GAP);
  }
});

test("wide nodes reserve the complete connector gutter before the next depth", () => {
  const { nodes, edges } = buildTree([
    { id: "root", parentId: null, width: 620, height: 80 },
    { id: "child", parentId: "root", width: 510, height: 80 },
    { id: "leaf", parentId: "child", width: 180, height: 80 },
  ]);
  const hierarchy = buildHierarchy(nodes, edges);
  const placements = computeListLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));
  const placed = new Map(positionedNodes(nodes, placements).map((node) => [node.id, getNodeRect(node)]));
  assert.ok(placed.get("child")!.left >= placed.get("root")!.right + LIST_COLUMN_GUTTER);
  assert.ok(placed.get("leaf")!.left >= placed.get("child")!.right + LIST_COLUMN_GUTTER);
});

test("persisted parent metadata wins over cross-links and preserves child order", () => {
  const { nodes, edges } = buildTree([
    { id: "root", parentId: null, width: 180, height: 60 },
    { id: "a", parentId: "root", width: 180, height: 60 },
    { id: "b", parentId: "root", width: 180, height: 60 },
    { id: "leaf", parentId: "a", width: 180, height: 60 },
  ]);
  const crossLink: Edge = { id: "cross-link", source: "b", target: "leaf", data: {} };
  const hierarchy = buildHierarchy(nodes, [crossLink, ...edges]);
  assert.equal(hierarchy.get("leaf")?.parentId, "a");
  assert.deepEqual(hierarchy.get("root")?.childIds, ["a", "b"]);
  assert.deepEqual(getPreorderTraversal("root", hierarchy).map((entry) => entry.nodeId), ["root", "a", "leaf", "b"]);
});

test("97-node outline has unique rows, no overlap, and clean grouped connectors", () => {
  const heights = [56, 120, 72, 200, 64];
  const specs: TreeSpec[] = Array.from({ length: 97 }, (_, index) => ({
    id: `n${index}`,
    parentId: index === 0 ? null : `n${Math.floor((index - 1) / 3)}`,
    width: 140 + ((index * 47) % 260),
    height: heights[index % heights.length],
  }));
  const { nodes, edges } = buildTree(specs);
  assert.equal(edges.length, 96);
  const hierarchy = buildHierarchy(nodes, edges);
  const traversal = getPreorderTraversal("n0", hierarchy);
  assert.equal(traversal.length, 97);
  assert.equal(new Set(traversal.map((entry) => entry.nodeId)).size, 97);

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const placements = computeListLayout("n0", hierarchy, byId);
  assert.equal(Object.keys(placements).length, 97);
  assert.equal(new Set(Object.values(placements).map((position) => `${position.x},${position.y}`)).size, 97);
  const diagnostics = diagnoseListLayout(traversal, placements, byId);
  assert.deepEqual(diagnostics.duplicateNodeIds, []);
  assert.deepEqual(diagnostics.nodesWithIdenticalPositions, []);
  assert.deepEqual(diagnostics.overlaps, []);

  const placed = positionedNodes(nodes, placements);
  assertNoOverlap(placed);
  const connectorModel = buildListConnectorModel(placed, edges);
  assert.deepEqual(connectorModel.duplicateEdgeIds, []);
  assert.deepEqual(connectorModel.duplicateHierarchyRelations, []);
  assert.deepEqual(connectorModel.duplicateVisibleConnectorSegments, []);
  assert.deepEqual(connectorModel.obstacleIntersections, []);
  assert.equal(connectorModel.groups.reduce((sum, group) => sum + group.branches.length, 0), 96);
});

test("duplicate logical hierarchy edges produce one visible child branch", () => {
  const tree = buildTree([
    { id: "root", parentId: null, width: 180, height: 60 },
    { id: "child", parentId: "root", width: 180, height: 60 },
  ]);
  const hierarchy = buildHierarchy(tree.nodes, tree.edges);
  const placements = computeListLayout("root", hierarchy, new Map(tree.nodes.map((node) => [node.id, node])));
  const nodes = positionedNodes(tree.nodes, placements);
  const duplicate = { ...tree.edges[0], id: "duplicate-relation" };
  const model = buildListConnectorModel(nodes, [...tree.edges, duplicate]);
  assert.deepEqual(model.duplicateHierarchyRelations, ["root->child"]);
  assert.equal(model.groups[0].branches.length, 1);
  assert.deepEqual(model.duplicateVisibleConnectorSegments, []);
});

test("growing an early row moves every following generated row down", () => {
  const tree = buildTree([
    { id: "root", parentId: null, width: 200, height: 56 },
    { id: "a", parentId: "root", width: 220, height: 72 },
    { id: "a1", parentId: "a", width: 200, height: 64 },
    { id: "b", parentId: "root", width: 220, height: 80 },
  ]);
  const hierarchy = buildHierarchy(tree.nodes, tree.edges);
  const before = computeListLayout("root", hierarchy, new Map(tree.nodes.map((node) => [node.id, node])));
  const resizedNodes = tree.nodes.map((node) => node.id === "a"
    ? { ...node, measured: { width: 220, height: 192 } }
    : node);
  const after = computeListLayout("root", hierarchy, new Map(resizedNodes.map((node) => [node.id, node])));
  assert.equal(after.root.y, before.root.y);
  assert.equal(after.a.y, before.a.y);
  assert.equal(after.a1.y - before.a1.y, 120);
  assert.equal(after.b.y - before.b.y, 120);
  assertNoOverlap(positionedNodes(resizedNodes, after));
});
