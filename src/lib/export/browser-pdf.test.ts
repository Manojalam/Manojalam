import assert from "node:assert/strict";
import test from "node:test";
import { DOMParser, parseHTML } from "linkedom";
import { createBrowserPdfDocument } from "./browser-pdf";

function withDom(run: () => void) {
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const previousParser = Object.getOwnPropertyDescriptor(globalThis, "DOMParser");
  const { document } = parseHTML("<!doctype html><html><head></head><body></body></html>");
  Object.defineProperty(document, "implementation", { value: { createHTMLDocument: (title: string) => {
    const result = parseHTML("<!doctype html><html><head></head><body></body></html>").document;
    const heading = result.createElement("title"); heading.textContent = title; result.head.append(heading); return result;
  } } });
  Object.defineProperty(globalThis, "document", { configurable: true, value: document });
  Object.defineProperty(globalThis, "DOMParser", { configurable: true, value: DOMParser });
  try { run(); } finally {
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument); else Reflect.deleteProperty(globalThis, "document");
    if (previousParser) Object.defineProperty(globalThis, "DOMParser", previousParser); else Reflect.deleteProperty(globalThis, "DOMParser");
  }
}

const source = '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div xmlns="http://www.w3.org/1999/xhtml"><style>@font-face{font-family:Test;src:url(data:font/woff2;base64,AAAA)}</style><p contenteditable="true" onclick="bad()">क्षत्रियः ज्ञानम् <a href="https://example.com">३.४.८९</a></p><svg><path d="M0 0L10 10"/></svg><script>bad()</script></div></foreignObject></svg>';

test("browser PDF unwraps real text and shapes instead of printing a foreignObject image", () => withDom(() => {
  const result = createBrowserPdfDocument(source, 800, 5000, "Sanskrit <board>");
  assert.equal(result.width, 600);
  assert.equal(result.height, 3750);
  assert.match(result.html, /@page \{ size: 600pt 3750pt; margin: 0;/);
  assert.match(result.html, /क्षत्रियः ज्ञानम्/);
  assert.match(result.html, /<path/);
  assert.match(result.html, /@font-face/);
  assert.match(result.html, /href="https:\/\/example.com"/);
  assert.doesNotMatch(result.html, /foreignObject|<script|onclick=|contenteditable=/);
}));

test("very long print boards keep their aspect ratio on one bounded custom page", () => withDom(() => {
  const result = createBrowserPdfDocument(source, 1000, 40000);
  assert.equal(result.height, 14400);
  assert.equal(result.width / result.height, 1000 / 40000);
  assert.match(result.html, /scale\(0.48\)/);
  assert.throws(() => createBrowserPdfDocument("<svg/>", 800, 1000));
  assert.throws(() => createBrowserPdfDocument(source, 0, 1000));
}));
