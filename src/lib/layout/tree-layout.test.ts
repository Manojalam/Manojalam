import assert from "node:assert/strict";
import test from "node:test";
import type { Edge, Node } from "@xyflow/react";
import { buildHierarchy, getSubtree } from "./hierarchy";
import { getNodeRect, rectsOverlap } from "./geometry";
import {
  buildTreeConnectorModel,
  computeOrthogonalTreeLayout,
  ORTHOGONAL_TREE_SPACING,
  type OrthogonalTreeOrientation,
} from "./tree-layout";

function denseTree(): { nodes: Node[]; edges: Edge[] } {
  const branchIds = Array.from({ length: 16 }, (_, index) => `branch-${index}`);
  const nodes: Node[] = [{
    id: "root",
    type: "shape",
    position: { x: 720, y: 420 },
    measured: { width: 248, height: 84 },
    data: { text: "Root", parentId: null, childOrder: branchIds },
  }];
  const edges: Edge[] = [];

  branchIds.forEach((branchId, branchIndex) => {
    const leafIds = Array.from({ length: 5 }, (_, leafIndex) => `${branchId}-leaf-${leafIndex}`);
    nodes.push({
      id: branchId,
      type: "shape",
      position: { x: 0, y: 0 },
      measured: {
        width: 174 + (branchIndex % 4) * 22,
        height: 62 + (branchIndex % 3) * 12,
      },
      data: { text: branchId, parentId: "root", childOrder: leafIds },
    });
    edges.push({
      id: `root-${branchId}`,
      source: "root",
      target: branchId,
      type: "branch",
      data: { layoutMode: "vertical", edgeType: "branch" },
    });

    leafIds.forEach((leafId, leafIndex) => {
      nodes.push({
        id: leafId,
        type: "shape",
        position: { x: 0, y: 0 },
        measured: {
          width: 132 + ((branchIndex + leafIndex) % 5) * 24,
          height: 54 + ((branchIndex * 2 + leafIndex) % 4) * 13,
        },
        data: { text: leafId, parentId: branchId, childOrder: [] },
      });
      edges.push({
        id: `${branchId}-${leafId}`,
        source: branchId,
        target: leafId,
        type: "branch",
        data: { layoutMode: "vertical", edgeType: "branch" },
      });
    });
  });

  return { nodes, edges };
}

function nestedFoldTree(): { nodes: Node[]; edges: Edge[] } {
  const specs: Array<{
    id: string;
    parentId: string | null;
    width: number;
    height: number;
    children: string[];
    foldCount?: number;
  }> = [
    { id: "root", parentId: null, width: 248, height: 96, children: ["first", "second"] },
    { id: "first", parentId: "root", width: 132, height: 54, children: ["first-card"] },
    {
      id: "first-card",
      parentId: "first",
      width: 480,
      height: 120,
      children: ["first-leaf-0", "first-leaf-1", "first-leaf-2", "first-leaf-3"],
      foldCount: 4,
    },
    ...Array.from({ length: 4 }, (_, index) => ({
      id: `first-leaf-${index}`,
      parentId: "first-card",
      width: 140,
      height: 60,
      children: [],
    })),
    { id: "second", parentId: "root", width: 148, height: 54, children: ["second-card"] },
    { id: "second-card", parentId: "second", width: 400, height: 120, children: [] },
  ];
  const nodes = specs.map<Node>((spec, index) => ({
    id: spec.id,
    type: "shape",
    position: index === 0 ? { x: 720, y: 420 } : { x: 0, y: 0 },
    measured: { width: spec.width, height: spec.height },
    data: {
      text: spec.id,
      parentId: spec.parentId,
      childOrder: spec.children,
      ...(spec.foldCount ? { layoutFoldCount: spec.foldCount } : {}),
    },
  }));
  const edges = specs
    .filter((spec): spec is typeof spec & { parentId: string } => spec.parentId !== null)
    .map<Edge>((spec) => ({
      id: `${spec.parentId}-${spec.id}`,
      source: spec.parentId,
      target: spec.id,
      type: "branch",
      data: { layoutMode: "horizontal", edgeType: "branch" },
    }));
  return { nodes, edges };
}

