import assert from "node:assert/strict";
import test from "node:test";
import type { Edge, Node } from "@xyflow/react";
import { buildHierarchy } from "./hierarchy";
import {
  defaultFoldBreakAfter,
  hasFoldedChildSections,
  resolvedFoldSectionCount,
  resolvedManualFoldBreakAfter,
  wrapChildGroups,
} from "./child-group-wrap";

function node(id: string, x: number, y: number, data: Record<string, unknown> = {}): Node {
  return { id, type: "shape", position: { x, y }, style: { width: 100, height: 40 }, data };
}

test("ten children can be folded into two adjacent vertical sections of five", () => {
  const root = node("root", 0, 180, { layoutFoldCount: 2 });
  const children = Array.from({ length: 10 }, (_, index) => node(`child-${index}`, 200, index * 60, { parentId: "root" }));
  const nodes = [root, ...children];
  const edges: Edge[] = children.map((child, index) => ({ id: `edge-${index}`, source: "root", target: child.id }));
  const placements = Object.fromEntries(nodes.map((item) => [item.id, { ...item.position }]));

  const wrapped = wrapChildGroups(
    placements,
    buildHierarchy(nodes, edges),
    new Map(nodes.map((item) => [item.id, item])),
    () => "horizontal"
  );

  assert.equal(wrapped["child-0"].x, wrapped["child-4"].x);
  assert.equal(wrapped["child-5"].x, wrapped["child-9"].x);
  assert.ok(wrapped["child-5"].x > wrapped["child-0"].x);
  assert.equal(wrapped["child-0"].y, wrapped["child-5"].y);
});

test("uneven child counts are balanced while sibling order is preserved", () => {
  const root = node("root", 0, 180, { layoutFoldCount: 3 });
  const children = Array.from({ length: 7 }, (_, index) => node(`child-${index}`, 200, index * 60, { parentId: "root" }));
  const nodes = [root, ...children];
  const edges: Edge[] = children.map((child, index) => ({ id: `edge-${index}`, source: "root", target: child.id }));
  const placements = Object.fromEntries(nodes.map((item) => [item.id, { ...item.position }]));
  const wrapped = wrapChildGroups(
    placements,
    buildHierarchy(nodes, edges),
    new Map(nodes.map((item) => [item.id, item])),
    () => "horizontal"
  );

  assert.equal(wrapped["child-0"].x, wrapped["child-2"].x);
  assert.ok(wrapped["child-3"].x > wrapped["child-2"].x);
  assert.equal(wrapped["child-3"].x, wrapped["child-4"].x);
  assert.ok(wrapped["child-5"].x > wrapped["child-4"].x);
  assert.equal(wrapped["child-5"].x, wrapped["child-6"].x);
  assert.equal(wrapped["child-0"].y, wrapped["child-3"].y);
  assert.equal(wrapped["child-3"].y, wrapped["child-5"].y);
  assert.equal(hasFoldedChildSections(nodes), true);
});

test("automatic Fold balances rendered subtree height instead of child count", () => {
  const root = node("root", 0, 180, { layoutFoldCount: 2 });
  const heights = [100, 100, 100, 200, 50, 50, 50];
  let top = 0;
  const children = heights.map((height, index) => {
    const child = {
      ...node(`child-${index}`, 200, top, { parentId: "root" }),
      style: { width: 100, height },
    };
    top += height;
    return child;
  });
  const nodes = [root, ...children];
  const edges: Edge[] = children.map((child, index) => ({ id: `edge-${index}`, source: "root", target: child.id }));
  const placements = Object.fromEntries(nodes.map((item) => [item.id, { ...item.position }]));

  const wrapped = wrapChildGroups(
    placements,
    buildHierarchy(nodes, edges),
    new Map(nodes.map((item) => [item.id, item])),
    () => "horizontal"
  );

  assert.equal(wrapped["child-0"].x, wrapped["child-2"].x);
  assert.ok(wrapped["child-3"].x > wrapped["child-2"].x);
  assert.equal(wrapped["child-3"].x, wrapped["child-6"].x);
  assert.equal(wrapped["child-0"].y, wrapped["child-3"].y);
});

test("near-equal Fold choices prefer a fuller earlier section", () => {
  const root = node("root", 0, 180, { layoutFoldCount: 2 });
  const heights = [140, 140, 255, 140, 140, 70, 70, 35, 35, 35, 35, 35, 35, 35];
  let top = 0;
  const children = heights.map((height, index) => {
    const child = {
      ...node(`child-${index}`, 200, top, { parentId: "root" }),
      style: { width: 100, height },
    };
    top += height;
    return child;
  });
  const nodes = [root, ...children];
  const edges: Edge[] = children.map((child, index) => ({ id: `edge-${index}`, source: "root", target: child.id }));
  const placements = Object.fromEntries(nodes.map((item) => [item.id, { ...item.position }]));

  const wrapped = wrapChildGroups(
    placements,
    buildHierarchy(nodes, edges),
    new Map(nodes.map((item) => [item.id, item])),
    () => "horizontal"
  );

  assert.equal(wrapped["child-0"].x, wrapped["child-3"].x);
  assert.ok(wrapped["child-4"].x > wrapped["child-3"].x);
  assert.equal(wrapped["child-4"].x, wrapped["child-13"].x);
});

