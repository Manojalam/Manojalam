import assert from "node:assert/strict";
import test from "node:test";
import type { Edge, Node } from "@xyflow/react";
import { createNodeRect, getNodeDimensions, getNodeRect, rectsOverlap } from "./geometry";
import { buildHierarchy } from "./hierarchy";
import {
  LIST_COLUMN_GUTTER,
  LIST_DENSITIES,
  buildListConnectorModel,
  computeListFoldRootSizes,
  computeListLayout,
  computeListRootTopPlacement,
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
  assert.deepEqual(placements.root, nodes[0].position, "the selected root keeps its authored anchor");

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
    ? { ...node, data: { ...node.data, layoutFoldCount: 2 } }
    : node);
  const hierarchy = buildHierarchy(nodes, fixture.edges);
  const placements = computeListLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));
  const naturalPlaced = positionedNodes(nodes, placements);
  const foldSizes = computeListFoldRootSizes(
    "root",
    hierarchy,
    new Map(nodes.map((node) => [node.id, node])),
    placements
  );
  const placed = naturalPlaced.map((node) => {
    const size = foldSizes.get(node.id);
    return size ? { ...node, measured: size, style: size } : node;
  });
  const first = getNodeRect(placed.find((node) => node.id === "child-0")!);
  const sixth = getNodeRect(placed.find((node) => node.id === "child-5")!);
  const naturalRoot = getNodeRect(naturalPlaced.find((node) => node.id === "root")!);
  const root = getNodeRect(placed.find((node) => node.id === "root")!);
  const headers = placed
    .filter((node) => node.id !== "root")
    .map((node) => getNodeRect(node));
  const model = buildListConnectorModel(placed, fixture.edges);
  const rootGroup = model.groups.find((group) => group.parentId === "root");

  assert.equal(first.top, sixth.top);
  assert.ok(sixth.left > first.right);
  assert.equal(root.left, naturalRoot.left);
  assert.ok(root.right >= Math.max(...headers.map((rect) => rect.right)) + 24);
  assert.equal(
    Math.min(...headers.map((rect) => rect.top)) - root.bottom,
    LIST_DENSITIES.compact.rootToFirstRowGapY
  );
  assert.equal(rootGroup?.branches.length, 10);
  assert.equal(rootGroup?.sharedSegments.length, 2);
  assert.equal(model.rootCopies.length, 0);
  const firstBranch = rootGroup?.branches.find((branch) => branch.childId === "child-0")?.segments[0];
  const sixthBranch = rootGroup?.branches.find((branch) => branch.childId === "child-5")?.segments[0];
  assert.ok(firstBranch);
  assert.ok(sixthBranch);
  assert.equal(firstBranch!.x1, first.left - LIST_DENSITIES.compact.connectorGutterX);
  assert.equal(firstBranch!.x2, first.left);
  assert.equal(sixthBranch!.x1, sixth.left - LIST_DENSITIES.compact.connectorGutterX);
  assert.equal(sixthBranch!.x2, sixth.left);
  assert.notEqual(firstBranch!.x1, sixthBranch!.x1);
  assert.deepEqual(
    new Set(rootGroup?.sharedSegments.map((segment) => segment.x1)),
    new Set([firstBranch!.x1, sixthBranch!.x1])
  );
  assert.ok(rootGroup?.sharedSegments.every((segment) => segment.y1 === root.bottom));
  assert.deepEqual(model.duplicateVisibleConnectorSegments, []);
  assert.deepEqual(model.obstacleIntersections, []);
  assertNoOverlap(placed);
});