function applyLayout(
  nodes: Node[],
  edges: Edge[],
  orientation: OrthogonalTreeOrientation
): Node[] {
  const hierarchy = buildHierarchy(nodes, edges);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const placements = computeOrthogonalTreeLayout("root", hierarchy, byId, orientation);
  return nodes.map((node) => ({ ...node, position: placements[node.id] ?? node.position }));
}

function assertNoOverlap(nodes: Node[], orientation: OrthogonalTreeOrientation): void {
  for (let first = 0; first < nodes.length; first += 1) {
    for (let second = first + 1; second < nodes.length; second += 1) {
      assert.equal(
        rectsOverlap(getNodeRect(nodes[first]), getNodeRect(nodes[second]), 6),
        false,
        `${orientation}: ${nodes[first].id} overlaps ${nodes[second].id}`
      );
    }
  }
}

function crossBounds(nodes: Node[], ids: string[], orientation: OrthogonalTreeOrientation) {
  const rects = ids.map((id) => getNodeRect(nodes.find((node) => node.id === id)!));
  return orientation === "vertical"
    ? { start: Math.min(...rects.map((rect) => rect.left)), end: Math.max(...rects.map((rect) => rect.right)) }
    : { start: Math.min(...rects.map((rect) => rect.top)), end: Math.max(...rects.map((rect) => rect.bottom)) };
}

test("dense Horizontal and Vertical trees stay collision-free and keep the root fixed", () => {
  const fixture = denseTree();
  for (const orientation of ["horizontal", "vertical"] as const) {
    const placed = applyLayout(fixture.nodes, fixture.edges, orientation);
    assert.equal(placed.length, 97);
    assert.deepEqual(placed.find((node) => node.id === "root")!.position, { x: 720, y: 420 });
    assertNoOverlap(placed, orientation);
  }
});

test("parents remain centered over complete child subtree bands", () => {
  const fixture = denseTree();
  const hierarchy = buildHierarchy(fixture.nodes, fixture.edges);

  for (const orientation of ["horizontal", "vertical"] as const) {
    const placed = applyLayout(fixture.nodes, fixture.edges, orientation);
    const rootRect = getNodeRect(placed.find((node) => node.id === "root")!);
    const descendantIds = (hierarchy.get("root")?.childIds ?? [])
      .flatMap((branchId) => getSubtree(branchId, hierarchy));
    const descendants = crossBounds(placed, descendantIds, orientation);
    const rootCrossCenter = orientation === "vertical" ? rootRect.centerX : rootRect.centerY;
    assert.ok(Math.abs(rootCrossCenter - (descendants.start + descendants.end) / 2) < 0.001);

    const branch = placed.find((node) => node.id === "branch-4")!;
    const branchRect = getNodeRect(branch);
    const children = hierarchy.get(branch.id)?.childIds ?? [];
    const childBounds = crossBounds(placed, children, orientation);
    const branchCrossCenter = orientation === "vertical" ? branchRect.centerX : branchRect.centerY;
    assert.ok(Math.abs(branchCrossCenter - (childBounds.start + childBounds.end) / 2) < 0.001);
  }
});

test("subtree packing uses compact gaps without collapsing branch boundaries", () => {
  const fixture = denseTree();
  const vertical = applyLayout(fixture.nodes, fixture.edges, "vertical");
  const horizontal = applyLayout(
    fixture.nodes,
    fixture.edges.map((edge) => ({ ...edge, data: { ...edge.data, layoutMode: "horizontal" } })),
    "horizontal"
  );

  const firstVerticalLeaves = Array.from({ length: 5 }, (_, index) =>
    getNodeRect(vertical.find((node) => node.id === `branch-0-leaf-${index}`)!)
  ).sort((first, second) => first.left - second.left);
  for (let index = 1; index < firstVerticalLeaves.length; index += 1) {
    assert.equal(
      firstVerticalLeaves[index].left - firstVerticalLeaves[index - 1].right,
      ORTHOGONAL_TREE_SPACING.vertical.siblingGap
    );
  }

  const firstHorizontalLeaves = Array.from({ length: 5 }, (_, index) =>
    getNodeRect(horizontal.find((node) => node.id === `branch-0-leaf-${index}`)!)
  ).sort((first, second) => first.top - second.top);
  for (let index = 1; index < firstHorizontalLeaves.length; index += 1) {
    assert.equal(
      firstHorizontalLeaves[index].top - firstHorizontalLeaves[index - 1].bottom,
      ORTHOGONAL_TREE_SPACING.horizontal.siblingGap
    );
  }
});

