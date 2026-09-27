import assert from "node:assert/strict";
import test from "node:test";
import { RichTextContentSync, TextEditingSessions } from "./text-editing-session";

test("matrix reflows coalesce until the last editor in that matrix closes", () => {
  const sessions = new TextEditingSessions();
  const closeA = sessions.begin("a");
  const closeB = sessions.begin("b");
  let reflows = 0;
  for (let i = 0; i < 50; i++) {
    assert.equal(sessions.defer("root", ["root", "a", "b"], () => reflows++), true);
  }
  assert.equal(sessions.defer("other", ["other"], () => reflows++), false);
  assert.equal(reflows, 0);
  closeA();
  assert.equal(reflows, 0);
  closeB();
  assert.equal(reflows, 1);
  closeB();
  assert.equal(reflows, 1);
  assert.equal(sessions.defer("root", ["root", "a"], () => reflows++), false);
});

test("duplicate editor mounts release independently", () => {
  const sessions = new TextEditingSessions();
  const first = sessions.begin("cell");
  const second = sessions.begin("cell");
  let reflows = 0;
  sessions.defer("root", ["cell"], () => reflows++);
  first();
  assert.equal(reflows, 0);
  second();
  assert.equal(reflows, 1);
});

test("delayed parent echoes cannot replace newer typed words", () => {
  const sync = new RichTextContentSync("<p>Start</p>");
  sync.emitted("<p>Start one</p>");
  sync.emitted("<p>Start one two</p>");
  assert.equal(sync.shouldApply("<p>Start</p>", "<p>Start one two</p>", false), false);
  assert.equal(sync.shouldApply("<p>Start one</p>", "<p>Start one two</p>", false), false);
  assert.equal(sync.shouldApply("<p>Start one two</p>", "<p>Start one two three</p>", false), false);
});

test("IME drafts survive echoes and external changes wait for composition", () => {
  const sync = new RichTextContentSync("");
  sync.emitted("<p>??</p>");
  assert.equal(sync.shouldApply("<p>??</p>", "<p>??????</p>", true), false);
  assert.equal(sync.shouldApply("<p>??</p>", "<p>??????</p>", false), false);
  assert.equal(sync.shouldApply("<p>External</p>", "<p>??????</p>", true), false);
  assert.equal(sync.shouldApply("<p>External</p>", "<p>??????</p>", false), true);
});

test("external undo, redo, clearing, and formatting still update the editor", () => {
  const sync = new RichTextContentSync("<p>one</p>");
  sync.emitted("<p>two</p>");
  assert.equal(sync.shouldApply("<p>two</p>", "<p>two</p>", false), false);
  assert.equal(sync.shouldApply("<p>one</p>", "<p>two</p>", false), true);
  assert.equal(sync.shouldApply("<p>two</p>", "<p>one</p>", false), true);
  assert.equal(sync.shouldApply("<p><strong>two</strong></p>", "<p>two</p>", false), true);
  assert.equal(sync.shouldApply("", "<p><strong>two</strong></p>", false), true);
});
