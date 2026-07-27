import assert from "node:assert/strict";
import test from "node:test";
import type { Edge, Node } from "@xyflow/react";
import {
  createManojalamClipboardPayload,
  isTextEditingTarget,
  MANOJALAM_NODES_MIME,
  parseManojalamClipboard,
  prepareDuplicatedNodeData,
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
  assert.notEqual(duplicated.examples, data.examples);
});

test("blank shape duplication clears content but keeps style", () => {
  const duplicated = prepareDuplicatedNodeData(
    {
      text: "अग्निः",
      richText: "<p>अग्निः</p>",
      translation: "fire",
      examples: ["अग्निमीळे"],
      tags: ["vedic"],
      collapsedSections: ["translation"],
      fillColor: "#fef3c7",
      borderColor: "#d97706",
      fontSize: 24,
    },
    "shape",
    new Map([["shape", "shape-copy"]]),
    { clearContent: true }
  );

  assert.equal(duplicated.text, "");
  assert.equal(duplicated.richText, "");
  assert.equal(duplicated.translation, "");
  assert.deepEqual(duplicated.examples, []);
  assert.deepEqual(duplicated.tags, []);
  assert.deepEqual(duplicated.collapsedSections, []);
  assert.equal(duplicated.fillColor, "#fef3c7");
  assert.equal(duplicated.borderColor, "#d97706");
  assert.equal(duplicated.fontSize, 24);
});

test("malformed or unsupported clipboard payloads are rejected", () => {
  assert.equal(parseManojalamClipboard("not-json"), null);
  assert.equal(parseManojalamClipboard('{"version":99,"nodes":[],"edges":[]}'), null);
  assert.equal(parseManojalamClipboard('{"version":1,"nodes":[{}],"edges":[]}'), null);
});
