import assert from "node:assert/strict";
import test from "node:test";
import type { Node } from "@xyflow/react";
import { createNodeRect, getNodeRect } from "../layout/geometry";
import {
  alignmentSnapThreshold,
  alignSelection,
  compactEqualSpacing,
  distributeSelection,
  snapPointToGrid,
  snapRectToAlignment,
} from "./selection-geometry";

function node(id: string, x: number, y: number, width: number, height: number, origin?: [number, number]): Node {
  return { id, position: { x, y }, origin, data: {}, style: { width, height } };
}

test("horizontal compact spacing uses equal edge gaps and preserves the group center", () => {
  const nodes = [
    node("a", 0, 20, 80, 40),
    node("b", 380, 70, 140, 60),
    node("c", 900, 10, 100, 50),
  ];
  const before = nodes.map(getNodeRect);
  const positions = compactEqualSpacing(nodes, "x", 28);
  const after = nodes.map((item) => getNodeRect({ ...item, position: positions.get(item.id)! }));

  assert.equal(after[1].left - after[0].right, 28);
  assert.equal(after[2].left - after[1].right, 28);
  assert.equal((after[0].left + after[2].right) / 2, (before[0].left + before[2].right) / 2);
  assert.deepEqual(after.map((rect) => rect.top), before.map((rect) => rect.top));
});

test("vertical compact spacing supports centered node origins", () => {
  const nodes = [
    node("a", 200, 100, 100, 50, [0.5, 0.5]),
    node("b", 260, 500, 120, 80, [0.5, 0.5]),
  ];
  const positions = compactEqualSpacing(nodes, "y", 24);
  const after = nodes.map((item) => getNodeRect({ ...item, position: positions.get(item.id)! }));

  assert.equal(after[1].top - after[0].bottom, 24);
  assert.equal(after[0].left, 150);
  assert.equal(after[1].left, 200);
});

test("left alignment uses rendered bounds for mixed node origins", () => {
  const nodes = [
    node("a", 60, 20, 80, 40),
    node("b", 250, 160, 120, 80, [0.5, 0.5]),
  ];
  const positions = alignSelection(nodes, "left");
  const after = nodes.map((item) => getNodeRect({ ...item, position: positions.get(item.id)! }));

  assert.equal(after[0].left, after[1].left);
  assert.equal(after[0].top, 20);
  assert.equal(after[1].top, 120);
});

test("center alignment accounts for different rendered widths", () => {
  const nodes = [
    node("a", 20, 20, 80, 40),
    node("b", 300, 100, 160, 40),
  ];
  const positions = alignSelection(nodes, "centerX");
  const after = nodes.map((item) => getNodeRect({ ...item, position: positions.get(item.id)! }));

  assert.equal(after[0].centerX, after[1].centerX);
  assert.equal(after[0].top, 20);
  assert.equal(after[1].top, 100);
});

test("horizontal distribution preserves outer nodes and equalizes edge gaps", () => {
  const nodes = [
    node("left", 20, 40, 80, 40),
    node("middle-a", 250, 90, 120, 60),
    node("middle-b", 530, 15, 60, 50),
    node("right", 900, 120, 100, 70),
  ];
  const beforePositions = nodes.map((item) => ({ ...item.position }));
  const result = distributeSelection(nodes, "x");
  const after = nodes.map((item) => getNodeRect({ ...item, position: result.positions.get(item.id)! }));

  assert.equal(result.failure, null);
  assert.deepEqual(result.positions.get("left"), beforePositions[0]);
  assert.deepEqual(result.positions.get("right"), beforePositions[3]);
  assert.ok(Math.abs((after[1].left - after[0].right) - (after[2].left - after[1].right)) < 1e-9);
  assert.ok(Math.abs((after[2].left - after[1].right) - (after[3].left - after[2].right)) < 1e-9);
  assert.deepEqual(after.map((rect) => rect.top), [40, 90, 15, 120]);
});

test("vertical distribution preserves outer nodes and supports centered origins", () => {
  const nodes = [
    node("top", 140, 100, 80, 40, [0.5, 0.5]),
    node("middle", 350, 420, 130, 80, [0.5, 0.5]),
    node("bottom", 80, 900, 90, 60, [0.5, 0.5]),
  ];
  const result = distributeSelection(nodes, "y");
  const after = nodes.map((item) => getNodeRect({ ...item, position: result.positions.get(item.id)! }));

  assert.equal(result.failure, null);
  assert.deepEqual(result.positions.get("top"), nodes[0].position);
  assert.deepEqual(result.positions.get("bottom"), nodes[2].position);
  assert.ok(Math.abs((after[1].top - after[0].bottom) - (after[2].top - after[1].bottom)) < 1e-9);
  assert.deepEqual(after.map((rect) => rect.left), [100, 285, 35]);
});

test("distribution refuses an insufficient outer span without moving nodes", () => {
  const nodes = [
    node("a", 0, 0, 120, 40),
    node("b", 100, 80, 120, 40),
    node("c", 220, 160, 120, 40),
  ];
  const result = distributeSelection(nodes, "x");

  assert.equal(result.failure, "insufficient-span");
  assert.equal(result.positions.size, 0);
});

test("drag snapping aligns nearest centers and reports visible guides", () => {
  const dragged = createNodeRect("dragged", 96, 204, 100, 50);
  const other = createNodeRect("other", 200, 200, 100, 50);
  const snap = snapRectToAlignment(dragged, [other]);

  assert.equal(snap.dx, 4, "right edge should snap to the other node's left edge");
  assert.equal(snap.dy, -4, "top edges should align");
  assert.deepEqual(snap.verticalGuides, [200]);
  assert.deepEqual(snap.horizontalGuides, [200]);
});

test("drag snapping respects axis locks and ignores distant candidates", () => {
  const dragged = createNodeRect("dragged", 10, 10, 80, 40);
  const nearby = createNodeRect("nearby", 94, 15, 80, 40);
  const snap = snapRectToAlignment(dragged, [nearby], { allowX: false, threshold: 6 });

  assert.equal(snap.dx, 0);
  assert.equal(snap.dy, 5);
  assert.deepEqual(snap.verticalGuides, []);
  assert.deepEqual(snap.horizontalGuides, [15]);
});

test("center-only snapping prioritizes straight connector alignment over matching edges", () => {
  const dragged = createNodeRect("dragged", 100, 100, 80, 40);
  const connected = createNodeRect("connected", 100, 200, 100, 60);
  const snap = snapRectToAlignment(dragged, [connected], { centersOnly: true, threshold: 12 });

  assert.equal(snap.dx, 10);
  assert.equal(snap.dy, 0);
  assert.deepEqual(snap.verticalGuides, [150]);
  assert.deepEqual(snap.horizontalGuides, []);
});

test("grid snapping quantizes both axes and safely ignores invalid spacing", () => {
  assert.deepEqual(snapPointToGrid({ x: 47, y: 81 }, 32), { x: 32, y: 96 });
  assert.deepEqual(snapPointToGrid({ x: 47, y: 81 }, 0), { x: 47, y: 81 });
});

test("alignment snapping keeps a consistent screen-sized target across zoom levels", () => {
  assert.equal(alignmentSnapThreshold(2), 6);
  assert.equal(alignmentSnapThreshold(1), 12);
  assert.equal(alignmentSnapThreshold(0.5), 24);
  assert.equal(alignmentSnapThreshold(0.1), 48, "very low zoom stays bounded");
});
