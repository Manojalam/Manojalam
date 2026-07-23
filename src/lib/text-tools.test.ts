import assert from "node:assert/strict";
import test from "node:test";

import {
  CHART_MARKERS,
  clearScriptCharacters,
  convertToScript,
  DEVANAGARI_CONSONANTS,
  DEVANAGARI_NUMERALS,
  DEVANAGARI_QUICK_INSERT,
  DEVANAGARI_VOWEL_MARKS,
  DEVANAGARI_VOWELS,
  ENCLOSED_LETTERS,
  FLOWER_SYMBOLS,
  GENERAL_SYMBOL_GROUPS,
  normalizeSymbolAppearance,
  PHONETIC_SYMBOLS,
  replaceTextRange,
  SANSKRIT_SYMBOL_GROUPS,
  STATUS_SYMBOLS,
  transformTextRange,
} from "./text-tools";

test("includes the visual markers used by annotated charts", () => {
  assert.deepEqual(CHART_MARKERS.map(({ char }) => char), ["🅰️", "Ⓜ️", "🌟", "🌼"]);
  assert.equal(CHART_MARKERS[1].appearance.scale, 1.2);
});

test("organizes a broad reusable symbol library", () => {
  const statuses = new Set<string>(STATUS_SYMBOLS);
  const flowers = new Set<string>(FLOWER_SYMBOLS);
  const letters = new Set<string>(ENCLOSED_LETTERS.map((symbol) =>
    typeof symbol === "string" ? symbol : symbol.char
  ));

  assert.ok(statuses.has("✓"));
  assert.ok(statuses.has("❌"));
  assert.ok(flowers.has("🌼"));
  assert.ok(flowers.has("🪷"));
  assert.ok(letters.has("🅰️"));
  assert.ok(letters.has("Ⓜ️"));
  assert.ok(letters.has("Ⓐ"));
  assert.ok(letters.has("Ⓩ"));
  assert.deepEqual(
    GENERAL_SYMBOL_GROUPS.slice(0, 6).map(({ id }) => id),
    ["status", "phonetics", "flowers", "stars", "letters", "shapes"]
  );
});

test("includes Sanskrit phonetic and Vedic signs", () => {
  const characters: readonly string[] = DEVANAGARI_QUICK_INSERT.map(({ char }) => char);
  for (const character of ["ँ", "ं", "ः", ")(", "ᳶ"]) {
    assert.ok(characters.includes(character), `Expected ${character} in the Devanāgarī palette`);
  }
  const jihvamuliya = DEVANAGARI_QUICK_INSERT.find((symbol) =>
    "semanticId" in symbol && symbol.semanticId === "jihvamuliya"
  );
  const upadhmaniya = DEVANAGARI_QUICK_INSERT.find((symbol) =>
    "semanticId" in symbol && symbol.semanticId === "upadhmaniya"
  );
  assert.equal(jihvamuliya?.char, ")(");
  assert.equal(jihvamuliya?.appearance.scale, 1.1);
  assert.equal(upadhmaniya?.char, "ᳶ");
  assert.equal(upadhmaniya?.appearance.scale, 1.2);
  assert.equal("font" in (upadhmaniya?.appearance ?? {}), false);
});

test("includes semantic breath and articulation markers", () => {
  assert.deepEqual(
    PHONETIC_SYMBOLS.map(({ semanticId, char }) => [semanticId, char]),
    [
      ["mahaprana", "💨"],
      ["alpaprana", "○"],
      ["karkasha", "🪨"],
    ]
  );
});

test("normalizes reusable symbol appearance controls", () => {
  assert.deepEqual(normalizeSymbolAppearance({
    enclosure: "circle",
    fillColor: "#3B82F6",
    borderColor: "#not-a-color",
    scale: 9,
    font: "tiro-devanagari",
  }), {
    enclosure: "circle",
    fillColor: "#3b82f6",
    borderColor: undefined,
    scale: 1.6,
    font: "tiro-devanagari",
  });
});

test("includes full Sanskrit character groups for chart authoring", () => {
  assert.equal(DEVANAGARI_VOWELS.length, 14);
  assert.ok(DEVANAGARI_CONSONANTS.includes("क"));
  assert.ok(DEVANAGARI_CONSONANTS.includes("ज्ञ"));
  assert.ok(DEVANAGARI_VOWEL_MARKS.includes("्"));
  assert.deepEqual(DEVANAGARI_NUMERALS, ["०", "१", "२", "३", "४", "५", "६", "७", "८", "९"]);
  assert.deepEqual(
    SANSKRIT_SYMBOL_GROUPS.map(({ id }) => id),
    ["articulation", "iast", "vowels", "consonants", "vowel-marks", "numerals", "vedic"]
  );
  assert.equal(SANSKRIT_SYMBOL_GROUPS[0].symbols, PHONETIC_SYMBOLS);
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
