import assert from "node:assert/strict";
import test from "node:test";
import type { Edge, Node } from "@xyflow/react";
import type { LayoutMode } from "../types";
import { getNodeRect, inflateRect, rectsOverlap, segmentIntersectsRect } from "./geometry";
import { buildHierarchy } from "./hierarchy";
import { EDGE_OBSTACLE_PADDING, routeLayoutEdge } from "./edge-routing";
import { computeLayout, LAYOUT_OPTIONS, routeForMode } from "./index";
import { persistMindMapRootSides } from "./mind-map-layout";

function buildVariableTree(count = 31): { nodes: Node[]; edges: Edge[] } {
  const childOrder = new Map<string, string[]>();
  for (let index = 1; index < count; index++) {
    const parentId = `n${Math.floor((index - 1) / 3)}`;
    childOrder.set(parentId, [...(childOrder.get(parentId) ?? []), `n${index}`]);
  }
  const nodes = Array.from({ length: count }, (_, index): Node => {
    const parentId = index === 0 ? null : `n${Math.floor((index - 1) / 3)}`;
    return {
      id: `n${index}`,
      type: "shape",
      position: index === 0 ? { x: 500, y: 360 } : { x: 0, y: 0 },
      measured: {
        width: 150 + (index * 37) % 170,
        height: 58 + (index * 29) % 92,
      },
      data: {
        text: `Node ${index}`,
        parentId,
        childOrder: childOrder.get(`n${index}`) ?? [],
      },
    };
  });
  const edges = nodes.slice(1).map<Edge>((node) => ({
    id: `edge-${String((node.data as Record<string, unknown>).parentId)}-${node.id}`,
    source: String((node.data as Record<string, unknown>).parentId),
    target: node.id,
    data: { edgeType: "branch" },
  }));
  return { nodes, edges };
}

function applyPositions(nodes: Node[], positions: Record<string, { x: number; y: number }>): Node[] {
  return nodes.map((node) => ({ ...node, position: positions[node.id] ?? node.position }));
}

function assertNoOverlap(nodes: Node[], mode: LayoutMode): void {
  for (let first = 0; first < nodes.length; first++) {
    for (let second = first + 1; second < nodes.length; second++) {
      assert.equal(
        rectsOverlap(getNodeRect(nodes[first]), getNodeRect(nodes[second]), 8),
        false,
        `${mode}: ${nodes[first].id} overlaps ${nodes[second].id}`
      );
    }
  }
}

function bounds(nodes: Node[]) {
  const rects = nodes.map(getNodeRect);
  return {
    width: Math.max(...rects.map((rect) => rect.right)) - Math.min(...rects.map((rect) => rect.left)),
    height: Math.max(...rects.map((rect) => rect.bottom)) - Math.min(...rects.map((rect) => rect.top)),
  };
}

test("structured layouts remain collision-free with variable node dimensions", () => {
  const tree = buildVariableTree();
  const modes: LayoutMode[] = [
    "horizontal", "vertical", "topDown", "linear", "radial", "fromParentFreeForm", "mindMap",
  ];
  for (const mode of modes) {
    const positions = computeLayout(tree.nodes, tree.edges, mode, { rootId: "n0" });
    assert.equal(Object.keys(positions).length, tree.nodes.length, `${mode} should place every node`);
    assertNoOverlap(applyPositions(tree.nodes, positions), mode);
  }
});

