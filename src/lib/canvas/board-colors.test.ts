import assert from "node:assert/strict";
import test from "node:test";

import {
  boardColorCssValue,
  normalizeBoardColorOverride,
  resolvedBoardColor,
  resolveBoardColorMode,
} from "./board-colors";

test("legacy light board defaults become automatic theme colors", () => {
  assert.equal(normalizeBoardColorOverride("#f0eeea", "canvas"), undefined);
  assert.equal(resolvedBoardColor("#f0eeea", "canvas", "dark"), "#18181d");
  assert.equal(boardColorCssValue("#d5d2cb", "grid"), "var(--canvas-dot)");
});

test("custom and transparent board colors remain explicit", () => {
  assert.equal(resolvedBoardColor("#fef3c7", "canvas", "dark"), "#fef3c7");
  assert.equal(resolvedBoardColor("transparent", "canvas", "light"), "transparent");
  assert.equal(boardColorCssValue("transparent", "grid"), "transparent");
});

test("legacy neutral backgrounds migrate to automatic colors", () => {
  assert.equal(resolveBoardColorMode("#f1f5f9", undefined, "canvas"), "auto");
  assert.equal(resolvedBoardColor("#f1f5f9", "canvas", "dark"), "#18181d");
  assert.equal(resolveBoardColorMode("rgb(30, 41, 59)", undefined, "canvas"), "auto");
});

test("explicit modes preserve intentional choices", () => {
  assert.equal(resolveBoardColorMode("#f1f5f9", "custom", "canvas"), "custom");
  assert.equal(resolvedBoardColor("#f1f5f9", "canvas", "dark", "custom"), "#f1f5f9");
  assert.equal(boardColorCssValue("#f0eeea", "canvas", "custom"), "#f0eeea");
  assert.equal(boardColorCssValue(undefined, "canvas", "transparent"), "transparent");
});
