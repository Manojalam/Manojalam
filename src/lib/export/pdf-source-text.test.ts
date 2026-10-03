import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { addPdfSourceText } from "./pdf-source-text";

test("source Unicode survives conjuncts without changing page geometry", async () => {
  const original = await PDFDocument.create();
  original.addPage([600, 14400]);
  const text = "विधिनिर्णयः क्षत्रियः ज्ञानम्";
  const result = await PDFDocument.load(await addPdfSourceText(await original.save(), [
    { text, x: 20, y: 40, width: 300, height: 24 },
  ]));
  assert.equal(result.getPageCount(), 1);
  assert.deepEqual(result.getPage(0).getSize(), { width: 600, height: 14400 });
  const streams = result.context.enumerateIndirectObjects().map(([, object]) => object)
    .filter((object): object is PDFRawStream => object instanceof PDFRawStream)
    .map(stream => Buffer.from(decodePDFRawStream(stream).decode()).toString());
  assert.ok(streams.some(stream => stream.includes(Buffer.from(text, "utf16le").swap16().toString("hex"))));
  assert.ok(streams.some(stream => stream.includes("3 Tr")));
});

test("broken native mappings are suppressed, including ranged mappings", async () => {
  const original = await PDFDocument.create(); original.addPage();
  const map = original.context.register(original.context.flateStream("1 beginbfchar <01> <0000> endbfchar 1 beginbfrange <02> <04> <0900> endbfrange"));
  const font = original.context.register(original.context.obj({ Type: "Font", ToUnicode: map }));
  original.getPage(0).node.newFontDictionary("Native", font);
  const result = await PDFDocument.load(await addPdfSourceText(await original.save(), []));
  const streams = result.context.enumerateIndirectObjects().map(([, object]) => object)
    .filter((object): object is PDFRawStream => object instanceof PDFRawStream)
    .map(stream => Buffer.from(decodePDFRawStream(stream).decode()).toString());
  assert.ok(streams.some(stream => stream.includes("<01> <200B>") && stream.includes("[<200B> <200B> <200B> ]")));
});

test("rejects unexpected pagination rather than hiding additional pages", async () => {
  const original = await PDFDocument.create(); original.addPage(); original.addPage();
  await assert.rejects(addPdfSourceText(await original.save(), []), /one PDF page/);
});

test("PDF.js extracts intact searchable Sanskrit from multiple source fonts", async () => {
  const original = await PDFDocument.create(); original.addPage([600, 14400]);
  const words = Array.from({ length: 260 }, (_, index) => ({
    text: "क्षत्रियः ज्ञानम् विधिनिर्णयः ", x: 20, y: 20 + index * 28, width: 250, height: 24,
  }));
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: await addPdfSourceText(await original.save(), words) });
  const pdf = await task.promise;
  try {
    const content = await (await pdf.getPage(1)).getTextContent();
    const text = content.items.map(item => "str" in item ? item.str : "").join(" ");
    assert.equal(text.includes("\u0000"), false);
    assert.equal(text.match(/क्षत्रियः ज्ञानम् विधिनिर्णयः/g)?.length, 260);
  } finally { await task.destroy(); }
});
