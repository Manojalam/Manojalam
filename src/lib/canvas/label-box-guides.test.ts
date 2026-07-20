import assert from "node:assert/strict";
import test from "node:test";

import { resolveLabelBoxGuideVisibility } from "./label-box-guides";

test("label box guides stay hidden when neither scope enables them", () => {
  assert.equal(resolveLabelBoxGuideVisibility(undefined), false);
  assert.equal(resolveLabelBoxGuideVisibility(false, false), false);
});

test("a board-wide guide setting enables every compatible label renderer", () => {
  assert.equal(resolveLabelBoxGuideVisibility(true, false), true);
});

test("existing per-chart guide overrides remain available", () => {
  assert.equal(resolveLabelBoxGuideVisibility(false, true), true);
});
