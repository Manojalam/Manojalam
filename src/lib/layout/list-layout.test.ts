import assert from "node:assert/strict";
import test from "node:test";
import type { Edge, Node } from "@xyflow/react";
import { createNodeRect, getNodeDimensions, getNodeRect, rectsOverlap } from "./geometry";
import { buildHierarchy } from "./hierarchy";
import {
  LIST_COLUMN_GUTTER,
  LIST_DENSITIES,
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
      ...(index === 0 ? { layoutMode: "list", listDensity: "compact" } : {}),
    },
  }));
  const edges = specs
    .filter((spec): spec is TreeSpec & { parentId: string } => spec.parentId !== null)
    .map<Edge>((spec) => ({
      id: `edge-${spec.parentId}-${spec.id}`,
      source: spec.parentId,
      target: spec.id,
      type: "branch",
      data: { layoutMode: "list", curveStyle: "step" },
    }));
  return { nodes, edges };
}

function positionedNodes(nodes: Node[], placements: Record<string, { x: number; y: number }>): Node[] {
  return nodes.map((node) => ({ ...node, position: placements[node.id] ?? node.position }));
}

function positionedRects(nodes: Node[], placements: Record<string, { x: number; y: number }>) {
  return new Map(positionedNodes(nodes, placements).map((node) => [node.id, getNodeRect(node)]));
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

const referenceSpecs: TreeSpec[] = [
  { id: "root", parentId: null, width: 220, height: 72 },
  { id: "a", parentId: "root", width: 190, height: 64 },
  { id: "a1", parentId: "a", width: 180, height: 58 },
  { id: "a2", parentId: "a", width: 210, height: 76 },
  { id: "a2a", parentId: "a2", width: 170, height: 56 },
  { id: "a2b", parentId: "a2", width: 220, height: 94 },
  { id: "a3", parentId: "a", width: 180, height: 60 },
  { id: "b", parentId: "root", width: 200, height: 68 },
  { id: "b1", parentId: "b", width: 170, height: 58 },
  { id: "b2", parentId: "b", width: 185, height: 64 },
  { id: "c", parentId: "root", width: 210, height: 70 },
  { id: "c1", parentId: "c", width: 190, height: 70 },
];

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
});

test("List creates one strongly indented depth-first outline", () => {
  const { nodes, edges } = buildTree(referenceSpecs);
  const hierarchy = buildHierarchy(nodes, edges);
  const traversal = getPreorderTraversal("root", hierarchy);
  const placements = computeListLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));
  const rects = positionedRects(nodes, placements);
  const density = LIST_DENSITIES.compact;

  assert.deepEqual(traversal.map((entry) => entry.nodeId), [
    "root", "a", "a1", "a2", "a2a", "a2b", "a3", "b", "b1", "b2", "c", "c1",
  ]);
  assert.deepEqual(placements.root, nodes[0].position, "the selected root remains fixed");

  for (let index = 1; index < traversal.length; index++) {
    const previous = rects.get(traversal[index - 1].nodeId)!;
    const current = rects.get(traversal[index].nodeId)!;
    assert.ok(current.top > previous.bottom, `${traversal[index].nodeId} must occupy its own later row`);
  }
  for (const entry of traversal) {
    assert.equal(
      rects.get(entry.nodeId)!.left,
      rects.get("root")!.left + entry.depth * density.childIndentX,
      `${entry.nodeId} should visibly reflect hierarchy depth`
    );
  }
  assert.ok(rects.get("b")!.top - rects.get("a3")!.bottom >= density.rowGapY + density.majorBranchGapY);
  assertNoOverlap(positionedNodes(nodes, placements));
});

test("Fold continues a long List branch in an adjacent vertical group", () => {
  const specs: TreeSpec[] = [
    { id: "root", parentId: null, width: 220, height: 72 },
    ...Array.from({ length: 10 }, (_, index) => ({
      id: `child-${index}`,
      parentId: "root",
      width: 180,
      height: 58,
    })),
  ];
  const fixture = buildTree(specs);
  const nodes = fixture.nodes.map((node) => node.id === "root"
    ? { ...node, data: { ...node.data, layoutWrapAfter: 5 } }
    : node);
  const hierarchy = buildHierarchy(nodes, fixture.edges);
  const placements = computeListLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));
  const placed = positionedNodes(nodes, placements);
  const first = getNodeRect(placed.find((node) => node.id === "child-0")!);
  const sixth = getNodeRect(placed.find((node) => node.id === "child-5")!);
  const model = buildListConnectorModel(placed, fixture.edges);

  assert.equal(first.top, sixth.top);
  assert.ok(sixth.left > first.right);
  assert.equal(model.groups.find((group) => group.parentId === "root")?.branches.length, 10);
  assert.deepEqual(model.obstacleIntersections, []);
  assertNoOverlap(placed);
});

