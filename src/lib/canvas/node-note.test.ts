import assert from "node:assert/strict";
import test from "node:test";
import type { Node } from "@xyflow/react";
import { createExternalNoteNode, EXTERNAL_NOTE_SIZE } from "./node-note";

const source: Node = {
  id: "source",
  type: "shape",
  position: { x: 100, y: 80 },
  style: { width: 180, height: 90 },
  data: {},
};

test("external notes are placed to the right of their box", () => {
  const note = createExternalNoteNode(source, [source], "note", "plain");

  assert.deepEqual(note.position, { x: 312, y: 80 });
  assert.deepEqual(note.style, EXTERNAL_NOTE_SIZE);
  assert.equal(note.type, "text");
  assert.equal(note.data.noteForNodeId, "source");
  assert.equal(note.data.externalNote, true);
});

test("external notes choose another side when the preferred position is occupied", () => {
  const occupied: Node = {
    id: "occupied",
    position: { x: 300, y: 70 },
    style: { width: 240, height: 100 },
    data: {},
  };
  const note = createExternalNoteNode(source, [source, occupied], "note", "iast");

  assert.deepEqual(note.position, { x: 100, y: 202 });
  assert.equal(note.data.scriptMode, "iast");
});
