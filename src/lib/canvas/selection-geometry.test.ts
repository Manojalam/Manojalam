import assert from "node:assert/strict";
import test from "node:test";
import type { Node } from "@xyflow/react";
import { createNodeRect, getNodeRect } from "../layout/geometry";
import {
  alignmentSnapThreshold,
  alignSelection,
  arrangeSelectionInColumns,
  compactEqualSpacing,
  distributeSelection,
  preserveSnappedDragEndPositions,
  pushNodesBelowSelectionGrowth,
  pushNodesRightOfSelectionGrowth,
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

test("column arrangement preserves board order despite rough positions and varying widths", () => {
  const nodes = [
    node("1", 520, 40, 180, 70),
    node("2", 80, 260, 120, 90),
    node("3", 540, 320, 140, 110),
    node("4", 40, 20, 200, 60),
    node("5", 70, 500, 140, 50),
  ];
  const result = arrangeSelectionInColumns(nodes, {
    columnCount: 2,
    columnGap: 80,
    rowGap: 24,
  });
  const after = new Map(nodes.map((item) => [
    item.id,
    getNodeRect({ ...item, position: result.positions.get(item.id)! }),
  ]));

  assert.deepEqual(result.columns, [
    ["1", "2", "3"],
    ["4", "5"],
  ]);
  assert.equal(after.get("1")!.top, 20);
  assert.equal(after.get("2")!.top - after.get("1")!.bottom, 130);
  assert.equal(after.get("3")!.top - after.get("2")!.bottom, 130);
  assert.equal(after.get("4")!.top, 20);
  assert.equal(after.get("5")!.top - after.get("4")!.bottom, 420);
  assert.equal(after.get("3")!.bottom, after.get("5")!.bottom);
  assert.equal(after.get("3")!.bottom, 550, "existing outer bottom remains the anchor");
  assert.equal(after.get("4")!.left, 40 + 180 + 80);
});

test("fifteen ordered cards split into three consecutive columns", () => {
  const nodes = Array.from({ length: 15 }, (_, index) => (
    node(
      String(index + 1),
      index % 2 === 0 ? 600 - index * 11 : 40 + index * 13,
      700 - index * 29,
      120 + (index % 4) * 30,
      50 + (index % 3) * 20
    )
  ));
  const result = arrangeSelectionInColumns(nodes, { columnCount: 3 });

  assert.deepEqual(result.columns, [
    ["1", "2", "3", "4", "5"],
    ["6", "7", "8", "9", "10"],
    ["11", "12", "13", "14", "15"],
  ]);
});

test("matched column widths use each column's widest card and support centered origins", () => {
  const nodes = [
    node("a", 100, 80, 120, 50, [0.5, 0.5]),
    node("b", 100, 240, 200, 80, [0.5, 0.5]),
    node("c", 500, 70, 160, 60),
    node("d", 500, 220, 140, 90),
  ];
  const result = arrangeSelectionInColumns(nodes, {
    columnCount: 2,
    matchColumnWidths: true,
    columnGap: 72,
    rowGap: 28,
  });

  assert.deepEqual(
    [...result.widths.entries()],
    [["a", 200], ["b", 200], ["c", 160], ["d", 160]]
  );
  const after = nodes.map((item) => getNodeRect({
    ...item,
    position: result.positions.get(item.id)!,
    style: { ...item.style, width: result.widths.get(item.id) },
    measured: undefined,
    width: undefined,
  }));
  assert.equal(after[0].left, after[1].left);
  assert.equal(after[2].left, after[3].left);
  assert.equal(after[2].left - after[0].right, 72);
  assert.equal(after[1].top - after[0].bottom, 125);
  assert.equal(after[3].top - after[2].bottom, 105);
  assert.equal(after[0].top, after[2].top);
  assert.equal(after[1].bottom, after[3].bottom);
  assert.equal(after[1].bottom, 310);
});

test("selection growth pushes every later card in the same column", () => {
  const nodes = [
    node("first", 40, 20, 180, 100),
    node("second", 40, 150, 180, 60),
    node("third", 40, 240, 180, 80),
    node("fourth", 40, 350, 180, 70),
    node("other-column", 320, 160, 180, 80),
  ];
  const positions = pushNodesBelowSelectionGrowth(
    nodes,
    new Map([["first", 100], ["second", 110]])
  );

  assert.equal(positions.has("first"), false);
  assert.equal(positions.has("second"), false);
  assert.deepEqual(positions.get("third"), { x: 40, y: 290 });
  assert.deepEqual(positions.get("fourth"), { x: 40, y: 400 });
  assert.equal(positions.has("other-column"), false);
});

test("growth shifts accumulate while preserving the gaps below each resized card", () => {
  const nodes = [
    node("first", 60, 20, 200, 50),
    node("second", 60, 100, 200, 40),
    node("third", 60, 180, 200, 60),
  ];
  const positions = pushNodesBelowSelectionGrowth(
    nodes,
    new Map([["first", 80], ["second", 90]])
  );
  const resized = nodes.map((item) => getNodeRect({
    ...item,
    position: positions.get(item.id) ?? item.position,
    style: {
      ...item.style,
      height: item.id === "first" ? 80 : item.id === "second" ? 90 : 60,
    },
    measured: undefined,
    height: undefined,
  }));

  assert.deepEqual(positions.get("second"), { x: 60, y: 130 });
  assert.deepEqual(positions.get("third"), { x: 60, y: 260 });
  assert.equal(resized[1].top - resized[0].bottom, 30);
  assert.equal(resized[2].top - resized[1].bottom, 40);
});

test("width growth moves later columns once by the added column boundary", () => {
  const nodes = [
    node("first-a", 40, 20, 100, 60),
    node("first-b", 40, 120, 120, 60),
    node("second-a", 240, 20, 140, 60),
    node("second-b", 240, 120, 140, 60),
    node("third", 460, 20, 160, 60),
  ];
  const positions = pushNodesRightOfSelectionGrowth(
    nodes,
    new Map([["first-a", 200], ["first-b", 200]])
  );

  assert.equal(positions.has("first-a"), false);
  assert.equal(positions.has("first-b"), false);
  assert.deepEqual(positions.get("second-a"), { x: 320, y: 20 });
  assert.deepEqual(positions.get("second-b"), { x: 320, y: 120 });
  assert.deepEqual(positions.get("third"), { x: 540, y: 20 });
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

test("drag release keeps the red-guide position instead of restoring the raw pointer position", () => {
  const changes = preserveSnappedDragEndPositions([
    {
      id: "dragged",
      type: "position",
      position: { x: 104, y: 211 },
      dragging: false,
    },
    {
      id: "other",
      type: "position",
      position: { x: 300, y: 400 },
      dragging: false,
    },
  ], new Set(["dragged"]));

  assert.deepEqual(changes, [
    { id: "dragged", type: "position", dragging: false },
    {
      id: "other",
      type: "position",
      position: { x: 300, y: 400 },
      dragging: false,
    },
  ]);
});

test("live drag and non-pointer position changes retain their coordinates", () => {
  const changes = [
    { id: "dragged", type: "position" as const, position: { x: 104, y: 211 }, dragging: true },
    { id: "dragged", type: "position" as const, position: { x: 105, y: 212 } },
  ];

  assert.deepEqual(
    preserveSnappedDragEndPositions(changes, new Set(["dragged"])),
    changes
  );
});

test("alignment snapping keeps a consistent screen-sized target across zoom levels", () => {
  assert.equal(alignmentSnapThreshold(2), 6);
  assert.equal(alignmentSnapThreshold(1), 12);
  assert.equal(alignmentSnapThreshold(0.5), 24);
  assert.equal(alignmentSnapThreshold(0.1), 48, "very low zoom stays bounded");
});
