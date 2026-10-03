import assert from "node:assert/strict";
import test from "node:test";
import { portableFontStack } from "./portable-fonts";

test("OS-only fonts become an embedded fallback rather than Linux Open Sans", () => {
  assert.equal(portableFontStack('"Nirmala UI", Mangal, sans-serif', new Set()), '"Board Export Devanagari"');
});
test("retains authored web fonts and adds a portable missing-glyph fallback", () => {
  assert.equal(portableFontStack('"Tiro Devanagari Sanskrit", serif', new Set(["tiro devanagari sanskrit"])), '"Tiro Devanagari Sanskrit", "Board Export Devanagari"');
});
