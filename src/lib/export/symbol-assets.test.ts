import assert from "node:assert/strict";
import test from "node:test";
import { parseHTML } from "linkedom";
import { embedExportSymbolImages } from "./symbol-assets";

function fixture(html: string) {
  const { document } = parseHTML(`<html><body>${html}</body></html>`);
  const paints: { text: string; color: string }[] = [];
  const context = {
    font: "", fillStyle: "", textBaseline: "",
    measureText: () => ({ width: 22, actualBoundingBoxAscent: 20, actualBoundingBoxDescent: 4 }),
    scale: () => undefined,
    fillText(text: string) { paints.push({ text, color: this.fillStyle }); },
  };
  const createElement = document.createElement.bind(document);
  document.createElement = ((tag: string) => {
    const element = createElement(tag);
    if (tag === "canvas") Object.assign(element, { getContext: () => context, toDataURL: () => "data:image/png;base64,c3ltYm9s" });
    return element;
  }) as typeof document.createElement;
  Object.defineProperty(document.defaultView, "getComputedStyle", { configurable: true, value: () => ({ fontSize: "24px", fontFamily: "Device symbol font", fontStyle: "normal", fontWeight: "700", color: "rgb(20, 140, 30)" }) });
  const source = document.body.firstElementChild!;
  const clone = source.cloneNode(true) as Element;
  return { source, clone, paints };
}

test("exports checkmarks, crosses and flowers as embedded images without modifying source text", () => {
  const { source, clone, paints } = fixture("<p>Before ✓ ✔ ☑ ✅ ✕ ✖ ✗ ✘ ❌ ☒ ❀ ✿ ❁ ✾ ❃ 🌸️ After ज्ञानम्</p>");
  embedExportSymbolImages(source, clone);
  assert.equal(clone.querySelectorAll("img[data-export-symbol]").length, 16);
  assert.equal(clone.textContent, "Before                 After ज्ञानम्");
  assert.match(source.textContent!, /✓.*🌸️.*ज्ञानम्/u);
  for (const image of Array.from(clone.querySelectorAll("img"))) {
    assert.match(image.getAttribute("src")!, /^data:image\/png;base64,/);
    assert.ok(image.getAttribute("alt"));
    assert.match(image.getAttribute("style")!, /vertical-align:-\d+px/);
  }
  assert.ok(paints.every((paint) => paint.color === "rgb(20, 140, 30)"));
});

test("preserves marks, enclosures, links, whitespace and unrelated text", () => {
  const { source, clone } = fixture('<p>Text <a href="https://example.com"><span data-vidya-symbol="true" style="transform:scale(1.5);border:2px solid red">❁</span></a> ✓\nPlain</p>');
  const sources = [source, ...Array.from(source.querySelectorAll("*"))];
  const targets = [clone, ...Array.from(clone.querySelectorAll("*"))];
  sources.forEach((element, index) => embedExportSymbolImages(element, targets[index]));
  assert.equal(clone.querySelectorAll("img").length, 2);
  assert.equal(clone.querySelector("span")?.getAttribute("style"), "transform:scale(1.5);border:2px solid red");
  assert.equal(clone.querySelector("a")?.getAttribute("href"), "https://example.com");
  assert.equal(clone.textContent, "Text  \nPlain");
  assert.equal(source.querySelectorAll("img").length, 0);
});

test("leaves ordinary text and non-content elements alone", () => {
  for (const html of ["<p>Sanskrit ज्ञानम् Latin 123</p>", "<style>.x::before{content:'✓'}</style>"]) {
    const { source, clone } = fixture(html);
    const before = clone.outerHTML;
    embedExportSymbolImages(source, clone);
    assert.equal(clone.outerHTML, before);
  }
});
