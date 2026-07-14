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

function positionedRects(nodes: Node[], placements: Record<string, { x: number; y: number }>): Map<string, ReturnType<typeof getNodeRect>> {
  return new Map(positionedNodes(nodes, placements).map((node) => [node.id, getNodeRect(node)]));
}

function assertNoOverlap(nodes: Node[]): void {
  for (let first = 0; first < nodes.length; first++) {
    for (let second = first + 1; second < nodes.length; second++) {
      assert.equal(
        rectsOverlap(getNodeRect(nodes[first]), getNodeRect(nodes[second]), 7),
        false,
        `${nodes[first].id} overlaps ${nodes[second].id}`
      );
    }
  }
}

function branchBounds(rects: Map<string, ReturnType<typeof getNodeRect>>, ids: string[]) {
  const branchRects = ids.map((id) => rects.get(id)!);
  return {
    left: Math.min(...branchRects.map((rect) => rect.left)),
    right: Math.max(...branchRects.map((rect) => rect.right)),
    top: Math.min(...branchRects.map((rect) => rect.top)),
    bottom: Math.max(...branchRects.map((rect) => rect.bottom)),
  };
}

const referenceSpecs: TreeSpec[] = [
  { id: "root", parentId: null, width: 220, height: 64 },
  { id: "a", parentId: "root", width: 180, height: 62 },
  { id: "a1", parentId: "a", width: 180, height: 58 },
  { id: "a2", parentId: "a", width: 200, height: 68 },
  { id: "a2a", parentId: "a2", width: 170, height: 56 },
  { id: "a2b", parentId: "a2", width: 210, height: 72 },
  { id: "a3", parentId: "a", width: 180, height: 60 },
  { id: "b", parentId: "root", width: 190, height: 62 },
  { id: "b1", parentId: "b", width: 170, height: 58 },
  { id: "b2", parentId: "b", width: 185, height: 64 },
  { id: "b3", parentId: "b", width: 180, height: 58 },
  { id: "c", parentId: "root", width: 210, height: 62 },
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

  const fallback: Node = {
    id: "fallback",
    position: { x: 0, y: 0 },
    style: { width: "320px", height: Number.NaN },
    data: { height: 96 },
  };
  assert.deepEqual(getNodeDimensions(fallback), { width: 320, height: 96 });
});

test("List creates independent branch columns with recursive child-under-parent rows", () => {
  const { nodes, edges } = buildTree(referenceSpecs);
  const hierarchy = buildHierarchy(nodes, edges);
  assert.deepEqual(
    getPreorderTraversal("root", hierarchy).map((entry) => entry.nodeId),
    ["root", "a", "a1", "a2", "a2a", "a2b", "a3", "b", "b1", "b2", "b3", "c", "c1"]
  );

  const placements = computeListLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));
  const rects = positionedRects(nodes, placements);
  const density = LIST_DENSITIES.compact;
  assert.deepEqual(placements.root, nodes[0].position, "the selected root remains fixed");
  assert.equal(rects.get("a")!.top, rects.get("b")!.top);
  assert.equal(rects.get("b")!.top, rects.get("c")!.top);
  assert.equal(rects.get("a")!.top, rects.get("root")!.top);
  assert.ok(
    rects.get("a")!.left >= rects.get("root")!.right + density.rootToBranchGapX,
    "the selected root stays to the left of the branch row"
  );

  assert.equal(rects.get("a1")!.left - rects.get("a")!.left, density.childIndentX);
  assert.equal(rects.get("a2a")!.left - rects.get("a2")!.left, density.childIndentX);
  assert.ok(rects.get("a1")!.top >= rects.get("a")!.bottom + density.parentChildGapY);
  assert.ok(rects.get("a2")!.top >= rects.get("a1")!.bottom + density.siblingSubtreeGapY);
  assert.ok(rects.get("a2a")!.top >= rects.get("a2")!.bottom + density.parentChildGapY);
  assert.ok(rects.get("a2b")!.top >= rects.get("a2a")!.bottom + density.siblingSubtreeGapY);
  assert.ok(rects.get("a3")!.top >= rects.get("a2b")!.bottom + density.siblingSubtreeGapY);

  const aBounds = branchBounds(rects, ["a", "a1", "a2", "a2a", "a2b", "a3"]);
  const bBounds = branchBounds(rects, ["b", "b1", "b2", "b3"]);
  const cBounds = branchBounds(rects, ["c", "c1"]);
  assert.ok(bBounds.left >= aBounds.right + density.branchColumnGapX);
  assert.ok(cBounds.left >= bBounds.right + density.branchColumnGapX);
  assertNoOverlap(positionedNodes(nodes, placements));
});

