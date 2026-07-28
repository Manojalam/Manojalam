import assert from "node:assert/strict";
import test from "node:test";
import type { Edge, Node } from "@xyflow/react";

import {
  computeTightExportBounds,
  resolveExportTarget,
  resolveSelectedSubtreeRoots,
} from "./bounds";

type Rect = { left: number; top: number; width: number; height: number };

function mockElement({
  attributes = {},
  rect,
  descendants = {},
}: {
  attributes?: Record<string, string>;
  rect: Rect;
  descendants?: Record<string, unknown[]>;
}) {
  return {
    getAttribute: (name: string) => attributes[name] ?? null,
    getBoundingClientRect: () => rect,
    querySelectorAll: (selector: string) => descendants[selector] ?? [],
    closest: () => null,
    matches: () => false,
  };
}

test("selected subtree includes descendants, attached text, and internal connections", () => {
  const nodes: Node[] = [
    {
      id: "parent",
      position: { x: 0, y: 0 },
      data: { parentId: null, childOrder: ["child"] },
    },
    {
      id: "child",
      position: { x: 100, y: 0 },
      data: { parentId: "parent", childOrder: ["grandchild"] },
    },
    {
      id: "grandchild",
      position: { x: 200, y: 0 },
      data: { parentId: "child", text: "Grandchild text" },
    },
    {
      id: "child-note",
      type: "text",
      position: { x: 100, y: 100 },
      data: {
        parentId: null,
        externalNote: true,
        noteForNodeId: "child",
        text: "Attached explanation",
      },
    },
    {
      id: "hidden-child",
      position: { x: 300, y: 0 },
      data: { parentId: "parent", text: "Hidden child" },
      hidden: true,
    },
    {
      id: "hidden-child-note",
      type: "text",
      position: { x: 300, y: 100 },
      data: {
        parentId: null,
        externalNote: true,
        noteForNodeId: "hidden-child",
        text: "Note for hidden child",
      },
    },
    {
      id: "other-parent",
      position: { x: 0, y: 200 },
      data: { parentId: null, childOrder: ["outside"] },
    },
    {
      id: "outside",
      position: { x: 100, y: 200 },
      data: { parentId: "other-parent" },
    },
  ];
  const edges: Edge[] = [
    { id: "parent-child", source: "parent", target: "child" },
    { id: "child-grandchild", source: "child", target: "grandchild" },
    { id: "internal-cross-link", source: "parent", target: "grandchild" },
    { id: "hidden-branch", source: "parent", target: "hidden-child" },
    { id: "external-cross-link", source: "parent", target: "outside" },
    { id: "other-branch", source: "other-parent", target: "outside" },
  ];

  const target = resolveExportTarget(
    { kind: "subtree", rootId: "parent" },
    nodes,
    edges
  );

  assert.equal(target.scopeKind, "subtree");
  assert.deepEqual(target.nodeIds, [
    "parent",
    "child",
    "grandchild",
    "child-note",
  ]);
  assert.deepEqual(target.edgeIds, [
    "parent-child",
    "child-grandchild",
    "internal-cross-link",
  ]);
});

test("selected parent branches export together with their complete hierarchies", () => {
  const nodes: Node[] = [
    { id: "root", position: { x: 0, y: 0 }, data: { childOrder: ["left", "right"] } },
    { id: "left", position: { x: 100, y: 0 }, data: { parentId: "root" } },
    { id: "left-child", position: { x: 200, y: 0 }, data: { parentId: "left" } },
    { id: "right", position: { x: 100, y: 100 }, data: { parentId: "root" } },
    { id: "right-child", position: { x: 200, y: 100 }, data: { parentId: "right" } },
    { id: "outside", position: { x: 0, y: 200 }, data: {} },
  ];
  const edges: Edge[] = [
    { id: "root-left", source: "root", target: "left" },
    { id: "left-child", source: "left", target: "left-child" },
    { id: "root-right", source: "root", target: "right" },
    { id: "right-child", source: "right", target: "right-child" },
  ];

  const target = resolveExportTarget(
    {
      kind: "subtree",
      rootId: "left",
      rootIds: ["left", "right"],
    },
    nodes,
    edges
  );

  assert.deepEqual(target.nodeIds, [
    "left",
    "left-child",
    "right",
    "right-child",
  ]);
  assert.deepEqual(target.edgeIds, [
    "left-child",
    "right-child",
  ]);
});