test("nested Fold compacts the next root branch from the visible subtree bounds", () => {
  const fixture = nestedFoldTree();
  const hierarchy = buildHierarchy(fixture.nodes, fixture.edges);

  for (const orientation of ["horizontal", "vertical"] as const) {
    const placed = applyLayout(fixture.nodes, fixture.edges, orientation);
    const firstBounds = crossBounds(placed, getSubtree("first", hierarchy), orientation);
    const secondBounds = crossBounds(placed, getSubtree("second", hierarchy), orientation);

    assert.equal(
      secondBounds.start - firstBounds.end,
      ORTHOGONAL_TREE_SPACING[orientation].rootBranchGap
    );
    assertNoOverlap(placed, orientation);
  }
});

test("a Vertical parent reflow preserves a nested List as one block", () => {
  const nodes: Node[] = [
    {
      id: "root",
      type: "shape",
      position: { x: 600, y: 80 },
      measured: { width: 240, height: 80 },
      data: { parentId: null, childOrder: ["list", "other"], layoutMode: "vertical" },
    },
    {
      id: "list",
      type: "shape",
      position: { x: 120, y: 280 },
      measured: { width: 220, height: 80 },
      data: { parentId: "root", childOrder: ["a", "b", "c"], layoutMode: "list" },
    },
    ...["a", "b", "c"].map<Node>((id, index) => ({
      id,
      type: "shape",
      position: { x: 280, y: 400 + index * 120 },
      measured: { width: 190, height: 70 },
      data: { parentId: "list", childOrder: [] },
    })),
    {
      id: "other",
      type: "shape",
      position: { x: 920, y: 280 },
      measured: { width: 220, height: 80 },
      data: { parentId: "root", childOrder: ["other-leaf"] },
    },
    {
      id: "other-leaf",
      type: "shape",
      position: { x: 920, y: 500 },
      measured: { width: 190, height: 70 },
      data: { parentId: "other", childOrder: [] },
    },
  ];
  const edges: Edge[] = [
    ["root", "list"],
    ["root", "other"],
    ["list", "a"],
    ["list", "b"],
    ["list", "c"],
    ["other", "other-leaf"],
  ].map(([source, target]) => ({
    id: `${source}-${target}`,
    source,
    target,
    type: "branch",
    data: { layoutMode: source === "list" ? "list" : "vertical" },
  }));
  const hierarchy = buildHierarchy(nodes, edges);
  const placements = computeOrthogonalTreeLayout(
    "root",
    hierarchy,
    new Map(nodes.map((node) => [node.id, node])),
    "vertical"
  );
  const deltaFor = (nodeId: string) => {
    const node = nodes.find((candidate) => candidate.id === nodeId)!;
    return {
      x: placements[nodeId].x - node.position.x,
      y: placements[nodeId].y - node.position.y,
    };
  };

  assert.deepEqual(deltaFor("a"), deltaFor("list"));
  assert.deepEqual(deltaFor("b"), deltaFor("list"));
  assert.deepEqual(deltaFor("c"), deltaFor("list"));

  const placed = nodes.map((node) => ({ ...node, position: placements[node.id] ?? node.position }));
  const listBounds = crossBounds(placed, getSubtree("list", hierarchy), "vertical");
  const otherBounds = crossBounds(placed, getSubtree("other", hierarchy), "vertical");
  assert.equal(otherBounds.start - listBounds.end, ORTHOGONAL_TREE_SPACING.vertical.rootBranchGap);
  assertNoOverlap(placed, "vertical");
});