test("comfortable List density increases root, branch, and row clearances", () => {
  const { nodes, edges } = buildTree(referenceSpecs);
  const hierarchy = buildHierarchy(nodes, edges);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const compactRects = positionedRects(nodes, computeListLayout("root", hierarchy, byId, { density: "compact" }));
  const comfortablePlacements = computeListLayout("root", hierarchy, byId, { density: "comfortable" });
  const comfortableRects = positionedRects(nodes, comfortablePlacements);

  assert.ok(
    comfortableRects.get("a")!.left - comfortableRects.get("root")!.right
      > compactRects.get("a")!.left - compactRects.get("root")!.right
  );
  assert.ok(
    comfortableRects.get("b")!.left - comfortableRects.get("a")!.right
      > compactRects.get("b")!.left - compactRects.get("a")!.right
  );
  assert.ok(
    comfortableRects.get("a1")!.top - comfortableRects.get("a")!.bottom
      > compactRects.get("a1")!.top - compactRects.get("a")!.bottom
  );
  assertNoOverlap(positionedNodes(nodes, comfortablePlacements));
});

test("large sibling groups wrap into subtree-safe continuation lanes", () => {
  const leafSpecs: TreeSpec[] = Array.from({ length: 48 }, (_, index) => ({
    id: `leaf-${index}`,
    parentId: "branch",
    width: 180 + (index % 3) * 20,
    height: 64 + (index % 2) * 12,
  }));
  const { nodes, edges } = buildTree([
    { id: "root", parentId: null, width: 220, height: 72 },
    { id: "branch", parentId: "root", width: 220, height: 68 },
    ...leafSpecs,
  ]);
  const hierarchy = buildHierarchy(nodes, edges);
  const placements = computeListLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));
  const rects = positionedRects(nodes, placements);
  const leafRects = leafSpecs.map((spec) => rects.get(spec.id)!);
  const laneLefts = [...new Set(leafRects.map((rect) => Math.round(rect.left)))];
  const bodyTop = rects.get("branch")!.bottom + LIST_DENSITIES.compact.parentChildGapY;

  assert.ok(laneLefts.length >= 4, "a large sibling group should continue across several lanes");
  assert.ok(
    Math.max(...leafRects.map((rect) => rect.bottom)) - bodyTop
      <= LIST_DENSITIES.compact.maxColumnBodyHeight,
    "continuation lanes should cap the branch body height"
  );
  const placed = positionedNodes(nodes, placements);
  assertNoOverlap(placed);

  const connectorModel = buildListConnectorModel(placed, edges);
  const branchGroup = connectorModel.groups.find((group) => group.parentId === "branch");
  const childTrunkXs = new Set(branchGroup?.branches.map((branch) => branch.segments[0].x1));
  assert.equal(childTrunkXs.size, laneLefts.length);
  assert.ok(branchGroup?.branches.every((branch) => {
    const segment = branch.segments[0];
    return Math.abs(segment.x2 - segment.x1) <= LIST_DENSITIES.compact.connectorGutterX;
  }));
  assert.deepEqual(connectorModel.obstacleIntersections, []);
});

test("wide parents do not push descendants beyond one hierarchy indent", () => {
  const { nodes, edges } = buildTree([
    { id: "root", parentId: null, width: 620, height: 80 },
    { id: "child", parentId: "root", width: 510, height: 80 },
    { id: "leaf", parentId: "child", width: 180, height: 80 },
  ]);
  const hierarchy = buildHierarchy(nodes, edges);
  const placements = computeListLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));
  const rects = positionedRects(nodes, placements);
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

test("child insertion shifts only the later rows in its branch", () => {
  const beforeTree = buildTree(referenceSpecs);
  const beforeHierarchy = buildHierarchy(beforeTree.nodes, beforeTree.edges);
  const before = computeListLayout("root", beforeHierarchy, new Map(beforeTree.nodes.map((node) => [node.id, node])));

  const insertedSpecs = referenceSpecs.flatMap((spec) => spec.id === "a2b"
    ? [spec, { id: "a2c", parentId: "a2", width: 180, height: 60 }]
    : [spec]);
  const afterTree = buildTree(insertedSpecs);
  const afterHierarchy = buildHierarchy(afterTree.nodes, afterTree.edges);
  const after = computeListLayout("root", afterHierarchy, new Map(afterTree.nodes.map((node) => [node.id, node])));
  const afterRects = positionedRects(afterTree.nodes, after);

  assert.equal(after.a.x, before.a.x);
  assert.equal(after.a2.x, before.a2.x);
  assert.equal(after.a2.y, before.a2.y);
  assert.ok(afterRects.get("a2c")!.top > afterRects.get("a2b")!.bottom);
  assert.ok(after.a3.y > before.a3.y);
  for (const nodeId of ["b", "b1", "b2", "b3", "c", "c1"]) {
    assert.deepEqual(after[nodeId], before[nodeId], `${nodeId} should remain fixed`);
  }
});

