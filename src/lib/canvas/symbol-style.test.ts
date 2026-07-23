import assert from "node:assert/strict";
import test from "node:test";

import {
  hasVisibleSymbolStyle,
  semanticSymbolRotation,
  symbolMarkStyle,
} from "./symbol-style";

test("serializes an enclosed filled Tiro symbol into durable inline styles", () => {
  const style = symbolMarkStyle({
    enclosure: "circle",
    fillColor: "#3b82f6",
    borderColor: "#60a5fa",
    scale: 1.2,
    font: "tiro-devanagari",
  });

  assert.match(style, /background-color:#3b82f6/);
  assert.match(style, /border:0\.09em solid #60a5fa/);
  assert.match(style, /border-radius:999px/);
  assert.match(style, /font-size:1\.2em/);
  assert.match(style, /font-tiro-devanagari/);
});

test("plain symbols do not receive enclosure paint", () => {
  const style = symbolMarkStyle({ enclosure: "none", scale: 1 });

  assert.doesNotMatch(style, /background-color/);
  assert.doesNotMatch(style, /border:/);
  assert.equal(hasVisibleSymbolStyle({ enclosure: "none", scale: 1 }), false);
});

test("semantic identity keeps a plain articulation marker editable", () => {
  assert.equal(
    hasVisibleSymbolStyle({ enclosure: "none", scale: 1 }, "alpaprana"),
    true
  );
});

test("Jihvāmūlīya always renders the literal parenthesis pair rotated 90 degrees", () => {
  assert.equal(semanticSymbolRotation("jihvamuliya"), 90);
  assert.match(
    symbolMarkStyle({ semanticId: "jihvamuliya", scale: 1.1 }),
    /transform:rotate\(90deg\)/
  );
  assert.equal(semanticSymbolRotation("upadhmaniya"), 0);
});