test("Vertical root headers keep one uniform gap across differently sized nested Lists", () => {
  const specs: Array<{
    id: string;
    parentId: string | null;
    x: number;
    y: number;
    width: number;
    height: number;
    children: string[];
    mode?: "vertical" | "list";
  }> = [
    { id: "root", parentId: null, x: 600, y: 80, width: 220, height: 80, children: ["wide", "narrow", "medium"], mode: "vertical" },
    { id: "wide", parentId: "root", x: 0, y: 280, width: 160, height: 70, children: ["wide-a", "wide-b"], mode: "list" },
    { id: "wide-a", parentId: "wide", x: 160, y: 390, width: 260, height: 60, children: [] },
    { id: "wide-b", parentId: "wide", x: 160, y: 480, width: 260, height: 60, children: [] },
    { id: "narrow", parentId: "root", x: 600, y: 280, width: 160, height: 70, children: ["narrow-a"], mode: "list" },
    { id: "narrow-a", parentId: "narrow", x: 760, y: 390, width: 120, height: 60, children: [] },
    { id: "medium", parentId: "root", x: 1000, y: 280, width: 160, height: 70, children: ["medium-a"], mode: "list" },
    { id: "medium-a", parentId: "medium", x: 1160, y: 390, width: 190, height: 60, children: [] },
  ];
  const nodes = specs.map<Node>((spec) => ({
    id: spec.id,
    type: "shape",
    position: { x: spec.x, y: spec.y },
    measured: { width: spec.width, height: spec.height },
    data: {
      parentId: spec.parentId,
      childOrder: [...spec.children],
      ...(spec.mode ? { layoutMode: spec.mode } : {}),
    },
  }));
  const edges = specs.flatMap<Edge>((spec) => spec.parentId ? [{
      id: `${spec.parentId}-${spec.id}`,
      source: spec.parentId,
      target: spec.id,
      type: "branch",
      data: { layoutMode: spec.parentId === "root" ? "vertical" : "list" },
    }] : []);
  const hierarchy = buildHierarchy(nodes, edges);
  const placements = computeOrthogonalTreeLayout(
    "root",
    hierarchy,
    new Map(nodes.map((node) => [node.id, node])),
    "vertical"
  );
  const placed = nodes.map((node) => ({ ...node, position: placements[node.id] ?? node.position }));
  const headers = ["wide", "narrow", "medium"].map((id) => getNodeRect(placed.find((node) => node.id === id)!));
  const firstGap = headers[1].left - headers[0].right;
  const secondGap = headers[2].left - headers[1].right;

  assert.ok(Math.abs(firstGap - secondGap) < 0.001);
  const subtreeBounds = ["wide", "narrow", "medium"].map((id) => (
    crossBounds(placed, getSubtree(id, hierarchy), "vertical")
  ));
  assert.ok(subtreeBounds[1].start - subtreeBounds[0].end >= ORTHOGONAL_TREE_SPACING.vertical.rootBranchGap);
  assert.ok(subtreeBounds[2].start - subtreeBounds[1].end >= ORTHOGONAL_TREE_SPACING.vertical.rootBranchGap);
  assertNoOverlap(placed, "vertical");
});

test("shared tree buses replace overlapping per-child elbows and avoid every box", () => {
  const fixture = denseTree();
  for (const orientation of ["horizontal", "vertical"] as const) {
    const edges = fixture.edges.map((edge) => ({
      ...edge,
      data: { ...edge.data, layoutMode: orientation },
    }));
    const placed = applyLayout(fixture.nodes, edges, orientation);
    const model = buildTreeConnectorModel(placed, edges);
    const rootGroup = model.groups.find((group) => group.parentId === "root");

    assert.ok(rootGroup);
    assert.equal(rootGroup!.branches.length, 16);
    assert.equal(rootGroup!.sharedSegments.length, 2);
    assert.equal(model.groups.length, 17);
    assert.deepEqual(model.duplicateHierarchyRelations, []);
    assert.deepEqual(model.obstacleIntersections, []);
  }
});

