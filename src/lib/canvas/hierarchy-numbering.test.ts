import assert from "node:assert/strict";
import test from "node:test";
import type { Edge, Node } from "@xyflow/react";
import {
  hierarchyNumberForNode,
  hierarchyNumberMap,
} from "./hierarchy-numbering";

function node(
  id: string,
  x: number,
  y: number,
  data: Record<string, unknown> = {},
  type = "shape"
): Node {
  return {
    id,
    type,
    position: { x, y },
    style: { width: 120, height: 60 },
    data,
  };
}

test("numbers roots, siblings, and descendants from persisted hierarchy order", () => {
  const nodes = [
    node("root", 0, 0, { childOrder: ["second", "first"] }),
    node("first", 0, 100, { parentId: "root" }),
    node("second", 150, 100, { parentId: "root" }),
    node("grandchild", 150, 200, { parentId: "second" }),
  ];

  assert.deepEqual(Object.fromEntries(hierarchyNumberMap(nodes, [])), {
    root: "1",
    second: "1.1",
    grandchild: "1.1.1",
    first: "1.2",
  });
});

test("uses directed edges as hierarchy fallback and orders separate roots by position", () => {
  const nodes = [
    node("lower-root", 0, 300),
    node("upper-root", 0, 0),
    node("child", 0, 100),
  ];
  const edges: Edge[] = [{ id: "edge", source: "upper-root", target: "child" }];

  assert.deepEqual(Object.fromEntries(hierarchyNumberMap(nodes, edges)), {
    "upper-root": "1",
    child: "1.1",
    "lower-root": "2",
  });
});

test("simple numbers restart for every sibling group", () => {
  const nodes = [
    node("root-a", 0, 0, { childOrder: ["a-1", "a-2"] }),
    node("a-1", 0, 100, { parentId: "root-a", childOrder: ["a-1-1", "a-1-2"] }),
    node("a-2", 100, 100, { parentId: "root-a" }),
    node("a-1-1", 0, 200, { parentId: "a-1" }),
    node("a-1-2", 100, 200, { parentId: "a-1" }),
    node("root-b", 0, 300),
  ];

  assert.deepEqual(Object.fromEntries(hierarchyNumberMap(nodes, [], "sibling")), {
    "root-a": "1",
    "a-1": "1",
    "a-1-1": "1",
    "a-1-2": "2",
    "a-2": "2",
    "root-b": "2",
  });
});

test("ignores generated canvas objects and attached notes", () => {
  const nodes = [
    node("frame", -200, -200, {}, "frame"),
    node("chart", -100, -100, {}, "sunburst"),
    node("note", 0, -50, { externalNote: true }, "text"),
    node("root", 0, 0),
  ];

  assert.deepEqual(Object.fromEntries(hierarchyNumberMap(nodes, [])), { root: "1" });
});

test("hidden badges preserve structural ordinals for later siblings and descendants", () => {
  const nodes = [
    node("root", 0, 0, { childOrder: ["first", "hidden", "third"] }),
    node("first", 0, 100, { parentId: "root" }),
    node("hidden", 100, 100, {
      parentId: "root",
      hideHierarchyNumber: true,
      childOrder: ["hidden-child"],
    }),
    node("hidden-child", 100, 200, { parentId: "hidden" }),
    node("third", 200, 100, { parentId: "root" }),
  ];
  const numbers = hierarchyNumberMap(nodes, []);

  assert.equal(numbers.get("hidden"), "1.2");
  assert.equal(numbers.get("hidden-child"), "1.2.1");
  assert.equal(numbers.get("third"), "1.3");
  assert.equal(hierarchyNumberForNode(nodes[2], numbers), undefined);
  assert.equal(hierarchyNumberForNode(nodes[3], numbers), "1.2.1");
});

test("deriving display numbers never mutates authored text or rich text", () => {
  const authored = node("root", 0, 0, {
    text: "Topic",
    richText: '<p style="text-align: center">Topic</p>',
  });
  const originalData = { ...authored.data };
  const numbers = hierarchyNumberMap([authored], []);

  assert.equal(hierarchyNumberForNode(authored, numbers), "1");
  assert.deepEqual(authored.data, originalData);
  assert.equal(authored.data.text, "Topic");
  assert.equal(authored.data.richText, '<p style="text-align: center">Topic</p>');
});
