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

test("manually moved endpoints leave grouped buses for live smart routing", () => {
  const fixture = denseTree();
  const nodes = fixture.nodes.map((node) => node.id === "branch-3"
    ? { ...node, data: { ...node.data, treeManualOverride: true } }
    : node);
  const placed = applyLayout(nodes, fixture.edges, "vertical");
  const model = buildTreeConnectorModel(placed, fixture.edges);
  const rootGroup = model.groups.find((group) => group.parentId === "root");

  assert.ok(rootGroup);
  assert.equal(rootGroup!.branches.some((branch) => branch.childId === "branch-3"), false);
  assert.equal(model.groups.some((group) => group.parentId === "branch-3"), false);
});