test("comfortable density increases indentation and row clearance", () => {
  const { nodes, edges } = buildTree(referenceSpecs);
  const hierarchy = buildHierarchy(nodes, edges);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const compact = positionedRects(nodes, computeListLayout("root", hierarchy, byId, { density: "compact" }));
  const comfortablePlacements = computeListLayout("root", hierarchy, byId, { density: "comfortable" });
  const comfortable = positionedRects(nodes, comfortablePlacements);

  assert.ok(comfortable.get("a")!.left - comfortable.get("root")!.left
    > compact.get("a")!.left - compact.get("root")!.left);
  assert.ok(comfortable.get("a1")!.top - comfortable.get("a")!.bottom
    > compact.get("a1")!.top - compact.get("a")!.bottom);
  assertNoOverlap(positionedNodes(nodes, comfortablePlacements));
});

test("wide parents do not alter the fixed depth indentation", () => {
  const { nodes, edges } = buildTree([
    { id: "root", parentId: null, width: 620, height: 80 },
    { id: "child", parentId: "root", width: 510, height: 80 },
    { id: "leaf", parentId: "child", width: 180, height: 80 },
  ]);
  const hierarchy = buildHierarchy(nodes, edges);
  const placements = computeListLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));
  const rects = positionedRects(nodes, placements);
  assert.equal(rects.get("child")!.left - rects.get("root")!.left, LIST_COLUMN_GUTTER);
  assert.equal(rects.get("leaf")!.left - rects.get("child")!.left, LIST_COLUMN_GUTTER);
  assertNoOverlap(positionedNodes(nodes, placements));
});

test("persisted parent metadata wins over cross-links and preserves child order", () => {
  const { nodes, edges } = buildTree([
    { id: "root", parentId: null, width: 180, height: 60 },
    { id: "a", parentId: "root", width: 180, height: 60 },
    { id: "b", parentId: "root", width: 180, height: 60 },
    { id: "leaf", parentId: "a", width: 180, height: 60 },
  ]);
  const hierarchy = buildHierarchy(nodes, [{ id: "cross-link", source: "b", target: "leaf", data: {} }, ...edges]);
  assert.equal(hierarchy.get("leaf")?.parentId, "a");
  assert.deepEqual(hierarchy.get("root")?.childIds, ["a", "b"]);
  assert.deepEqual(getPreorderTraversal("root", hierarchy).map((entry) => entry.nodeId), ["root", "a", "leaf", "b"]);
});

test("child insertion follows the parent's existing complete child subtrees", () => {
  const insertedSpecs = referenceSpecs.flatMap((spec) => spec.id === "a2b"
    ? [spec, { id: "a2c", parentId: "a2", width: 180, height: 60 }]
    : [spec]);
  const { nodes, edges } = buildTree(insertedSpecs);
  const hierarchy = buildHierarchy(nodes, edges);
  const placements = computeListLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));
  const order = getPreorderTraversal("root", hierarchy).map((entry) => entry.nodeId);
  const rects = positionedRects(nodes, placements);

  assert.ok(order.indexOf("a2c") > order.indexOf("a2b"));
  assert.ok(order.indexOf("a2c") < order.indexOf("a3"));
  assert.ok(rects.get("a2c")!.top > rects.get("a2b")!.bottom);
  assert.ok(rects.get("a3")!.top > rects.get("a2c")!.bottom);
});

test("sibling insertion occurs after the selected sibling's complete subtree", () => {
  const specs = referenceSpecs.flatMap((spec) => spec.id === "a2b"
    ? [spec, { id: "a-new", parentId: "a", width: 180, height: 60 }]
    : [spec]);
  const { nodes, edges } = buildTree(specs);
  const hierarchy = buildHierarchy(nodes, edges);
  const order = getPreorderTraversal("root", hierarchy).map((entry) => entry.nodeId);
  assert.ok(order.indexOf("a-new") > order.indexOf("a2b"));
  assert.ok(order.indexOf("a-new") < order.indexOf("a3"));
});

