import assert from "node:assert/strict";
import test from "node:test";
import { getRichTextScaleStyle } from "./rich-text-scale";

test("fitted rich text keeps its alignment box width while scaling", () => {
  const style = getRichTextScaleStyle(0.4);

  assert.deepEqual(style, { zoom: 0.4 });
  assert.equal("width" in (style ?? {}), false);
});

test("rich text scale is normalized and omitted at its natural size", () => {
  assert.equal(getRichTextScaleStyle(1), undefined);
  assert.deepEqual(getRichTextScaleStyle(0.01), { zoom: 0.2 });
  assert.deepEqual(getRichTextScaleStyle(99), { zoom: 12 });
  assert.equal(getRichTextScaleStyle(Number.NaN), undefined);
});