test("Duplicated List Fold roots repeat above sections and emit independent trunks", () => {
  const specs: TreeSpec[] = [
    { id: "root", parentId: null, width: 220, height: 72 },
    ...Array.from({ length: 6 }, (_, index) => ({
      id: `child-${index}`,
      parentId: "root",
      width: 180,
      height: 58,
    })),
  ];
  const fixture = buildTree(specs);
  const nodes = fixture.nodes.map((node) => node.id === "root"
    ? {
        ...node,
        data: {
          ...node.data,
          layoutFoldCount: 2,
          listFoldRootMode: "divided",
        },
      }
    : node);
  const hierarchy = buildHierarchy(nodes, fixture.edges);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const placements = computeListLayout("root", hierarchy, byId);
  const placed = positionedNodes(nodes, placements);
  const model = buildListConnectorModel(placed, fixture.edges);
  const rootGroup = model.groups.find((group) => group.parentId === "root")!;
  const rootRect = getNodeRect(placed.find((node) => node.id === "root")!);
  const copy = model.rootCopies[0];

  assert.equal(computeListFoldRootSizes("root", hierarchy, byId, placements).has("root"), false);
  assert.equal(rootGroup.sharedSegments.length, 2);
  assert.equal(model.rootCopies.length, 1);
  assert.equal(copy.sourceNodeId, "root");
  assert.equal(copy.y, rootRect.top);
  assert.equal(copy.width, rootRect.width);
  assert.equal(copy.height, rootRect.height);
  assert.ok(copy.x > rootRect.right);
  assert.deepEqual(
    rootGroup.sharedSegments.map((segment) => segment.y1),
    [rootRect.bottom, copy.y + copy.height]
  );
  assert.deepEqual(model.duplicateVisibleConnectorSegments, []);
});

test("Fold preserves a manually positioned List root", () => {
  const fixture = buildTree([
    { id: "root", parentId: null, width: 220, height: 72 },
    ...Array.from({ length: 6 }, (_, index) => ({
      id: `child-${index}`,
      parentId: "root",
      width: 180,
      height: 58,
    })),
  ]);
  const nodes = fixture.nodes.map((node) => node.id === "root"
    ? {
        ...node,
        position: { x: 40, y: 520 },
        data: { ...node.data, layoutFoldCount: 2, listManualOverride: true },
      }
    : node);
  const hierarchy = buildHierarchy(nodes, fixture.edges);
  const placements = computeListLayout(
    "root",
    hierarchy,
    new Map(nodes.map((node) => [node.id, node])),
    { preserveManualOverrides: true }
  );
  assert.deepEqual(placements.root, { x: 40, y: 520 });
});

test("an unfolded List preserves a manually moved root during content reflow", () => {
  const fixture = buildTree([
    { id: "root", parentId: null, width: 220, height: 72 },
    { id: "first", parentId: "root", width: 180, height: 58 },
    { id: "second", parentId: "root", width: 180, height: 58 },
  ]);
  const nodes = fixture.nodes.map((node) => {
    if (node.id === "root") {
      return {
        ...node,
        position: { x: 40, y: 520 },
        data: { ...node.data, listManualOverride: true },
      };
    }
    if (node.id === "first") {
      return {
        ...node,
        position: { x: 280, y: 100 },
        data: { ...node.data, listManualOverride: true },
      };
    }
    return node;
  });
  const hierarchy = buildHierarchy(nodes, fixture.edges);
  const placements = computeListLayout(
    "root",
    hierarchy,
    new Map(nodes.map((node) => [node.id, node])),
    { preserveManualOverrides: true }
  );
  assert.deepEqual(placements.root, { x: 40, y: 520 });
});

test("saved List geometry receives a root header without rearranging descendants", () => {
  const fixture = buildTree([
    { id: "root", parentId: null, width: 168, height: 40 },
    { id: "first", parentId: "root", width: 330, height: 28 },
    { id: "second", parentId: "root", width: 394, height: 28 },
    { id: "third", parentId: "root", width: 526, height: 28 },
  ]);
  const nodes = fixture.nodes.map((node) => {
    const positions: Record<string, { x: number; y: number }> = {
      root: { x: 99, y: 349 },
      first: { x: 273, y: 117 },
      second: { x: 273, y: 227 },
      third: { x: 273, y: 544 },
    };
    return { ...node, position: positions[node.id] };
  });
  const hierarchy = buildHierarchy(nodes, fixture.edges);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const savedPlacements = Object.fromEntries(nodes.map((node) => [node.id, { ...node.position }]));
  const rootPlacement = computeListRootTopPlacement("root", hierarchy, byId, savedPlacements);

  assert.ok(rootPlacement);
  const rects = positionedRects(nodes, { ...savedPlacements, root: rootPlacement! });
  const headers = ["first", "second", "third"].map((nodeId) => rects.get(nodeId)!);
  assert.equal(rootPlacement!.x, savedPlacements.root.x);
  assert.equal(
    Math.min(...headers.map((rect) => rect.top)) - rects.get("root")!.bottom,
    LIST_DENSITIES.compact.rootToFirstRowGapY
  );
  for (const nodeId of ["first", "second", "third"]) {
    assert.deepEqual(savedPlacements[nodeId], byId.get(nodeId)!.position);
  }
});

