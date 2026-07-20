import assert from "node:assert/strict";
import test from "node:test";

import { resolveBorderColor, resolveFillColor } from "./style-utils";

const automaticLayoutStyle = {
  rootId: "root",
  fillColor: "#4f67f6",
  borderColor: "#4262ff",
  textColor: "#111827",
  accentColor: "#4262ff",
  borderWidth: 2,
  borderStyle: "solid" as const,
};

test("a cleared node fill stays transparent instead of falling back to blue", () => {
  assert.equal(resolveFillColor({
    fillColor: "transparent",
    color: "#4f67f6",
    layoutVisualStyle: automaticLayoutStyle,
    layoutAutoFill: false,
  }), "transparent");
});

test("a cleared node border stays transparent instead of falling back to its accent", () => {
  assert.equal(resolveBorderColor({
    borderColor: "transparent",
    color: "#4262ff",
    layoutVisualStyle: automaticLayoutStyle,
    layoutAutoBorder: false,
  }), "transparent");
});
