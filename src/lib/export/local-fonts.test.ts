import assert from "node:assert/strict";
import test from "node:test";
import { localFontDescriptors, readLocalPdfFonts } from "./local-fonts";

function sfnt(flags = 0, weight = 400, italic = false) {
  const buffer = new ArrayBuffer(92);
  const view = new DataView(buffer);
  view.setUint32(0, 0x00010000);
  view.setUint16(4, 1);
  view.setUint32(12, 0x4f532f32);
  view.setUint32(20, 28);
  view.setUint32(24, 64);
  view.setUint16(32, weight);
  view.setUint16(36, flags);
  view.setUint16(90, italic ? 1 : 0);
  return buffer;
}

test("uses actual weight and italic metrics and checks embedding restrictions", () => {
  assert.deepEqual(localFontDescriptors(sfnt(4, 600, true)), { weight: 600, style: "italic", stretch: 100 });
  for (const flags of [2, 0x100, 0x200]) assert.throws(() => localFontDescriptors(sfnt(flags)), /restricts/);
  assert.throws(() => localFontDescriptors(new ArrayBuffer(8)), /Invalid/);
});

test("keeps condensed faces separate from regular faces", () => {
  const font = sfnt();
  new DataView(font).setUint16(34, 3);
  assert.equal(localFontDescriptors(font).stretch, 75);
});

test("web fonts do not request local font permission", async () => {
  assert.deepEqual(await readLocalPdfFonts(new Set(), () => { throw new Error("must not query"); }), []);
});

test("permission failures and missing fonts stop export instead of substituting", async () => {
  await assert.rejects(readLocalPdfFonts(new Set(["Siddhanta"])), /Siddhanta/);
  await assert.rejects(readLocalPdfFonts(new Set(["Siddhanta"]), async () => { throw new Error("denied"); }), /not granted/);
  await assert.rejects(readLocalPdfFonts(new Set(["Siddhanta"]), async () => []), /not available/);
});

test("reads only requested font bytes and preserves all family styles", async () => {
  const faces = await readLocalPdfFonts(new Set(["Siddhanta"]), async () => [
    { family: "Siddhanta", style: "Regular", blob: async () => new Blob([sfnt()]) },
    { family: "Siddhanta", style: "Bold Italic", blob: async () => new Blob([sfnt(0, 700, true)]) },
    { family: "Unrelated", style: "Regular", blob: async () => { throw new Error("must not read"); } },
  ]);
  assert.equal(faces.length, 2);
  assert.match(faces[1].cssText, /font-weight:700;font-style:italic/);
  assert.match(faces[0].cssText, /font-family:"Siddhanta"/);
});