test("Fold compacts the next List branch after child sections move sideways", () => {
  const fixture = buildTree([
    { id: "root", parentId: null, width: 220, height: 72 },
    { id: "folded", parentId: "root", width: 210, height: 68 },
    ...Array.from({ length: 4 }, (_, index) => ({
      id: `folded-child-${index}`,
      parentId: "folded",
      width: 200,
      height: 64,
    })),
    { id: "next", parentId: "root", width: 210, height: 68 },
  ]);
  const nodes = fixture.nodes.map((node) => node.id === "folded"
    ? { ...node, data: { ...node.data, layoutFoldCount: 2 } }
    : node);
  const hierarchy = buildHierarchy(nodes, fixture.edges);
  const placements = computeListLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));
  const rects = positionedRects(nodes, placements);
  const firstSection = rects.get("folded-child-0")!;
  const secondSection = rects.get("folded-child-2")!;
  const foldedBottom = Math.max(
    rects.get("folded")!.bottom,
    ...Array.from({ length: 4 }, (_, index) => rects.get(`folded-child-${index}`)!.bottom)
  );
  const density = LIST_DENSITIES.compact;

  assert.equal(firstSection.top, secondSection.top);
  assert.ok(secondSection.left > firstSection.right);
  assert.equal(
    rects.get("next")!.top - foldedBottom,
    density.rowGapY + density.majorBranchGapY
  );
  assertNoOverlap(positionedNodes(nodes, placements));
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
  assert.ok(model.groups.every((group) => group.sharedSegments.length === 1));
  assert.ok(model.groups.every((group) => {
    const trunk = group.sharedSegments[0];
    return trunk.x1 === trunk.x2
      && group.branches.every((branch) => branch.segments[0].x1 === trunk.x1);
  }));
  assert.ok(model.groups.every((group) => new Set(
    group.branches.map((branch) => branch.segments[0].x1)
  ).size === 1));
  assert.ok(model.groups.every((group) => group.branches.every((branch) => {
    const segment = branch.segments[0];
    return Math.abs(segment.x2 - segment.x1) <= LIST_DENSITIES.compact.connectorGutterX;
  })));
  assert.deepEqual(model.duplicateVisibleConnectorSegments, []);
  assert.deepEqual(model.obstacleIntersections, []);
});

test("Matrix-root siblings share one List trunk despite different left edges and stale edge modes", () => {
  const tree = buildTree([
    { id: "root", parentId: null, width: 220, height: 88 },
    { id: "matrix-a", parentId: "root", width: 640, height: 180 },
    { id: "matrix-b", parentId: "root", width: 820, height: 220 },
    { id: "matrix-c", parentId: "root", width: 710, height: 200 },
  ]);
  const childPositions = new Map([
    ["matrix-a", { x: 320, y: 360 }],
    ["matrix-b", { x: 332, y: 650 }],
    ["matrix-c", { x: 326, y: 970 }],
  ]);
  const nodes = tree.nodes.map((node) => ({
    ...node,
    position: childPositions.get(node.id) ?? node.position,
    data: node.id.startsWith("matrix-")
      ? { ...node.data, layoutMode: "matrix" }
      : node.data,
  }));
  const edges = tree.edges.map((edge, index) => index === 0
    ? { ...edge, data: { ...edge.data, layoutMode: "matrix" } }
    : edge);
  const model = buildListConnectorModel(nodes, edges);
  const rootGroup = model.groups.find((group) => group.parentId === "root");

  assert.ok(rootGroup);
  assert.equal(rootGroup!.branches.length, 3);
  assert.equal(rootGroup!.sharedSegments.length, 1);
  assert.equal(new Set(rootGroup!.branches.map((branch) => branch.segments[0].x1)).size, 1);
  assert.deepEqual(model.duplicateVisibleConnectorSegments, []);
});