test("stacked Fold sections balance rendered width", () => {
  const root = node("root", 180, 0, { layoutFoldCount: 2 });
  const widths = [100, 100, 100, 200, 50, 50, 50];
  let left = 0;
  const children = widths.map((width, index) => {
    const child = {
      ...node(`child-${index}`, left, 200, { parentId: "root" }),
      style: { width, height: 40 },
    };
    left += width;
    return child;
  });
  const nodes = [root, ...children];
  const edges: Edge[] = children.map((child, index) => ({ id: `edge-${index}`, source: "root", target: child.id }));
  const placements = Object.fromEntries(nodes.map((item) => [item.id, { ...item.position }]));

  const wrapped = wrapChildGroups(
    placements,
    buildHierarchy(nodes, edges),
    new Map(nodes.map((item) => [item.id, item])),
    () => "vertical"
  );

  assert.equal(wrapped["child-0"].y, wrapped["child-2"].y);
  assert.ok(wrapped["child-3"].y > wrapped["child-2"].y);
  assert.equal(wrapped["child-3"].y, wrapped["child-6"].y);
  assert.equal(wrapped["child-0"].x, wrapped["child-3"].x);
});

test("custom Fold breaks override automatic height balancing", () => {
  const root = node("root", 0, 180, {
    layoutFoldCount: 2,
    layoutFoldBreakAfter: ["child-3"],
  });
  const heights = [100, 100, 100, 200, 50, 50, 50];
  let top = 0;
  const children = heights.map((height, index) => {
    const child = {
      ...node(`child-${index}`, 200, top, { parentId: "root" }),
      style: { width: 100, height },
    };
    top += height;
    return child;
  });
  const nodes = [root, ...children];
  const edges: Edge[] = children.map((child, index) => ({ id: `edge-${index}`, source: "root", target: child.id }));
  const placements = Object.fromEntries(nodes.map((item) => [item.id, { ...item.position }]));

  const wrapped = wrapChildGroups(
    placements,
    buildHierarchy(nodes, edges),
    new Map(nodes.map((item) => [item.id, item])),
    () => "horizontal"
  );

  assert.equal(wrapped["child-0"].x, wrapped["child-3"].x);
  assert.ok(wrapped["child-4"].x > wrapped["child-3"].x);
  assert.equal(wrapped["child-4"].x, wrapped["child-6"].x);
});

test("a child and all of its descendants move together", () => {
  const nodes = [
    node("root", 0, 60, { layoutFoldCount: 2 }),
    node("first", 200, 0, { parentId: "root" }),
    node("second", 200, 120, { parentId: "root" }),
    node("grandchild", 360, 120, { parentId: "second" }),
  ];
  const edges: Edge[] = [
    { id: "root-first", source: "root", target: "first" },
    { id: "root-second", source: "root", target: "second" },
    { id: "second-grandchild", source: "second", target: "grandchild" },
  ];
  const placements = Object.fromEntries(nodes.map((item) => [item.id, { ...item.position }]));
  const wrapped = wrapChildGroups(
    placements,
    buildHierarchy(nodes, edges),
    new Map(nodes.map((item) => [item.id, item])),
    () => "horizontal"
  );

  assert.equal(
    wrapped.grandchild.x - wrapped.second.x,
    placements.grandchild.x - placements.second.x
  );
  assert.equal(
    wrapped.grandchild.y - wrapped.second.y,
    placements.grandchild.y - placements.second.y
  );
});

test("legacy Fold-after values resolve to the equivalent section count", () => {
  assert.equal(resolvedFoldSectionCount({ layoutWrapAfter: 5 }, 10), 2);
  assert.equal(resolvedFoldSectionCount({ layoutWrapAfter: 3 }, 7), 3);
  assert.equal(resolvedFoldSectionCount({}, 10), 1);
});

test("custom Fold break metadata is validated against the current sibling order", () => {
  const children = Array.from({ length: 7 }, (_, index) => `child-${index}`);
  assert.deepEqual(defaultFoldBreakAfter(children, 2), ["child-3"]);
  assert.deepEqual(
    resolvedManualFoldBreakAfter({ layoutFoldBreakAfter: ["child-2"] }, children, 2),
    ["child-2"]
  );
  assert.equal(
    resolvedManualFoldBreakAfter({ layoutFoldBreakAfter: ["missing"] }, children, 2),
    null
  );
});
