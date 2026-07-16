import assert from "node:assert/strict";
import test from "node:test";
import { radialHierarchyWeight, radialOutermostCommonFontSize } from "./radial-layout";

test("equal outermost sizing gives every terminal sector one unit", () => {
  assert.equal(radialHierarchyWeight([], 8, true), 1);
  assert.equal(radialHierarchyWeight([], 0.2, true), 1);
});

test("equal outermost sizing makes parents span their terminal descendants", () => {
  const terminalChildren = [
    radialHierarchyWeight([], 8, true),
    radialHierarchyWeight([], 0.2, true),
  ];

  assert.equal(radialHierarchyWeight(terminalChildren, 4, true), 2);
  assert.equal(radialHierarchyWeight([radialHierarchyWeight([], 1, true)], 1, true), 1);
});

test("normal sizing continues to respect manual sector weights", () => {
  assert.equal(radialHierarchyWeight([], 3, false), 3);
  assert.equal(radialHierarchyWeight([], "3", false), 3);
  assert.equal(radialHierarchyWeight([1, 1], 2, false), 4);
});

test("outermost labels use the largest common size that fits every sector", () => {
  assert.equal(radialOutermostCommonFontSize([18, 15, 12], 18, 8), 12);
  assert.equal(radialOutermostCommonFontSize([22, 19], 18, 8), 18);
});

test("outermost label sizing protects readability when a label cannot fit", () => {
  assert.equal(radialOutermostCommonFontSize([16, null, 14], 18, 8), 8);
  assert.equal(radialOutermostCommonFontSize([], 18, 8), null);
});
