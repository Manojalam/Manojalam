import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { searchSutras, type SutraEntry } from "./sutra-search";

const catalog: SutraEntry[] = JSON.parse(readFileSync("public/sanskrit/sutras.json", "utf8")).data;

test("exact Sanskrit match survives more than 30 earlier partial matches", () => {
  assert.ok(catalog.filter(entry => ["धि", "च"].every(word => entry.text.includes(word))).length > 30);
  const results = searchSutras(catalog, "धि च");
  assert.equal(results[0].number, "8.2.25");
  assert.equal(results.length, 30);
});

test("exact text tolerates whitespace, joiners and a final danda", () => {
  for (const query of [" धि   च ", "धि च।", "धि\u200d च"]) {
    assert.equal(searchSutras(catalog, query)[0].number, "8.2.25");
  }
});

test("exact Roman text takes priority, including separated words", () => {
  for (const query of ["dhicha", "DHI CHA"]) {
    assert.equal(searchSutras(catalog, query)[0].number, "8.2.25");
  }
});

test("exact numbers and source URLs retain priority", () => {
  for (const query of ["8.2.25", "८.२.२५", "https://ashtadhyayi.com/sutraani/8/2/25"]) {
    assert.equal(searchSutras(catalog, query)[0].number, "8.2.25");
  }
});

test("complete text, phrase prefix and phrase precede unordered partial words", () => {
  const entries = ["च अन्य धि", "पूर्व धि च", "धि च अन्य", "धि च"].map((text, i) => ({number:`1.1.${i+1}`, text, roman:""}));
  assert.deepEqual(searchSutras(entries, "धि च").map(entry => entry.number), ["1.1.4", "1.1.3", "1.1.2", "1.1.1"]);
  assert.deepEqual(searchSutras(entries, "  "), []);
  assert.deepEqual(searchSutras(entries, "॥"), []);
  assert.deepEqual(searchSutras(entries, "unmatched"), []);
});