test("Mind Map keeps the root centered and grows both sides outward", () => {
  const nodes: Node[] = [
    { id: "root", position: { x: 400, y: 300 }, measured: { width: 200, height: 80 }, data: { layoutMode: "mindMap", parentId: null, childOrder: ["left", "right"] } },
    { id: "left", position: { x: 100, y: 300 }, measured: { width: 180, height: 70 }, data: { parentId: "root", childOrder: ["left-child"], mindMapSide: "left" } },
    { id: "left-child", position: { x: 0, y: 300 }, measured: { width: 160, height: 60 }, data: { parentId: "left", childOrder: [] } },
    { id: "right", position: { x: 700, y: 300 }, measured: { width: 180, height: 70 }, data: { parentId: "root", childOrder: ["right-child"], mindMapSide: "right" } },
    { id: "right-child", position: { x: 900, y: 300 }, measured: { width: 160, height: 60 }, data: { parentId: "right", childOrder: [] } },
  ];
  const edges: Edge[] = [
    ["root", "left"],
    ["left", "left-child"],
    ["root", "right"],
    ["right", "right-child"],
  ].map(([source, target]) => ({ id: `${source}-${target}`, source, target, data: { edgeType: "branch" } }));
  const placed = applyPositions(nodes, computeLayout(nodes, edges, "mindMap", { rootId: "root" }));
  const rects = new Map(placed.map((node) => [node.id, getNodeRect(node)]));

  assert.equal(rects.get("root")!.centerX, 500);
  assert.ok(rects.get("left")!.right < rects.get("root")!.left);
  assert.ok(rects.get("left-child")!.right < rects.get("left")!.left);
  assert.ok(rects.get("right")!.left > rects.get("root")!.right);
  assert.ok(rects.get("right-child")!.left > rects.get("right")!.right);
  assert.equal(rects.get("left")!.centerY, rects.get("left-child")!.centerY);
  assert.equal(rects.get("right")!.centerY, rects.get("right-child")!.centerY);
  assertNoOverlap(placed, "mindMap");

  assert.deepEqual(routeForMode("mindMap", placed[0], placed[1]), {
    sourceHandle: "left",
    targetHandle: "right",
    curveStyle: "step",
  });
  assert.deepEqual(routeForMode("mindMap", placed[0], placed[3]), {
    sourceHandle: "right",
    targetHandle: "left",
    curveStyle: "step",
  });
});

test("Fold continues a Linear branch on the next row", () => {
  const tree = buildVariableTree(10);
  const nodes = tree.nodes.map((node) => node.id === "n0"
    ? { ...node, data: { ...node.data, layoutFoldCount: 2 } }
    : node);
  const positions = computeLayout(nodes, tree.edges, "linear", { rootId: "n0" });
  const placed = applyPositions(nodes, positions);
  const first = getNodeRect(placed.find((node) => node.id === "n1")!);
  const third = getNodeRect(placed.find((node) => node.id === "n3")!);

  assert.ok(third.top > first.bottom);
  assertNoOverlap(placed, "linear");
});

test("Linear preserves a single-row chain and gives siblings independent lanes", () => {
  const nodes: Node[] = [
    { id: "root", position: { x: 500, y: 360 }, measured: { width: 200, height: 80 }, data: { parentId: null, childOrder: ["first", "second", "third"] } },
    { id: "first", position: { x: 0, y: 0 }, measured: { width: 160, height: 64 }, data: { parentId: "root", childOrder: ["first-child"] } },
    { id: "first-child", position: { x: 0, y: 0 }, measured: { width: 150, height: 60 }, data: { parentId: "first", childOrder: [] } },
    { id: "second", position: { x: 0, y: 0 }, measured: { width: 180, height: 70 }, data: { parentId: "root", childOrder: [] } },
    { id: "third", position: { x: 0, y: 0 }, measured: { width: 170, height: 68 }, data: { parentId: "root", childOrder: [] } },
  ];
  const edges: Edge[] = [
    ["root", "first"],
    ["first", "first-child"],
    ["root", "second"],
    ["root", "third"],
  ].map(([source, target]) => ({ id: `${source}-${target}`, source, target, data: { edgeType: "branch" } }));
  const placed = applyPositions(nodes, computeLayout(nodes, edges, "linear", { rootId: "root" }));
  const rects = new Map(placed.map((node) => [node.id, getNodeRect(node)]));
  const childCenters = ["first", "second", "third"].map((id) => rects.get(id)!.centerY);

  assert.ok(rects.get("first")!.left > rects.get("root")!.right);
  assert.ok(rects.get("second")!.left > rects.get("root")!.right);
  assert.ok(rects.get("third")!.left > rects.get("root")!.right);
  assert.equal(new Set(childCenters).size, childCenters.length);
  assert.equal(rects.get("first")!.centerY, rects.get("first-child")!.centerY);
  assert.ok(rects.get("first-child")!.left > rects.get("first")!.right);
  assert.deepEqual(routeForMode("linear", placed[0], placed[1]), {
    sourceHandle: "right",
    targetHandle: "left",
    curveStyle: "step",
  });
  assertNoOverlap(placed, "linear");
});

