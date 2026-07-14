import assert from "node:assert/strict";
import test from "node:test";

import {
  appendPlainTextToRichText,
  plainTextToRichText,
  richTextToPlainText,
  sanitizePastedHtml,
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

test("external paste drops unsafe markup and document layout styles", () => {
  assert.equal(
    sanitizePastedHtml(
      '<p class="WordSection" style="position:absolute;width:900px;font-size:72px" onclick="alert(1)"><strong>Safe</strong><script>bad()</script></p>'
    ),
    "<p><strong>Safe</strong></p>"
  );
});

test("legacy font tags keep their text without importing font sizing", () => {
  assert.equal(
    sanitizePastedHtml('<font face="Papyrus" size="7">Text</font>'),
    "<span>Text</span>"
  );
});
