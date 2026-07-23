import assert from "node:assert/strict";
import test from "node:test";

import {
  clearScriptCharacters,
  convertToScript,
  replaceTextRange,
  transformTextRange,
} from "./text-tools";

test("converts supported characters to superscript and subscript", () => {
  assert.equal(convertToScript("x2+y", "superscript"), "ˣ²⁺ʸ");
  assert.equal(convertToScript("H2O", "subscript"), "H₂O");
});

test("moves existing script characters between script styles", () => {
  assert.equal(convertToScript("x²", "subscript"), "ₓ₂");
  assert.equal(convertToScript("x₂", "superscript"), "ˣ²");
});

test("clears supported Unicode script characters", () => {
  assert.equal(clearScriptCharacters("E = mc² and H₂O"), "E = mc2 and H2O");
});

test("replaces a text range and leaves the caret after the insertion", () => {
  assert.deepEqual(replaceTextRange("alpha beta", 6, 10, "β"), {
    value: "alpha β",
    selectionStart: 7,
    selectionEnd: 7,
  });
});

test("only transforms a non-empty text selection", () => {
  assert.equal(transformTextRange("H2O", 1, 1, (value) => value), null);
  assert.deepEqual(transformTextRange("H2O", 1, 2, (value) => convertToScript(value, "subscript")), {
    value: "H₂O",
    selectionStart: 1,
    selectionEnd: 2,
  });
});
