import assert from "node:assert/strict";
import test from "node:test";
import { correctedGuideContentScale } from "./rich-text-guide-fit";

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
