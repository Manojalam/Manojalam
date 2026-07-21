import assert from "node:assert/strict";
import test from "node:test";
import { correctedGuideContentScale, correctedShapeFlowOffset } from "./rich-text-guide-fit";

test("rendered rich text is reduced to the actual label guide", () => {
  const corrected = correctedGuideContentScale(
    2.8,
    { width: 380, height: 74 },
    { width: 182, height: 182 }
  );

  assert.ok(corrected < 2.8);
  assert.ok(380 * (corrected / 2.8) <= 178);
});

test("content already inside the guide keeps its requested scale", () => {
  assert.equal(
    correctedGuideContentScale(1.6, { width: 140, height: 60 }, { width: 182, height: 100 }),
    1.6
  );
});

test("guide correction always returns a finite renderable scale", () => {
  assert.equal(
    correctedGuideContentScale(Number.NaN, { width: 0, height: 0 }, { width: 100, height: 100 }),
    1
  );
  assert.equal(
    correctedGuideContentScale(0.01, { width: 1000, height: 1000 }, { width: 1, height: 1 }),
    0.05
  );
});

const guide = { left: 100, top: 50, right: 400, bottom: 250, width: 300, height: 200 };

test("middle contour alignment uses the actual rendered glyph center", () => {
  const content = { left: 150, top: 70, right: 350, bottom: 110, width: 200, height: 40 };

  assert.equal(correctedShapeFlowOffset(10, content, guide, "middle"), 70);
});

test("top and bottom contour alignment honor a local inset", () => {
  const content = { left: 150, top: 90, right: 350, bottom: 130, width: 200, height: 40 };

  assert.equal(correctedShapeFlowOffset(30, content, guide, "top", { inset: 10 }), 0);
  assert.equal(correctedShapeFlowOffset(30, content, guide, "bottom", { inset: 10 }), 140);
});

test("contour alignment converts screen movement back to local CSS pixels", () => {
  const content = { left: 150, top: 100, right: 350, bottom: 140, width: 200, height: 40 };

  assert.equal(correctedShapeFlowOffset(20, content, guide, "middle", {
    localToScreenScale: 2,
  }), 35);
});

test("contour alignment ignores invalid geometry and clamps within its guide", () => {
  assert.equal(correctedShapeFlowOffset(Number.NaN, {
    left: 0,
    top: Number.NaN,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
  }, guide, "middle"), 0);
  assert.equal(correctedShapeFlowOffset(20, {
    left: 0,
    top: 500,
    right: 20,
    bottom: 520,
    width: 20,
    height: 20,
  }, guide, "top"), 0);
});
