import assert from "node:assert/strict";
import test from "node:test";
import { portableFontStack } from "./portable-fonts";

test("preserves the self-hosted Shobhika family used by existing boards", () => {
  assert.equal(portableFontStack("Shobhika, serif", new Set(["shobhika"])), "Shobhika, serif");
});

test("OS-only fonts cannot silently become Noto or another fallback", () => {
  assert.throws(() => portableFontStack('"Nirmala UI", Mangal, sans-serif', new Set(["mangal", "noto sans devanagari"])), /Nirmala UI/);
});
test("retains the authored font stack without inserting a replacement", () => {
  assert.equal(portableFontStack('"Tiro Devanagari Sanskrit", serif', new Set(["tiro devanagari sanskrit"])), '"Tiro Devanagari Sanskrit", serif');
});