test("Fold packs direct children into adjacent groups and routes outside earlier groups", () => {
  const fixture = denseTree();
  const nodes = fixture.nodes.map((node) => node.id === "root"
    ? { ...node, data: { ...node.data, layoutFoldCount: 4 } }
    : node);
  const edges = fixture.edges.map((edge) => ({
    ...edge,
    data: { ...edge.data, layoutMode: "horizontal" },
  }));
  const placed = applyLayout(nodes, edges, "horizontal");
  const horizontalHierarchy = buildHierarchy(nodes, edges);
  const firstColumnIds = Array.from({ length: 4 }, (_, index) => `branch-${index}`)
    .flatMap((branchId) => getSubtree(branchId, horizontalHierarchy));
  const secondColumnIds = Array.from({ length: 4 }, (_, index) => `branch-${index + 4}`)
    .flatMap((branchId) => getSubtree(branchId, horizontalHierarchy));
  const firstColumn = crossBounds(placed, firstColumnIds, "horizontal");
  const secondColumn = crossBounds(placed, secondColumnIds, "horizontal");
  const firstColumnRoot = getNodeRect(placed.find((node) => node.id === "branch-0")!);
  const secondColumnRoot = getNodeRect(placed.find((node) => node.id === "branch-4")!);
  const fourthColumn = getNodeRect(placed.find((node) => node.id === "branch-12")!);
  const model = buildTreeConnectorModel(placed, edges);
  const rootGroup = model.groups.find((group) => group.parentId === "root");

  assert.ok(Math.abs(firstColumn.start - secondColumn.start) <= 2);
  assert.ok(secondColumnRoot.left > firstColumnRoot.right);
  assert.ok(fourthColumn.left > secondColumnRoot.right);
  assert.equal(rootGroup?.branches.length, 16);
  assert.ok((rootGroup?.sharedSegments.length ?? 0) > 2);
  assert.deepEqual(model.obstacleIntersections, []);
  assertNoOverlap(placed, "horizontal");

  const verticalEdges = fixture.edges.map((edge) => ({
    ...edge,
    data: { ...edge.data, layoutMode: "vertical" },
  }));
  const verticalPlaced = applyLayout(nodes, verticalEdges, "vertical");
  const verticalHierarchy = buildHierarchy(nodes, verticalEdges);
  const firstRowIds = Array.from({ length: 4 }, (_, index) => `branch-${index}`)
    .flatMap((branchId) => getSubtree(branchId, verticalHierarchy));
  const secondRowIds = Array.from({ length: 4 }, (_, index) => `branch-${index + 4}`)
    .flatMap((branchId) => getSubtree(branchId, verticalHierarchy));
  const firstRow = crossBounds(verticalPlaced, firstRowIds, "vertical");
  const secondRow = crossBounds(verticalPlaced, secondRowIds, "vertical");
  const firstRowRoot = getNodeRect(verticalPlaced.find((node) => node.id === "branch-0")!);
  const secondRowRoot = getNodeRect(verticalPlaced.find((node) => node.id === "branch-4")!);
  const verticalModel = buildTreeConnectorModel(verticalPlaced, verticalEdges);
  assert.ok(Math.abs(firstRow.start - secondRow.start) <= 2);
  assert.ok(secondRowRoot.top > firstRowRoot.bottom);
  assert.deepEqual(verticalModel.obstacleIntersections, []);
  assertNoOverlap(verticalPlaced, "vertical");
});

test("manually moved endpoints remain on grouped hierarchy buses", () => {
  const fixture = denseTree();
  const placed = applyLayout(fixture.nodes, fixture.edges, "vertical").map((node) => node.id === "branch-3"
    ? {
        ...node,
        position: { x: node.position.x + 48, y: node.position.y + 24 },
        data: { ...node.data, treeManualOverride: true },
      }
    : node);
  const model = buildTreeConnectorModel(placed, fixture.edges);
  const rootGroup = model.groups.find((group) => group.parentId === "root");

  assert.ok(rootGroup);
  assert.equal(rootGroup!.branches.some((branch) => branch.childId === "branch-3"), true);
  assert.equal(model.groups.some((group) => group.parentId === "branch-3"), true);
});

test("single-child buses connect offset parents and children without a gap", () => {
  for (const orientation of ["vertical", "horizontal"] as const) {
    const nodes: Node[] = [{
      id: "parent",
      type: "shape",
      position: { x: 40, y: 60 },
      measured: { width: 120, height: 70 },
      data: { text: "Parent", parentId: null, childOrder: ["child"] },
    }, {
      id: "child",
      type: "shape",
      position: orientation === "vertical" ? { x: 260, y: 260 } : { x: 320, y: 220 },
      measured: { width: 100, height: 60 },
      data: { text: "Child", parentId: "parent", childOrder: [] },
    }];
    const edge: Edge = {
      id: "parent-child",
      source: "parent",
      target: "child",
      type: "branch",
      data: { layoutMode: orientation, curveStyle: "step" },
    };

    const group = buildTreeConnectorModel(nodes, [edge]).groups[0];
    assert.ok(group);
    const trunk = group.sharedSegments[0];
    const bus = group.sharedSegments[1];
    const branch = group.branches[0].segments[0];
    if (orientation === "vertical") {
      assert.equal(trunk.y2, bus.y1);
      assert.equal(branch.y1, bus.y1);
      assert.ok(bus.x1 <= trunk.x2 && trunk.x2 <= bus.x2);
      assert.ok(bus.x1 <= branch.x1 && branch.x1 <= bus.x2);
    } else {
      assert.equal(trunk.x2, bus.x1);
      assert.equal(branch.x1, bus.x1);
      assert.ok(bus.y1 <= trunk.y2 && trunk.y2 <= bus.y2);
      assert.ok(bus.y1 <= branch.y1 && branch.y1 <= bus.y2);
    }
  }
});

