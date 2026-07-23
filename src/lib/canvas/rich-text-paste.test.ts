import assert from "node:assert/strict";
import test from "node:test";

import {
  appendPlainTextToRichText,
  normalizePastedText,
  plainTextToRichText,
  richTextToPlainText,
  sanitizePastedHtml,
  trimPastedHtmlBoundaries,
} from "./rich-text-paste";

test("escapes clipboard text while retaining its paragraph structure", () => {
  assert.equal(
    plainTextToRichText("अग्निः < तेजः\nरूपम्"),
    "<p>अग्निः &lt; तेजः<br>रूपम्</p>"
  );
});

test("removes clipboard padding while preserving spacing inside the text", () => {
  assert.equal(normalizePastedText("  \r\nअग्निः  तेजः\r\n  "), "अग्निः  तेजः");
  assert.equal(plainTextToRichText("  \nअग्निः  तेजः\n  "), "<p>अग्निः  तेजः</p>");
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

test("external HTML paste removes empty and padded boundary blocks", () => {
  assert.equal(
    sanitizePastedHtml("  <p><br></p><p>&nbsp; Safe text &nbsp;</p><p> </p>  "),
    "<p>Safe text</p>"
  );
});

test("legacy font tags keep their text without importing font sizing", () => {
  assert.equal(
    sanitizePastedHtml('<font face="Papyrus" size="7">Text</font>'),
    "<span>Text</span>"
  );
});

test("internal TipTap paste removes ProseMirror boundary padding without flattening marks", () => {
  assert.equal(
    trimPastedHtmlBoundaries(
      '<p data-pm-slice="1 1 []"><br class="ProseMirror-trailingBreak"></p>'
      + '<p><span style="color:#ef4444"><strong>Safe text</strong></span></p>'
      + '<p><br class="ProseMirror-trailingBreak"></p>'
    ),
    '<p><span style="color:#ef4444"><strong>Safe text</strong></span></p>'
  );
  assert.equal(
    trimPastedHtmlBoundaries(
      '<div data-pm-slice="1 1 []"><p><br class="ProseMirror-trailingBreak"></p>'
      + '<p><em>Nested text</em></p><p><br></p></div>'
    ),
    '<div data-pm-slice="1 1 []"><p><em>Nested text</em></p></div>'
  );
});

test("keeps safe pasted links and strips executable destinations", () => {
  assert.equal(
    sanitizePastedHtml('<p><a href="https://example.com/docs" target="_self">Docs</a></p>'),
    '<p><a href="https://example.com/docs">Docs</a></p>'
  );
  assert.equal(
    sanitizePastedHtml('<p><a href="javascript:alert(1)">Unsafe</a></p>'),
    "<p><a>Unsafe</a></p>"
  );
});

test("retains semantic superscript and subscript marks from pasted text", () => {
  assert.equal(
    sanitizePastedHtml("<p>E = mc<sup>2</sup> and H<sub>2</sub>O</p>"),
    "<p>E = mc<sup>2</sup> and H<sub>2</sub>O</p>"
  );
});

test("retains internal styled-symbol attributes for rich-text copy and paste", () => {
  const sanitized = sanitizePastedHtml(
    '<div data-pm-slice="1 1 []"><span data-vidya-symbol="true"'
    + ' data-symbol-enclosure="rounded-square" data-symbol-fill="#3b82f6"'
    + ' data-symbol-border="#60a5fa" data-symbol-scale="1.2"'
    + ' data-symbol-font="tiro-devanagari" data-symbol-id="jihvamuliya"'
    + ' style="display:inline-flex;background-color:#3b82f6">)(</span></div>'
  );

  assert.match(sanitized, /data-vidya-symbol="true"/);
  assert.match(sanitized, /data-symbol-enclosure="rounded-square"/);
  assert.match(sanitized, /data-symbol-fill="#3b82f6"/);
  assert.match(sanitized, /data-symbol-border="#60a5fa"/);
  assert.match(sanitized, /data-symbol-scale="1.2"/);
  assert.match(sanitized, /data-symbol-font="tiro-devanagari"/);
  assert.match(sanitized, /data-symbol-id="jihvamuliya"/);
});
