import assert from "node:assert/strict";
import test from "node:test";
import {
  connectorStrokeDasharray,
  doubleConnectorStrokeWidths,
  resolveConnectorPathStyle,
} from "./connector-path-style";

test("legacy dashed connectors retain their appearance", () => {
  assert.equal(resolveConnectorPathStyle({ dashed: true }), "dashed");
  assert.equal(resolveConnectorPathStyle({}), "solid");
});

test("an explicit path style overrides the legacy dashed flag", () => {
  assert.equal(resolveConnectorPathStyle({ pathStyle: "solid", dashed: true }), "solid");
  assert.equal(resolveConnectorPathStyle({ pathStyle: "double", dashed: true }), "double");
});

test("dash patterns are defined only for dashed and dotted styles", () => {
  assert.equal(connectorStrokeDasharray("solid"), undefined);
  assert.equal(connectorStrokeDasharray("dashed"), "8 5");
  assert.equal(connectorStrokeDasharray("dotted"), "1 5");
  assert.equal(connectorStrokeDasharray("double"), undefined);
});

test("double paths reserve a separator between equal-width rails", () => {
  assert.deepEqual(doubleConnectorStrokeWidths(2), { outer: 6, separator: 2 });
  assert.deepEqual(doubleConnectorStrokeWidths(4), { outer: 10, separator: 4 });
});
