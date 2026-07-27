import assert from "node:assert/strict";
import test from "node:test";
import type { Edge, Node } from "@xyflow/react";
import {
  clearSelectedNodeContents,
  createManojalamClipboardPayload,
  isTextEditingTarget,
  MANOJALAM_NODES_MIME,
  parseManojalamClipboard,
  prepareDuplicatedNodeData,
  selectionWithHierarchyDescendants,
  serializeManojalamClipboard,
  shouldHandleCanvasClipboard,
  visibleBoardSelection,
} from "./clipboard";

function target(matches: boolean): EventTarget {
  return { closest: () => matches ? {} : null } as unknown as EventTarget;
}

test("canvas clipboard routing yields to active text editors", () => {
  assert.equal(isTextEditingTarget(target(true)), true);
  assert.equal(shouldHandleCanvasClipboard(target(false), target(true)), false);
  assert.equal(shouldHandleCanvasClipboard(target(false), target(false)), true);
});

test("board select-all includes visible nodes and connectors only", () => {
  const nodes: Node[] = [
    { id: "visible", position: { x: 0, y: 0 }, data: {} },
    { id: "hidden", position: { x: 0, y: 0 }, data: {}, hidden: true },
  ];
  const edges: Edge[] = [
    { id: "edge-visible", source: "visible", target: "visible" },
    { id: "edge-hidden", source: "visible", target: "visible", hidden: true },
  ];

  assert.deepEqual(visibleBoardSelection(nodes, edges), {
    nodeIds: ["visible"],
    edgeIds: ["edge-visible"],
  });
});

test("copying a parent includes every descendant, owned text box, and internal connection", () => {
  const nodes: Node[] = [
    {
      id: "root",
      position: { x: 0, y: 0 },
      data: { parentId: null, childOrder: ["child"] },
    },
    {
      id: "child",
      position: { x: 100, y: 0 },
      data: { parentId: "root", childOrder: ["grandchild"] },
    },
    {
      id: "grandchild",
      position: { x: 200, y: 0 },
      data: { parentId: "child" },
    },
    {
      id: "child-note",
      type: "text",
      position: { x: 100, y: 100 },
      data: {
        externalNote: true,
        noteForNodeId: "child",
        text: "Owned explanation",
      },
    },
    {
      id: "other-root",
      position: { x: 0, y: 200 },
      data: { parentId: null, childOrder: ["outside"] },
    },
    {
      id: "outside",
      position: { x: 100, y: 200 },
      data: { parentId: "other-root" },
    },
  ];
  const edges: Edge[] = [
    { id: "root-child", source: "root", target: "child" },
    { id: "child-grandchild", source: "child", target: "grandchild" },
    { id: "root-grandchild-cross-link", source: "root", target: "grandchild" },
    { id: "root-outside-cross-link", source: "root", target: "outside" },
    { id: "other-outside", source: "other-root", target: "outside" },
  ];

  const selection = selectionWithHierarchyDescendants(nodes, edges, ["root"]);

  assert.deepEqual(selection.nodes.map((node) => node.id), [
    "root",
    "child",
    "grandchild",
    "child-note",
  ]);
  assert.deepEqual(selection.edges.map((edge) => edge.id), [
    "root-child",
    "child-grandchild",
    "root-grandchild-cross-link",
  ]);
});

test("copying a child includes its descendants without pulling in its parent", () => {
  const nodes: Node[] = [
    { id: "root", position: { x: 0, y: 0 }, data: { childOrder: ["child"] } },
    { id: "child", position: { x: 100, y: 0 }, data: { parentId: "root" } },
    { id: "leaf", position: { x: 200, y: 0 }, data: { parentId: "child" } },
  ];
  const edges: Edge[] = [
    { id: "root-child", source: "root", target: "child" },
    { id: "child-leaf", source: "child", target: "leaf" },
  ];

  const selection = selectionWithHierarchyDescendants(nodes, edges, ["child"]);

  assert.deepEqual(selection.nodes.map((node) => node.id), ["child", "leaf"]);
  assert.deepEqual(selection.edges.map((edge) => edge.id), ["child-leaf"]);
});

test("custom clipboard payload preserves rich text inside the copied node", () => {
  const nodes: Node[] = [{
    id: "shape-1",
    type: "shape",
    position: { x: 30, y: 40 },
    data: { text: "अग्निः", richText: "<p><strong>अग्निः</strong></p>" },
  }];
  const edges: Edge[] = [];
  const encoded = serializeManojalamClipboard(createManojalamClipboardPayload(nodes, edges));
  const decoded = parseManojalamClipboard(encoded);

  assert.equal(MANOJALAM_NODES_MIME, "application/x-manojalam-nodes");
  assert.equal(decoded?.nodes.length, 1);
  assert.equal((decoded?.nodes[0].data as Record<string, unknown>).richText, "<p><strong>अग्निः</strong></p>");
  assert.deepEqual(decoded?.nodes[0].position, { x: 30, y: 40 });
});

