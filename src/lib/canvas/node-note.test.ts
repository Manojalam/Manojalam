import assert from "node:assert/strict";
import test from "node:test";
import type { Node } from "@xyflow/react";
import {
  createExternalNoteNode,
  EXTERNAL_NOTE_SIZE,
  includeAttachedExternalNoteIds,
  isExternalNoteNode,
} from "./node-note";

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
  assert.equal(isExternalNoteNode(note), true);
  assert.equal(isExternalNoteNode(source), false);
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

test("a source can have multiple independently positioned notes", () => {
  const first = createExternalNoteNode(source, [source], "first-note", "plain");
  const second = createExternalNoteNode(source, [source, first], "second-note", "plain");

  assert.equal(first.data.noteForNodeId, source.id);
  assert.equal(second.data.noteForNodeId, source.id);
  assert.notDeepEqual(second.position, first.position);
});

test("moving a source includes every attached note without moving the source when a note moves", () => {
  const note = createExternalNoteNode(source, [source], "note", "plain");
  const secondNote = createExternalNoteNode(source, [source, note], "second-note", "plain");
  const lockedNote: Node = {
    ...createExternalNoteNode(source, [source, note, secondNote], "locked-note", "plain"),
    data: { ...note.data, locked: true },
  };

  assert.deepEqual(
    includeAttachedExternalNoteIds([source, note, secondNote, lockedNote], [source.id]),
    [source.id, note.id, secondNote.id, lockedNote.id]
  );
  assert.deepEqual(
    includeAttachedExternalNoteIds([source, note, secondNote, lockedNote], [note.id]),
    [note.id]
  );
});
