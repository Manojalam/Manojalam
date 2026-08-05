import assert from "node:assert/strict";
import test from "node:test";

import { SHLOKA_STUDY_PALETTES } from "./shloka-study-palette";

test("every Śloka study section has a distinct two-tone accessible palette", () => {
  const palettes = Object.values(SHLOKA_STUDY_PALETTES);
  assert.equal(palettes.length, 9);
  assert.equal(new Set(palettes.map((palette) => palette.accent)).size, palettes.length);

  for (const palette of palettes) {
    assert.match(palette.card, /border-/);
    assert.match(palette.card, /bg-/);
    assert.match(palette.card, /dark:/);
    assert.match(palette.content, /border-/);
    assert.match(palette.content, /bg-/);
    assert.match(palette.content, /dark:/);
  }
});