test("shape duplication preserves style and content by default", () => {
  const data = {
    text: "अग्निः",
    richText: '<p><span style="color: #dc2626">अ</span>ग्निः</p>',
    examples: ["अग्निमीळे"],
    tags: ["vedic"],
    fillColor: "#fef3c7",
    borderColor: "#d97706",
    fontSize: 24,
    parentId: "parent",
    childOrder: ["child"],
    matrixRootId: "parent",
    layoutVisualStyle: {
      rootId: "parent",
      mode: "matrix",
      fillColor: "#fef3c7",
    },
  };
  const duplicated = prepareDuplicatedNodeData(
    data,
    "shape",
    new Map([["parent", "parent-copy"], ["child", "child-copy"]])
  );

  assert.equal(duplicated.text, data.text);
  assert.equal(duplicated.richText, data.richText);
  assert.deepEqual(duplicated.examples, data.examples);
  assert.deepEqual(duplicated.tags, data.tags);
  assert.equal(duplicated.fillColor, data.fillColor);
  assert.equal(duplicated.borderColor, data.borderColor);
  assert.equal(duplicated.fontSize, data.fontSize);
  assert.equal(duplicated.parentId, "parent-copy");
  assert.deepEqual(duplicated.childOrder, ["child-copy"]);
  assert.equal(duplicated.matrixRootId, "parent-copy");
  assert.equal(
    (duplicated.layoutVisualStyle as Record<string, unknown>).rootId,
    "parent-copy"
  );
  assert.notEqual(duplicated.examples, data.examples);
});

test("duplicating an owned text box remaps it to the duplicated shape", () => {
  const duplicated = prepareDuplicatedNodeData(
    {
      text: "Attached explanation",
      externalNote: true,
      noteForNodeId: "shape",
    },
    "note",
    new Map([["shape", "shape-copy"], ["note", "note-copy"]])
  );

  assert.equal(duplicated.externalNote, true);
  assert.equal(duplicated.noteForNodeId, "shape-copy");
  assert.equal(duplicated.text, "Attached explanation");
});

test("duplicating an owned text box alone keeps its existing owner", () => {
  const duplicated = prepareDuplicatedNodeData(
    {
      text: "Second explanation",
      externalNote: true,
      noteForNodeId: "shape",
    },
    "note",
    new Map([["note", "note-copy"]])
  );

  assert.equal(duplicated.noteForNodeId, "shape");
});

test("standalone clear content handles multiple shapes and text boxes without changing style", () => {
  const nodes: Node[] = [
    {
      id: "shape",
      type: "shape",
      position: { x: 0, y: 0 },
      data: {
        text: "अग्निः",
        richText: "<p>अग्निः</p>",
        fillColor: "#fef3c7",
        borderColor: "#d97706",
      },
    },
    {
      id: "text-box",
      type: "text",
      position: { x: 100, y: 0 },
      data: {
        text: "fire",
        richText: "<p>fire</p>",
        fontSize: 24,
        textColor: "#dc2626",
      },
    },
    {
      id: "unselected-shape",
      type: "shape",
      position: { x: 200, y: 0 },
      data: { text: "keep me", fillColor: "#dbeafe" },
    },
  ];

  const cleared = clearSelectedNodeContents(nodes, new Set(["shape", "text-box"]));
  const shapeData = cleared.nodes[0].data as Record<string, unknown>;
  const textData = cleared.nodes[1].data as Record<string, unknown>;

  assert.deepEqual(cleared.clearedNodeIds, ["shape", "text-box"]);
  assert.equal(shapeData.text, "");
  assert.equal(shapeData.richText, "");
  assert.equal(shapeData.fillColor, "#fef3c7");
  assert.equal(shapeData.borderColor, "#d97706");
  assert.equal(textData.text, "");
  assert.equal(textData.richText, "");
  assert.equal(textData.fontSize, 24);
  assert.equal(textData.textColor, "#dc2626");
  assert.equal(cleared.nodes[2], nodes[2]);
});

test("malformed or unsupported clipboard payloads are rejected", () => {
  assert.equal(parseManojalamClipboard("not-json"), null);
  assert.equal(parseManojalamClipboard('{"version":99,"nodes":[],"edges":[]}'), null);
  assert.equal(parseManojalamClipboard('{"version":1,"nodes":[{}],"edges":[]}'), null);
});