test("tree levels keep clear routing corridors without oversized empty bands", () => {
  const tree = buildVariableTree(13);
  const horizontal = applyPositions(
    tree.nodes,
    computeLayout(tree.nodes, tree.edges, "horizontal", { rootId: "n0" })
  );
  const vertical = applyPositions(
    tree.nodes,
    computeLayout(tree.nodes, tree.edges, "vertical", { rootId: "n0" })
  );

  const horizontalById = new Map(horizontal.map((node) => [node.id, getNodeRect(node)]));
  const verticalById = new Map(vertical.map((node) => [node.id, getNodeRect(node)]));
  for (const edge of tree.edges) {
    assert.ok(horizontalById.get(edge.target)!.left - horizontalById.get(edge.source)!.right >= 100);
    assert.ok(verticalById.get(edge.target)!.top - verticalById.get(edge.source)!.bottom >= 80);
  }
  assert.ok(bounds(horizontal).width < 1800, "Horizontal should remain compact");
  assert.ok(bounds(vertical).height < 1300, "Vertical should remain compact");
});

test("structured hierarchy connectors avoid every unrelated node rectangle", () => {
  const tree = buildVariableTree(22);
  const modes: LayoutMode[] = ["horizontal", "vertical", "topDown", "linear"];

  for (const mode of modes) {
    const placed = applyPositions(
      tree.nodes,
      computeLayout(tree.nodes, tree.edges, mode, { rootId: "n0" })
    );
    const rects = new Map(placed.map((node) => [node.id, getNodeRect(node)]));
    for (const edge of tree.edges) {
      const obstacles = placed
        .filter((node) => node.id !== edge.source && node.id !== edge.target)
        .map((node) => getNodeRect(node));
      const route = routeLayoutEdge(rects.get(edge.source)!, rects.get(edge.target)!, mode, obstacles);
      for (let index = 0; index < route.points.length - 1; index++) {
        const segment = {
          x1: route.points[index].x,
          y1: route.points[index].y,
          x2: route.points[index + 1].x,
          y2: route.points[index + 1].y,
        };
        for (const obstacle of obstacles) {
          assert.equal(
            segmentIntersectsRect(segment, inflateRect(obstacle, EDGE_OBSTACLE_PADDING)),
            false,
            `${mode}: ${edge.id} crosses ${obstacle.id}`
          );
        }
      }
    }
  }
});

test("Top Down is hidden from the chooser while legacy boards retain Vertical geometry", () => {
  const tree = buildVariableTree(13);
  const vertical = computeLayout(tree.nodes, tree.edges, "vertical", { rootId: "n0" });
  const legacyTopDown = computeLayout(tree.nodes, tree.edges, "topDown", { rootId: "n0" });

  assert.equal(LAYOUT_OPTIONS.some((option) => option.mode === "topDown"), false);
  assert.equal(LAYOUT_OPTIONS.find((option) => option.mode === "mindMap")?.label, "Mind Map");
  assert.match(
    LAYOUT_OPTIONS.find((option) => option.mode === "mindMap")?.description ?? "",
    /left and right/
  );
  assert.equal(LAYOUT_OPTIONS.find((option) => option.mode === "fromParentFreeForm")?.label, "Radial Branches");
  assert.match(
    LAYOUT_OPTIONS.find((option) => option.mode === "fromParentFreeForm")?.description ?? "",
    /Node-and-connector/
  );
  assert.equal(LAYOUT_OPTIONS.find((option) => option.mode === "radial")?.label, "Sunburst");
  assert.match(
    LAYOUT_OPTIONS.find((option) => option.mode === "radial")?.description ?? "",
    /filled sectors/
  );
  assert.deepEqual(legacyTopDown, vertical);
});

