import assert from "node:assert/strict";
import test from "node:test";
import type { Edge, Node } from "@xyflow/react";
import {
  createManojalamClipboardPayload,
  isTextEditingTarget,
  MANOJALAM_NODES_MIME,
  parseManojalamClipboard,
  serializeManojalamClipboard,
  shouldHandleCanvasClipboard,
} from "./clipboard";

function target(matches: boolean): EventTarget {
  return { closest: () => matches ? {} : null } as unknown as EventTarget;
}

test("canvas clipboard routing yields to active text editors", () => {
  assert.equal(isTextEditingTarget(target(true)), true);
  assert.equal(shouldHandleCanvasClipboard(target(false), target(true)), false);
  assert.equal(shouldHandleCanvasClipboard(target(false), target(false)), true);
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

test("malformed or unsupported clipboard payloads are rejected", () => {
  assert.equal(parseManojalamClipboard("not-json"), null);
  assert.equal(parseManojalamClipboard('{"version":99,"nodes":[],"edges":[]}'), null);
  assert.equal(parseManojalamClipboard('{"version":1,"nodes":[{}],"edges":[]}'), null);
});
