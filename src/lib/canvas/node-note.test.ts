import assert from "node:assert/strict";
import test from "node:test";
import type { Node } from "@xyflow/react";
import {
  createExternalNoteNode,
  EXTERNAL_NOTE_SIZE,
  includeAttachedExternalNoteIds,
  isExternalNoteNode,
  preserveAttachedExternalNoteOffsets,
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

test("a toolbar click places its note immediately beside the clicked canvas point", () => {
  const occupied: Node = {
    id: "occupied",
    position: { x: 400, y: 240 },
    style: { width: 300, height: 180 },
    data: {},
  };
  const note = createExternalNoteNode(
    source,
    [source, occupied],
    "note",
    "plain",
    { x: 420, y: 260 }
  );

  assert.deepEqual(note.position, { x: 432, y: 272 });
});

test("external notes use the board font-size default", () => {
  const note = createExternalNoteNode(source, [source], "note", "plain", undefined, 19);

  assert.equal(note.data.fontSize, 19);
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

function attachmentSource(position = { x: 100, y: 200 }, width = 200): Node {
  return {
    id: "source",
    type: "shape",
    position,
    style: { width, height: 80 },
    data: { shapeType: "rounded" },
  };
}

function speechNote(
  position = { x: 340, y: 180 },
  anchor = { x: 200, y: 190 }
): Node {
  return {
    id: "note",
    type: "text",
    position,
    style: { width: 220, height: 72 },
    data: {
      externalNote: true,
      noteForNodeId: "source",
      textFrameStyle: "speech",
      textCalloutAnchor: anchor,
    },
  };
}

test("an attached speech note and its tip follow the owning shape", () => {
  const previous = [attachmentSource(), speechNote()];
  const next = [
    attachmentSource({ x: 250, y: 320 }),
    speechNote(),
  ];

  const result = preserveAttachedExternalNoteOffsets(previous, next);
  const movedNote = result.find((node) => node.id === "note");

  assert.deepEqual(movedNote?.position, { x: 490, y: 300 });
  assert.deepEqual(
    (movedNote?.data as Record<string, unknown>)?.textCalloutAnchor,
    { x: 350, y: 310 }
  );
});

test("an attached speech tip follows a resized owner's visual center", () => {
  const previous = [attachmentSource(), speechNote()];
  const next = [attachmentSource({ x: 100, y: 200 }, 300), speechNote()];

  const result = preserveAttachedExternalNoteOffsets(previous, next);
  const movedNote = result.find((node) => node.id === "note");

  assert.deepEqual(movedNote?.position, { x: 440, y: 180 });
  assert.deepEqual(
    (movedNote?.data as Record<string, unknown>)?.textCalloutAnchor,
    { x: 250, y: 190 }
  );
});

test("a layout resize preserves the bubble gap and pointer boundary position", () => {
  const previous = [
    attachmentSource(),
    speechNote({ x: 340, y: 180 }, { x: 300, y: 240 }),
  ];
  const nextSource: Node = {
    ...attachmentSource({ x: 40, y: 80 }, 140),
    style: { width: 140, height: 800 },
  };
  const next = [
    nextSource,
    speechNote({ x: 340, y: 180 }, { x: 300, y: 240 }),
  ];

  const result = preserveAttachedExternalNoteOffsets(previous, next);
  const movedNote = result.find((node) => node.id === "note");

  assert.deepEqual(movedNote?.position, { x: 220, y: 204 });
  assert.deepEqual(
    (movedNote?.data as Record<string, unknown>)?.textCalloutAnchor,
    { x: 180, y: 480 }
  );
});

test("a center-anchored resize still realigns an attached bubble and pointer", () => {
  const previous = [attachmentSource(), speechNote()];
  const next = [
    attachmentSource({ x: 50, y: 200 }, 300),
    speechNote(),
  ];

  const result = preserveAttachedExternalNoteOffsets(previous, next);
  const movedNote = result.find((node) => node.id === "note");

  assert.deepEqual(movedNote?.position, { x: 390, y: 180 });
  assert.deepEqual(
    (movedNote?.data as Record<string, unknown>)?.textCalloutAnchor,
    { x: 200, y: 190 }
  );
});

test("moving an attached bubble alone leaves its tip attached to the owner", () => {
  const previous = [attachmentSource(), speechNote()];
  const next = [attachmentSource(), speechNote({ x: 440, y: 260 })];

  const result = preserveAttachedExternalNoteOffsets(previous, next);
  const movedNote = result.find((node) => node.id === "note");

  assert.deepEqual(movedNote?.position, { x: 440, y: 260 });
  assert.deepEqual(
    (movedNote?.data as Record<string, unknown>)?.textCalloutAnchor,
    { x: 200, y: 190 }
  );
});

test("group movement does not translate an attached note twice", () => {
  const previous = [attachmentSource(), speechNote()];
  const next = [
    attachmentSource({ x: 250, y: 320 }),
    speechNote({ x: 490, y: 300 }),
  ];

  const result = preserveAttachedExternalNoteOffsets(previous, next);
  const movedNote = result.find((node) => node.id === "note");

  assert.deepEqual(movedNote?.position, { x: 490, y: 300 });
  assert.deepEqual(
    (movedNote?.data as Record<string, unknown>)?.textCalloutAnchor,
    { x: 350, y: 310 }
  );
});