test("List reflow moves a nested Matrix as one block without rearranging its cells", () => {
  const tree = buildTree([
    { id: "root", parentId: null, width: 220, height: 72 },
    { id: "matrix", parentId: "root", width: 520, height: 72 },
    { id: "matrix-a", parentId: "matrix", width: 240, height: 64 },
    { id: "matrix-b", parentId: "matrix", width: 240, height: 64 },
    { id: "other", parentId: "root", width: 200, height: 68 },
  ]);
  const authoredPositions = new Map<string, { x: number; y: number }>([
    ["matrix", { x: 700, y: 300 }],
    ["matrix-a", { x: 700, y: 400 }],
    ["matrix-b", { x: 980, y: 400 }],
    ["other", { x: 120, y: 900 }],
  ]);
  const nodes = tree.nodes.map((node) => ({
    ...node,
    position: authoredPositions.get(node.id) ?? node.position,
    data: node.id === "matrix"
      ? { ...node.data, layoutMode: "matrix" }
      : node.data,
  }));
  const hierarchy = buildHierarchy(nodes, tree.edges);
  const placements = computeListLayout(
    "root",
    hierarchy,
    new Map(nodes.map((node) => [node.id, node]))
  );

  const deltaFor = (nodeId: string) => {
    const before = nodes.find((node) => node.id === nodeId)!.position;
    const after = placements[nodeId];
    return { x: after.x - before.x, y: after.y - before.y };
  };
  assert.deepEqual(deltaFor("matrix-a"), deltaFor("matrix"));
  assert.deepEqual(deltaFor("matrix-b"), deltaFor("matrix"));

  const positioned = positionedNodes(nodes, placements);
  const matrixBottom = Math.max(
    getNodeRect(positioned.find((node) => node.id === "matrix")!).bottom,
    getNodeRect(positioned.find((node) => node.id === "matrix-a")!).bottom,
    getNodeRect(positioned.find((node) => node.id === "matrix-b")!).bottom
  );
  assert.ok(
    getNodeRect(positioned.find((node) => node.id === "other")!).top
      >= matrixBottom + LIST_DENSITIES.compact.rowGapY + LIST_DENSITIES.compact.majorBranchGapY
  );
});

test("List buses start and end on irregular shape silhouettes", () => {
  const tree = buildTree([
    { id: "root", parentId: null, width: 500, height: 500 },
    { id: "child", parentId: "root", width: 200, height: 200 },
  ]);
  const nodes = tree.nodes.map((node) => node.id === "root"
    ? {
        ...node,
        position: { x: 100, y: 100 },
        data: { ...node.data, shapeType: "star" },
      }
    : {
        ...node,
        position: { x: 360, y: 760 },
        data: { ...node.data, shapeType: "star" },
      });
  const group = buildListConnectorModel(nodes, tree.edges).groups[0];

  assert.ok(group);
  assert.ok(Math.abs(group.sharedSegments[0].x1 - 312) < 0.001);
  assert.ok(group.sharedSegments[0].y1 > 450);
  assert.ok(Math.abs(group.branches[0].segments[0].x2 - 404.909091) < 0.001);
  assert.equal(group.branches[0].segments[0].y2, 860);
});

test("List buses meet rounded parents directly on the shared trunk axis", () => {
  const tree = buildTree([
    { id: "root", parentId: null, width: 500, height: 200 },
    { id: "child", parentId: "root", width: 200, height: 100 },
  ]);
  const nodes = tree.nodes.map((node) => node.id === "root"
    ? {
        ...node,
        position: { x: 100, y: 100 },
        data: { ...node.data, shapeType: "rounded" },
      }
    : {
        ...node,
        position: { x: 360, y: 460 },
        data: { ...node.data, shapeType: "rounded" },
      });
  const group = buildListConnectorModel(nodes, tree.edges).groups[0];

  assert.ok(group);
  assert.deepEqual(
    { x: group.sharedSegments[0].x1, y: group.sharedSegments[0].y1 },
    { x: 312, y: 300 }
  );
  assert.equal(group.sharedSegments[0].x1, group.sharedSegments[0].x2);
  assert.equal(group.sharedSegments[0].x1, group.branches[0].segments[0].x1);
  assert.deepEqual(
    {
      x: group.branches[0].segments[0].x2,
      y: group.branches[0].segments[0].y2,
    },
    { x: 360, y: 510 }
  );
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
