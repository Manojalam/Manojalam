import assert from "node:assert/strict";
import test from "node:test";
import type { Edge, Node } from "@xyflow/react";
import {
  hierarchyNumberForNode,
  hierarchyNumberMap,
  migrateLegacyHierarchyNumberingScopes,
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

test("numbers only the layout diagram whose root enables a scope", () => {
  const nodes = [
    node("root", 0, 0, {
      hierarchicalNumbering: true,
      childOrder: ["second", "first"],
    }),
    node("first", 0, 100, { parentId: "root" }),
    node("second", 150, 100, {
      parentId: "root",
      childOrder: ["grandchild"],
    }),
    node("grandchild", 150, 200, { parentId: "second" }),
    node("other-root", 400, 0, { childOrder: ["other-child"] }),
    node("other-child", 400, 100, { parentId: "other-root" }),
  ];

  assert.deepEqual(Object.fromEntries(hierarchyNumberMap(nodes, [])), {
    root: "1",
    second: "1.1",
    grandchild: "1.1.1",
    first: "1.2",
  });
});

test("separate numbered layout diagrams each restart at 1", () => {
  const nodes = [
    node("first-root", 0, 0, {
      hierarchicalNumbering: true,
      childOrder: ["first-child"],
    }),
    node("first-child", 0, 100, { parentId: "first-root" }),
    node("second-root", 300, 0, {
      hierarchicalNumbering: true,
      childOrder: ["second-child"],
    }),
    node("second-child", 300, 100, { parentId: "second-root" }),
  ];

  assert.deepEqual(Object.fromEntries(hierarchyNumberMap(nodes, [])), {
    "first-root": "1",
    "first-child": "1.1",
    "second-root": "1",
    "second-child": "1.1",
  });
});

test("an inner branch can be numbered without numbering its outer diagram", () => {
  const nodes = [
    node("outer-root", 0, 0, { childOrder: ["inner", "outer-sibling"] }),
    node("inner", 0, 100, {
      parentId: "outer-root",
      hierarchicalNumbering: true,
      childOrder: ["inner-child"],
    }),
    node("inner-child", 0, 200, { parentId: "inner" }),
    node("outer-sibling", 150, 100, { parentId: "outer-root" }),
  ];

  assert.deepEqual(Object.fromEntries(hierarchyNumberMap(nodes, [])), {
    inner: "1",
    "inner-child": "1.1",
  });
});

test("a nested scope restarts and overrides inherited numbers in its subtree", () => {
  const nodes = [
    node("root", 0, 0, {
      hierarchicalNumbering: true,
      childOrder: ["sibling", "inner"],
    }),
    node("sibling", 0, 100, { parentId: "root" }),
    node("inner", 150, 100, {
      parentId: "root",
      hierarchicalNumbering: true,
      childOrder: ["inner-child"],
    }),
    node("inner-child", 150, 200, { parentId: "inner" }),
  ];

  assert.deepEqual(Object.fromEntries(hierarchyNumberMap(nodes, [])), {
    root: "1",
    sibling: "1.1",
    inner: "1",
    "inner-child": "1.1",
  });
});

test("simple numbers restart for every sibling group inside their scope", () => {
  const nodes = [
    node("root", 0, 0, {
      hierarchicalNumbering: true,
      hierarchicalNumberingFormat: "sibling",
      childOrder: ["first", "second"],
    }),
    node("first", 0, 100, {
      parentId: "root",
      childOrder: ["first-child", "second-child"],
    }),
    node("second", 100, 100, { parentId: "root" }),
    node("first-child", 0, 200, { parentId: "first" }),
    node("second-child", 100, 200, { parentId: "first" }),
  ];

  assert.deepEqual(Object.fromEntries(hierarchyNumberMap(nodes, [])), {
    root: "1",
    first: "1",
    "first-child": "1",
    "second-child": "2",
    second: "2",
  });
});

test("uses directed edges as a hierarchy fallback inside a branch scope", () => {
  const nodes = [
    node("root", 0, 0, { hierarchicalNumbering: true }),
    node("child", 0, 100),
    node("unrelated", 300, 0),
  ];
  const edges: Edge[] = [{ id: "edge", source: "root", target: "child" }];

  assert.deepEqual(Object.fromEntries(hierarchyNumberMap(nodes, edges)), {
    root: "1",
    child: "1.1",
  });
});

test("ignores generated canvas objects and attached notes", () => {
  const nodes = [
    node("frame", -200, -200, { hierarchicalNumbering: true }, "frame"),
    node("chart", -100, -100, { hierarchicalNumbering: true }, "sunburst"),
    node("note", 0, -50, {
      externalNote: true,
      hierarchicalNumbering: true,
    }, "text"),
    node("root", 0, 0, { hierarchicalNumbering: true }),
  ];

  assert.deepEqual(Object.fromEntries(hierarchyNumberMap(nodes, [])), { root: "1" });
});

test("hidden badges preserve structural ordinals for later siblings and descendants", () => {
  const nodes = [
    node("root", 0, 0, {
      hierarchicalNumbering: true,
      childOrder: ["first", "hidden", "third"],
    }),
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
    hierarchicalNumbering: true,
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

test("migrates a legacy board-wide setting to one scope per layout diagram", () => {
  const nodes = [
    node("first-root", 0, 0, { childOrder: ["first-child"] }),
    node("first-child", 0, 100, { parentId: "first-root" }),
    node("second-root", 300, 0, { childOrder: ["second-child"] }),
    node("second-child", 300, 100, { parentId: "second-root" }),
    node("standalone", 600, 0),
  ];
  const migrated = migrateLegacyHierarchyNumberingScopes(nodes, [], true, "sibling");
  const migratedById = new Map(migrated.map((entry) => [entry.id, entry]));

  assert.equal(migratedById.get("first-root")?.data.hierarchicalNumbering, true);
  assert.equal(migratedById.get("first-root")?.data.hierarchicalNumberingFormat, "sibling");
  assert.equal(migratedById.get("second-root")?.data.hierarchicalNumbering, true);
  assert.equal(migratedById.get("standalone")?.data.hierarchicalNumbering, undefined);
  assert.deepEqual(Object.fromEntries(hierarchyNumberMap(migrated, [])), {
    "first-root": "1",
    "first-child": "1",
    "second-root": "1",
    "second-child": "1",
  });
  assert.equal(nodes[0].data.hierarchicalNumbering, undefined);
});
