import assert from "node:assert/strict";
import test from "node:test";
import type { Edge, Node } from "@xyflow/react";
import {
  hierarchyNumberMap,
  prependHierarchyNumber,
  prependHierarchyNumberToRichText,
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

test("ignores generated canvas objects and attached notes", () => {
  const nodes = [
    node("frame", -200, -200, {}, "frame"),
    node("chart", -100, -100, {}, "sunburst"),
    node("note", 0, -50, { externalNote: true }, "text"),
    node("root", 0, 0),
  ];

  assert.deepEqual(Object.fromEntries(hierarchyNumberMap(nodes, [])), { root: "1" });
});

test("prefixes plain and rich text without altering the authored value", () => {
  const richText = '<p style="text-align: center">Topic</p>';

  assert.equal(prependHierarchyNumber("Topic", "2.3"), "2.3 Topic");
  assert.equal(
    prependHierarchyNumberToRichText(richText, "2.3"),
    '<p style="text-align: center">2.3&nbsp;Topic</p>'
  );
  assert.equal(prependHierarchyNumberToRichText(richText, undefined), richText);
  assert.equal(prependHierarchyNumberToRichText("", "1"), "<p>1&nbsp;</p>");
});