test("97-node outline has one readable row per node and no overlap", () => {
  const heights = [56, 120, 72, 200, 64];
  const specs: TreeSpec[] = Array.from({ length: 97 }, (_, index) => ({
    id: `n${index}`,
    parentId: index === 0 ? null : `n${Math.floor((index - 1) / 3)}`,
    width: 140 + ((index * 47) % 260),
    height: heights[index % heights.length],
  }));
  const { nodes, edges } = buildTree(specs);
  const hierarchy = buildHierarchy(nodes, edges);
  const traversal = getPreorderTraversal("n0", hierarchy);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const placements = computeListLayout("n0", hierarchy, byId);
  const diagnostics = diagnoseListLayout(traversal, placements, byId);

  assert.equal(traversal.length, 97);
  assert.equal(new Set(traversal.map((entry) => entry.nodeId)).size, 97);
  assert.equal(Object.keys(placements).length, 97);
  assert.deepEqual(diagnostics.duplicateNodeIds, []);
  assert.deepEqual(diagnostics.nodesWithIdenticalPositions, []);
  assert.deepEqual(diagnostics.overlaps, []);
  assertNoOverlap(positionedNodes(nodes, placements));
});

test("List connectors use one vertical trunk per parent with short child stubs", () => {
  const tree = buildTree(referenceSpecs);
  const hierarchy = buildHierarchy(tree.nodes, tree.edges);
  const placements = computeListLayout("root", hierarchy, new Map(tree.nodes.map((node) => [node.id, node])));
  const model = buildListConnectorModel(positionedNodes(tree.nodes, placements), tree.edges);

  assert.ok(model.groups.every((group) => group.orientation === "vertical"));
  assert.ok(model.groups.every((group) => group.branches.every((branch) => {
    const segment = branch.segments[0];
    return Math.abs(segment.x2 - segment.x1) <= LIST_DENSITIES.compact.connectorGutterX;
  })));
  assert.deepEqual(model.duplicateVisibleConnectorSegments, []);
  assert.deepEqual(model.obstacleIntersections, []);
});

test("manually moved List endpoints remain on shared hierarchy trunks", () => {
  const tree = buildTree(referenceSpecs);
  const hierarchy = buildHierarchy(tree.nodes, tree.edges);
  const placements = computeListLayout("root", hierarchy, new Map(tree.nodes.map((node) => [node.id, node])));
  const nodes = positionedNodes(tree.nodes, placements).map((node) => node.id === "a2"
    ? {
        ...node,
        position: { x: node.position.x + 36, y: node.position.y + 18 },
        data: { ...node.data, listManualOverride: true },
      }
    : node);
  const model = buildListConnectorModel(nodes, tree.edges);
  const parentGroup = model.groups.find((group) => group.parentId === "a");

  assert.ok(parentGroup);
  assert.equal(parentGroup!.branches.some((branch) => branch.childId === "a2"), true);
  assert.equal(model.groups.some((group) => group.parentId === "a2"), true);
});

test("duplicate logical hierarchy edges produce one visible child branch", () => {
  const tree = buildTree([
    { id: "root", parentId: null, width: 180, height: 60 },
    { id: "child", parentId: "root", width: 180, height: 60 },
  ]);
  const hierarchy = buildHierarchy(tree.nodes, tree.edges);
  const placements = computeListLayout("root", hierarchy, new Map(tree.nodes.map((node) => [node.id, node])));
  const duplicate = { ...tree.edges[0], id: "duplicate-relation" };
  const model = buildListConnectorModel(positionedNodes(tree.nodes, placements), [...tree.edges, duplicate]);
  assert.deepEqual(model.duplicateHierarchyRelations, ["root->child"]);
  assert.equal(model.groups[0].branches.length, 1);
});

test("growing a row moves every later outline row by the growth amount", () => {
  const tree = buildTree(referenceSpecs);
  const hierarchy = buildHierarchy(tree.nodes, tree.edges);
  const before = computeListLayout("root", hierarchy, new Map(tree.nodes.map((node) => [node.id, node])));
  const resizedNodes = tree.nodes.map((node) => node.id === "a2"
    ? { ...node, measured: { width: 210, height: 196 } }
    : node);
  const after = computeListLayout("root", hierarchy, new Map(resizedNodes.map((node) => [node.id, node])));
  const order = getPreorderTraversal("root", hierarchy).map((entry) => entry.nodeId);
  const changedIndex = order.indexOf("a2");

  assert.deepEqual(after.a2, before.a2);
  for (const nodeId of order.slice(changedIndex + 1)) {
    assert.equal(after[nodeId].y - before[nodeId].y, 120, `${nodeId} should move with the later rows`);
  }
  assertNoOverlap(positionedNodes(resizedNodes, after));
});
