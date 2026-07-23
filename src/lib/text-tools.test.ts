import assert from "node:assert/strict";
import test from "node:test";

import {
  CHART_MARKERS,
  clearScriptCharacters,
  convertToScript,
  DEVANAGARI_QUICK_INSERT,
  replaceTextRange,
  transformTextRange,
} from "./text-tools";

test("includes the visual markers used by annotated charts", () => {
  assert.deepEqual(CHART_MARKERS.map(({ char }) => char), ["🅰️", "Ⓜ️", "🌟", "🌼"]);
});

test("includes Sanskrit phonetic and Vedic signs", () => {
  const characters: readonly string[] = DEVANAGARI_QUICK_INSERT.map(({ char }) => char);
  for (const character of ["ँ", "ं", "ः", "ᳵ", "ᳶ"]) {
    assert.ok(characters.includes(character), `Expected ${character} in the Devanāgarī palette`);
  }
});

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