test("selected hierarchy edges leave the shared bus for full connector editing", () => {
  const nodes: Node[] = [{
    id: "parent",
    type: "shape",
    position: { x: 0, y: 0 },
    measured: { width: 120, height: 70 },
    data: { text: "Parent", parentId: null, childOrder: ["child"] },
  }, {
    id: "child",
    type: "shape",
    position: { x: 220, y: 220 },
    measured: { width: 100, height: 60 },
    data: { text: "Child", parentId: "parent", childOrder: [] },
  }];
  const edge: Edge = {
    id: "parent-child",
    source: "parent",
    target: "child",
    selected: true,
    type: "branch",
    data: { layoutMode: "vertical", curveStyle: "step" },
  };

  assert.deepEqual(buildTreeConnectorModel(nodes, [edge]).groups, []);

  const bentEdge: Edge = {
    ...edge,
    selected: false,
    data: {
      ...edge.data,
      waypoints: [{ x: 160, y: 120 }],
      waypointOrigin: "bend",
    },
  };
  assert.deepEqual(buildTreeConnectorModel(nodes, [bentEdge]).groups, []);
});

test("structured tree buses attach to polygon silhouettes", () => {
  const nodes: Node[] = [{
    id: "parent",
    type: "shape",
    position: { x: 100, y: 100 },
    measured: { width: 500, height: 500 },
    data: {
      text: "Parent",
      shapeType: "star",
      parentId: null,
      childOrder: ["child"],
    },
  }, {
    id: "child",
    type: "shape",
    position: { x: 250, y: 760 },
    measured: { width: 200, height: 200 },
    data: {
      text: "Child",
      shapeType: "star",
      parentId: "parent",
      childOrder: [],
    },
  }];
  const edge: Edge = {
    id: "parent-child",
    source: "parent",
    target: "child",
    type: "branch",
    data: { layoutMode: "vertical", curveStyle: "step" },
  };
  const group = buildTreeConnectorModel(nodes, [edge]).groups[0];

  assert.ok(group);
  assert.deepEqual(
    { x: group.sharedSegments[0].x1, y: group.sharedSegments[0].y1 },
    { x: 350, y: 450 }
  );
  assert.deepEqual(
    {
      x: group.branches[0].segments[0].x2,
      y: group.branches[0].segments[0].y2,
    },
    { x: 350, y: 762 }
  );
});

test("a fully selected multi-branch connector remains one shared bus", () => {
  const nodes: Node[] = [{
    id: "parent",
    type: "shape",
    position: { x: 0, y: 0 },
    measured: { width: 120, height: 70 },
    data: { text: "Parent", parentId: null, childOrder: ["first", "second"] },
  }, {
    id: "first",
    type: "shape",
    position: { x: 0, y: 220 },
    measured: { width: 100, height: 60 },
    data: { text: "First", parentId: "parent", childOrder: [] },
  }, {
    id: "second",
    type: "shape",
    position: { x: 180, y: 220 },
    measured: { width: 100, height: 60 },
    data: { text: "Second", parentId: "parent", childOrder: [] },
  }];
  const edges: Edge[] = ["first", "second"].map((target) => ({
    id: `parent-${target}`,
    source: "parent",
    target,
    selected: true,
    type: "branch",
    data: { layoutMode: "vertical", curveStyle: "step" },
  }));

  const groups = buildTreeConnectorModel(nodes, edges).groups;

  assert.equal(groups.length, 1);
  assert.equal(groups[0].branches.length, 2);
  assert.deepEqual(groups[0].branches.map((branch) => branch.edge.id), [
    "parent-first",
    "parent-second",
  ]);
});