test("branch selections collapse nested nodes but retain independent selected parents", () => {
  const nodes: Node[] = [
    { id: "root", position: { x: 0, y: 0 }, data: {} },
    { id: "left", position: { x: 100, y: 0 }, data: { parentId: "root" } },
    { id: "left-child", position: { x: 200, y: 0 }, data: { parentId: "left" } },
    { id: "right", position: { x: 100, y: 100 }, data: { parentId: "root" } },
    { id: "right-child", position: { x: 200, y: 100 }, data: { parentId: "right" } },
  ];

  const selection = resolveSelectedSubtreeRoots(
    ["left", "left-child", "right"],
    nodes,
    []
  );

  assert.deepEqual(selection.rootIds, ["left", "right"]);
  assert.equal(selection.hasVisibleDescendants, true);
  assert.deepEqual(
    resolveSelectedSubtreeRoots(["left-child"], nodes, []),
    { rootIds: ["left-child"], hasVisibleDescendants: false }
  );
});

test("live chart DOM bounds replace stale React Flow measurements", () => {
  const node: Node = {
    id: "chart",
    type: "sunburst",
    position: { x: 100, y: 200 },
    data: {},
    // This can temporarily retain an old expanded visual size after a chart
    // resize while the actual node has already rendered at 600 x 600.
    measured: { width: 1_400, height: 12_000 },
    style: { width: 600, height: 600 },
  };
  const target = resolveExportTarget(
    { kind: "selection", nodeIds: [node.id], edgeIds: [] },
    [node],
    []
  );
  const renderedNode = mockElement({
    attributes: { "data-id": node.id },
    // Flow rect (100, 200, 600, 600) at viewport (30, 40, 0.1).
    rect: { left: 40, top: 60, width: 60, height: 60 },
  });
  const root = {
    querySelectorAll: (selector: string) => selector === ".react-flow__node[data-id]"
      ? [renderedNode]
      : [],
  };
  const flowContainer = mockElement({
    rect: { left: 0, top: 0, width: 1_920, height: 1_080 },
  });

  const bounds = computeTightExportBounds(target, {
    padding: 0,
    dom: {
      root: root as unknown as ParentNode,
      flowContainer: flowContainer as unknown as Element,
      viewport: { x: 30, y: 40, zoom: 0.1 },
    },
  });

  assert.deepEqual(bounds, { x: 100, y: 200, width: 600, height: 600 });
});

test("whole-board bounds tightly union rendered objects instead of stale model space", () => {
  const nodes: Node[] = [
    {
      id: "first-card",
      position: { x: 80, y: 120 },
      data: {},
      measured: { width: 900, height: 18_000 },
      style: { width: 320, height: 180 },
    },
    {
      id: "second-card",
      position: { x: 460, y: 390 },
      data: {},
      measured: { width: 4_000, height: 8_000 },
      style: { width: 280, height: 210 },
    },
  ];
  const target = resolveExportTarget({ kind: "board" }, nodes, []);
  const renderedNodes = [
    mockElement({
      attributes: { "data-id": nodes[0].id },
      rect: { left: 80, top: 120, width: 320, height: 180 },
    }),
    mockElement({
      attributes: { "data-id": nodes[1].id },
      rect: { left: 460, top: 390, width: 280, height: 210 },
    }),
  ];
  const root = {
    querySelectorAll: (selector: string) => selector === ".react-flow__node[data-id]"
      ? renderedNodes
      : [],
  };
  const flowContainer = mockElement({
    rect: { left: 0, top: 0, width: 1_920, height: 1_080 },
  });

  const bounds = computeTightExportBounds(target, {
    padding: 32,
    dom: {
      root: root as unknown as ParentNode,
      flowContainer: flowContainer as unknown as Element,
      viewport: { x: 0, y: 0, zoom: 1 },
    },
  });

  assert.deepEqual(bounds, { x: 48, y: 88, width: 724, height: 544 });
});