test("Mind Map preserves established branch sides after a child is reparented", () => {
  const nodes: Node[] = [
    { id: "root", position: { x: 400, y: 300 }, measured: { width: 200, height: 80 }, data: { layoutMode: "mindMap", parentId: null, childOrder: ["left-a", "left-b", "right"] } },
    { id: "left-a", position: { x: 80, y: 180 }, measured: { width: 160, height: 60 }, data: { parentId: "root", childOrder: [] } },
    { id: "left-b", position: { x: 80, y: 360 }, measured: { width: 160, height: 60 }, data: { parentId: "root", childOrder: [] } },
    { id: "right", position: { x: 760, y: 260 }, measured: { width: 160, height: 60 }, data: { parentId: "root", childOrder: ["moved"] } },
    { id: "moved", position: { x: 980, y: 260 }, measured: { width: 140, height: 54 }, data: { parentId: "right", childOrder: [] } },
  ];
  const edges: Edge[] = [
    ["root", "left-a"],
    ["root", "left-b"],
    ["root", "right"],
    ["right", "moved"],
  ].map(([source, target]) => ({ id: `${source}-${target}`, source, target, data: { edgeType: "branch" } }));
  const hierarchy = buildHierarchy(nodes, edges);
  const stabilized = persistMindMapRootSides(nodes, "root", hierarchy);
  const placed = applyPositions(
    stabilized,
    computeLayout(stabilized, edges, "mindMap", { rootId: "root" })
  );
  const byId = new Map(placed.map((node) => [node.id, node]));
  const rootRect = getNodeRect(byId.get("root")!);

  assert.equal((byId.get("left-a")!.data as Record<string, unknown>).mindMapSide, "left");
  assert.equal((byId.get("left-b")!.data as Record<string, unknown>).mindMapSide, "left");
  assert.equal((byId.get("right")!.data as Record<string, unknown>).mindMapSide, "right");
  assert.ok(getNodeRect(byId.get("left-a")!).right < rootRect.left);
  assert.ok(getNodeRect(byId.get("left-b")!).right < rootRect.left);
  assert.ok(getNodeRect(byId.get("right")!).left > rootRect.right);
});

test("free-form child connectors keep meaningful levels but follow predominant lateral moves", () => {
  const parent: Node = {
    id: "parent",
    position: { x: 360, y: 20 },
    measured: { width: 120, height: 120 },
    data: {},
  };
  const lowerLeft: Node = {
    id: "lower-left",
    position: { x: 20, y: 300 },
    measured: { width: 120, height: 120 },
    data: {},
  };
  const sameRow: Node = {
    ...lowerLeft,
    id: "same-row",
    position: { x: 20, y: 34 },
  };
  const slightlyLowerFarLeft: Node = {
    ...lowerLeft,
    id: "slightly-lower-far-left",
    position: { x: 20, y: 120 },
  };
  const upperRight: Node = {
    ...lowerLeft,
    id: "upper-right",
    position: { x: 620, y: -180 },
  };

  assert.deepEqual(routeForMode("freeForm", parent, lowerLeft), {
    sourceHandle: "bottom",
    targetHandle: "top",
    curveStyle: "smooth",
  });
  assert.deepEqual(routeForMode("freeForm", parent, sameRow), {
    sourceHandle: "left",
    targetHandle: "right",
    curveStyle: "smooth",
  });
  assert.deepEqual(routeForMode("freeForm", parent, slightlyLowerFarLeft), {
    sourceHandle: "left",
    targetHandle: "right",
    curveStyle: "smooth",
  });
  assert.deepEqual(routeForMode("fromParentFreeForm", parent, upperRight), {
    sourceHandle: "top",
    targetHandle: "bottom",
    curveStyle: "smooth",
  });
  assert.deepEqual(routeForMode("matrix", parent, lowerLeft), {
    sourceHandle: "left",
    targetHandle: "right",
    curveStyle: "step",
  });
});
