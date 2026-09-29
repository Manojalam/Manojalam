import assert from "node:assert/strict";
import test from "node:test";
import { getSchema, type Command } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { ParagraphLayout, adjustParagraphIndent, paragraphValue } from "./paragraph-layout";

test("paragraph values reject non-finite values and bound layout", () => {
  assert.equal(paragraphValue("lineSpacing", NaN), 1.375);
  assert.equal(paragraphValue("lineSpacing", 0), 1);
  assert.equal(paragraphValue("paragraphIndent", -1), 0);
  assert.equal(paragraphValue("firstLineIndent", -2), -2);
  assert.equal(paragraphValue("tabSize", 100), 16);
  assert.equal(paragraphValue("tabSize", 3.7), 4);
});

test("indent commands change selected paragraphs, preserve marks, and undo", () => {
  const schema = getSchema([StarterKit, ParagraphLayout]);
  const paragraph = schema.nodes.paragraph;
  const doc = schema.nodes.doc.create(null, [
    paragraph.create(null, schema.text("First", [schema.marks.bold.create()])),
    paragraph.create({ paragraphIndent: 2, lineSpacing: 1.5 }, schema.text("Second")),
    paragraph.create(null, schema.text("Third")),
  ]);
  const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, 1, 12) });
  const tr = state.tr;
  adjustParagraphIndent(1)({ tr, dispatch: () => {} } as unknown as Parameters<Command>[0]);
  assert.equal(tr.doc.child(0).attrs.paragraphIndent, 1);
  assert.equal(tr.doc.child(1).attrs.paragraphIndent, 3);
  assert.equal(tr.doc.child(1).attrs.lineSpacing, 1.5);
  assert.equal(tr.doc.child(2).attrs.paragraphIndent, null);
  assert.equal(tr.doc.child(0).firstChild?.marks[0].type.name, "bold");
  let restored = tr.doc;
  for (let i = tr.steps.length - 1; i >= 0; i--) {
    restored = tr.steps[i].invert(tr.docs[i]).apply(restored).doc!;
  }
  assert.ok(restored.eq(doc));
});

test("outdent at the cursor stops at zero and command probes do not mutate", () => {
  const schema = getSchema([StarterKit, ParagraphLayout]);
  const doc = schema.nodes.doc.create(null, schema.nodes.paragraph.create(null, schema.text("Text")));
  const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, 2) });
  const probe = state.tr;
  adjustParagraphIndent(1)({ tr: probe } as unknown as Parameters<Command>[0]);
  assert.equal(probe.steps.length, 0);
  const tr = state.tr;
  adjustParagraphIndent(-1)({ tr, dispatch: () => {} } as unknown as Parameters<Command>[0]);
  assert.equal(tr.doc.firstChild?.attrs.paragraphIndent, 0);
});