test("model bounds remain the fallback for a target without rendered DOM", () => {
  const node: Node = {
    id: "not-rendered",
    position: { x: 40, y: 60 },
    data: {},
    measured: { width: 240, height: 180 },
  };
  const target = resolveExportTarget(
    { kind: "selection", nodeIds: [node.id], edgeIds: [] },
    [node],
    []
  );
  const root = { querySelectorAll: () => [] };
  const flowContainer = mockElement({
    rect: { left: 0, top: 0, width: 1_920, height: 1_080 },
  });

  const bounds = computeTightExportBounds(target, {
    padding: 0,
    dom: {
      root: root as unknown as ParentNode,
      flowContainer: flowContainer as unknown as Element,
      viewport: { x: 0, y: 0, zoom: 1 },
    },
  });

  assert.deepEqual(bounds, { x: 40, y: 60, width: 240, height: 180 });
});

test("model fallback bounds include an anchored speech tail", () => {
  const node: Node = {
    id: "anchored-callout",
    type: "text",
    position: { x: 200, y: 180 },
    data: {
      textFrameStyle: "speech",
      textCalloutAnchor: { x: 80, y: 120 },
    },
    measured: { width: 240, height: 80 },
  };
  const target = resolveExportTarget({ kind: "board" }, [node], []);

  assert.deepEqual(
    computeTightExportBounds(target, { padding: 0 }),
    { x: 80, y: 120, width: 360, height: 140 }
  );
});

test("attached callout export bounds ignore stale canvas anchors", () => {
  const owner: Node = {
    id: "owner",
    type: "shape",
    position: { x: 100, y: 200 },
    data: { shapeType: "rounded" },
    measured: { width: 200, height: 80 },
  };
  const note: Node = {
    id: "attached-callout",
    type: "text",
    position: { x: 340, y: 180 },
    data: {
      externalNote: true,
      noteForNodeId: owner.id,
      textFrameStyle: "speech",
      textCalloutAnchor: { x: -900, y: 1_400 },
    },
    measured: { width: 220, height: 72 },
  };
  const target = resolveExportTarget({ kind: "board" }, [owner, note], []);

  assert.deepEqual(
    computeTightExportBounds(target, { padding: 0 }),
    { x: 100, y: 180, width: 460, height: 100 }
  );
});

test("a note-only export still derives its tail from the parent shape", () => {
  const owner: Node = {
    id: "owner",
    type: "shape",
    position: { x: 100, y: 200 },
    data: { shapeType: "rounded" },
    measured: { width: 200, height: 80 },
  };
  const note: Node = {
    id: "attached-callout",
    type: "text",
    position: { x: 340, y: 180 },
    data: {
      externalNote: true,
      noteForNodeId: owner.id,
      textFrameStyle: "speech",
      textCalloutAnchor: { x: -900, y: 1_400 },
      textCalloutOwnerAnchor: { x: 0.5, y: 0.5 },
    },
    measured: { width: 220, height: 72 },
  };
  const target = resolveExportTarget(
    { kind: "selection", nodeIds: [note.id], edgeIds: [] },
    [owner, note],
    []
  );

  assert.deepEqual(
    computeTightExportBounds(target, { padding: 0 }),
    { x: 200, y: 180, width: 360, height: 72 }
  );
});

test("explicit chart ink bounds still extend the authoritative node DOM rectangle", () => {
  const node: Node = {
    id: "chart-with-overflow",
    position: { x: 100, y: 200 },
    data: {},
    measured: { width: 3_000, height: 9_000 },
  };
  const target = resolveExportTarget(
    { kind: "selection", nodeIds: [node.id], edgeIds: [] },
    [node],
    []
  );
  const visibleInk = mockElement({
    rect: { left: 80, top: 190, width: 670, height: 630 },
  });
  const renderedNode = mockElement({
    attributes: { "data-id": node.id },
    rect: { left: 100, top: 200, width: 600, height: 600 },
    descendants: { "[data-export-bounds]": [visibleInk] },
  });
  const root = {
    querySelectorAll: (selector: string) => selector === ".react-flow__node[data-id]"
      ? [renderedNode]
      : [],
  };
  const flowContainer = mockElement({
    rect: { left: 0, top: 0, width: 1_920, height: 1_080 },
  });

  const bounds = computeTightExportBounds(target, {
    padding: 0,
    dom: {
      root: root as unknown as ParentNode,
      flowContainer: flowContainer as unknown as Element,
      viewport: { x: 0, y: 0, zoom: 1 },
    },
  });

  assert.deepEqual(bounds, { x: 80, y: 190, width: 670, height: 630 });
});
