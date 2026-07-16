import assert from "node:assert/strict";
import test from "node:test";
import type { Edge, Node } from "@xyflow/react";
import type { LayoutMode } from "../types";
import { getNodeRect, inflateRect, rectsOverlap, segmentIntersectsRect } from "./geometry";
import { EDGE_OBSTACLE_PADDING, routeLayoutEdge } from "./edge-routing";
import { computeLayout, LAYOUT_OPTIONS, routeForMode } from "./index";

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
    "horizontal", "vertical", "topDown", "linear", "radial", "fromParentFreeForm",
  ];
  for (const mode of modes) {
    const positions = computeLayout(tree.nodes, tree.edges, mode, { rootId: "n0" });
    assert.equal(Object.keys(positions).length, tree.nodes.length, `${mode} should place every node`);
    assertNoOverlap(applyPositions(tree.nodes, positions), mode);
  }
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
  assert.deepEqual(legacyTopDown, vertical);
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
