import assert from "node:assert/strict";
import test from "node:test";

import {
  appendPlainTextToRichText,
  plainTextToRichText,
  richTextToPlainText,
} from "./rich-text-paste";

test("escapes clipboard text while retaining its paragraph structure", () => {
  assert.equal(
    plainTextToRichText("अग्निः < तेजः\nरूपम्"),
    "<p>अग्निः &lt; तेजः<br>रूपम्</p>"
  );
});

test("appends text without flattening existing inline formatting", () => {
  const existing = '<p><span style="color: #ef4444"><strong>अग्निः</strong></span></p>';
  assert.equal(
    appendPlainTextToRichText(existing, "अग्निः", "रूपम्"),
    `${existing}<p>रूपम्</p>`
  );
});

test("produces the matching plain-text value", () => {
  assert.equal(
    richTextToPlainText("<p>अग्निः</p><p>रूपम्<br>तेजः</p>"),
    "अग्निः\nरूपम्\nतेजः"
  );
});
