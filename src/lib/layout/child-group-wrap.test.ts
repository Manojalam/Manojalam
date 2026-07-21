import assert from "node:assert/strict";
import test from "node:test";
import type { Edge, Node } from "@xyflow/react";
import { buildHierarchy } from "./hierarchy";
import {
  hasFoldedChildSections,
  resolvedFoldSectionCount,
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