test("sibling insertion follows the selected sibling's complete subtree", () => {
  const specs = referenceSpecs.flatMap((spec) => spec.id === "a2b"
    ? [spec, { id: "a-new", parentId: "a", width: 180, height: 60 }]
    : [spec]);
  const { nodes, edges } = buildTree(specs);
  const hierarchy = buildHierarchy(nodes, edges);
  const placements = computeListLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));
  const rects = positionedRects(nodes, placements);
  assert.ok(rects.get("a-new")!.top > rects.get("a2b")!.bottom);
  assert.ok(rects.get("a3")!.top > rects.get("a-new")!.bottom);
});

test("97-node tree has unique placements, no overlap, and clean grouped connectors", () => {
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

  const placed = positionedNodes(nodes, placements);
  assertNoOverlap(placed);
  const connectorModel = buildListConnectorModel(placed, edges);
  assert.deepEqual(connectorModel.duplicateEdgeIds, []);
  assert.deepEqual(connectorModel.duplicateHierarchyRelations, []);
  assert.deepEqual(connectorModel.duplicateVisibleConnectorSegments, []);
  assert.deepEqual(connectorModel.obstacleIntersections, []);
  assert.equal(connectorModel.groups.reduce((sum, group) => sum + group.branches.length, 0), 96);
  assert.ok(connectorModel.groups.every((group) => group.branches.every((branch) => (
    branch.segments.every((segment) => (
      Math.abs(segment.x2 - segment.x1) + Math.abs(segment.y2 - segment.y1) <= LIST_COLUMN_GUTTER
    ))
  ))));
});

test("connector model uses a horizontal root bus and vertical nested trunks", () => {
  const tree = buildTree(referenceSpecs);
  const hierarchy = buildHierarchy(tree.nodes, tree.edges);
  const placements = computeListLayout("root", hierarchy, new Map(tree.nodes.map((node) => [node.id, node])));
  const model = buildListConnectorModel(positionedNodes(tree.nodes, placements), tree.edges);
  const rootGroup = model.groups.find((group) => group.parentId === "root");
  const rects = positionedRects(tree.nodes, placements);
  assert.equal(rootGroup?.orientation, "horizontal");
  assert.equal(rootGroup?.sharedSegments[0].x1, rects.get("root")!.right);
  assert.equal(rootGroup?.sharedSegments[0].y1, rects.get("root")!.centerY);
  assert.ok((rootGroup?.sharedSegments[2].y1 ?? Number.POSITIVE_INFINITY) < rects.get("a")!.top);
  assert.equal(model.groups.find((group) => group.parentId === "a")?.orientation, "vertical");
  assert.deepEqual(model.obstacleIntersections, []);
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
  assert.deepEqual(model.duplicateVisibleConnectorSegments, []);
});

test("growing a branch row moves its later rows without moving other columns", () => {
  const tree = buildTree(referenceSpecs);
  const hierarchy = buildHierarchy(tree.nodes, tree.edges);
  const before = computeListLayout("root", hierarchy, new Map(tree.nodes.map((node) => [node.id, node])));
  const resizedNodes = tree.nodes.map((node) => node.id === "a2"
    ? { ...node, measured: { width: 200, height: 188 } }
    : node);
  const after = computeListLayout("root", hierarchy, new Map(resizedNodes.map((node) => [node.id, node])));
  assert.deepEqual(after.root, before.root);
  assert.deepEqual(after.a2, before.a2);
  assert.equal(after.a2a.y - before.a2a.y, 120);
  assert.equal(after.a3.y - before.a3.y, 120);
  for (const nodeId of ["b", "b1", "b2", "b3", "c", "c1"]) {
    assert.deepEqual(after[nodeId], before[nodeId], `${nodeId} should remain fixed`);
  }
  assertNoOverlap(positionedNodes(resizedNodes, after));
});

test("branch-local reflow keeps earlier headers anchored and shifts only later columns", () => {
  const tree = buildTree(referenceSpecs);
  const hierarchy = buildHierarchy(tree.nodes, tree.edges);
  const initial = computeListLayout("root", hierarchy, new Map(tree.nodes.map((node) => [node.id, node])));
  const initiallyPlaced = positionedNodes(tree.nodes, initial);
  const resized = initiallyPlaced.map((node) => node.id === "a2a"
    ? { ...node, measured: { width: 520, height: 56 } }
    : node);
  const reflowed = computeListLayout(
    "root",
    hierarchy,
    new Map(resized.map((node) => [node.id, node])),
    { preserveBranchAnchors: true }
  );

  assert.deepEqual(reflowed.a, initial.a, "the changed branch header stays anchored");
  assert.ok(reflowed.b.x > initial.b.x, "the next branch moves only enough to clear the wider branch");
  assert.ok(reflowed.c.x >= initial.c.x, "later branches never move backward during local growth");
  assertNoOverlap(positionedNodes(resized, reflowed));
});
