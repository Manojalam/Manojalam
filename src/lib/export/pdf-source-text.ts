import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from "pdf-lib";

export interface PdfSourceWord { text: string; x: number; y: number; width: number; height: number }

/** Keep Chromium's shaped vector artwork; use source Unicode for selection/search.
 * Glyph IDs cannot reliably be reversed to Indic source clusters. A positioned,
 * invisible standard-font word layer uses explicit Unicode and never changes artwork.
 */
export async function addPdfSourceText(bytes: Uint8Array, words: PdfSourceWord[]) {
  const doc = await PDFDocument.load(bytes);
  if (doc.getPageCount() !== 1) throw new Error("The board did not fit on one PDF page.");
  const context = doc.context;
  // Chrome reads Skia's ActualText spans before consulting ToUnicode. Neutralize
  // both representations; retaining old ActualText corrupts copied Indic text.
  const paintStreams = new Set<PDFRawStream>();
  for (const page of doc.getPages()) {
    const contents = page.node.Contents();
    if (contents instanceof PDFArray) for (const entry of contents.asArray()) {
      const stream = context.lookup(entry); if (stream instanceof PDFRawStream) paintStreams.add(stream);
    }
    else if (contents instanceof PDFRawStream) paintStreams.add(contents);
  }
  for (const [ref, object] of context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream)) continue;
    if (!paintStreams.has(object) && object.dict.get(PDFName.of("Subtype")) !== PDFName.of("Form")) continue;
    const source = Buffer.from(decodePDFRawStream(object).decode()).toString("latin1");
    const cleaned = source.replace(/\/ActualText\s*<[^>]*>/g, "/ActualText <FEFF0020>");
    if (cleaned === source) continue;
    const replacement = context.flateStream(Buffer.from(cleaned, "latin1"));
    for (const [key, value] of object.dict.entries()) {
      if (!["Length", "Filter", "DecodeParms"].includes(key.decodeText())) replacement.dict.set(key, value);
    }
    context.assign(ref, replacement);
  }
  // Suppress duplicate, incorrectly mapped text without changing glyph painting.
  // Empty mappings trigger fallback; zero-width characters pollute Chrome copy.
  // Ordinary whitespace is consistently treated as non-content by both engines.
  for (const [, object] of context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFDict) || object.get(PDFName.of("Type")) !== PDFName.of("Font")) continue;
    const map = object.lookup(PDFName.of("ToUnicode"));
    if (!(map instanceof PDFRawStream)) continue;
    let source = Buffer.from(decodePDFRawStream(map).decode()).toString();
    source = source.replace(/beginbfchar([\s\S]*?)endbfchar/g, (_, body: string) =>
      "beginbfchar" + body.replace(/(<[\da-f]+>)\s*<[\da-f]+>/gi, "$1 <0020>") + "endbfchar");
    source = source.replace(/beginbfrange([\s\S]*?)endbfrange/g, (_, body: string) =>
      "beginbfrange" + body.replace(/<([\da-f]+)>\s*<([\da-f]+)>\s*(?:<[\da-f]+>|\[[^\]]*\])/gi,
        (_, first: string, last: string) => {
          const count = parseInt(last, 16) - parseInt(first, 16) + 1;
          if (count < 1 || count > 65536) throw new Error("Invalid PDF font mapping.");
          return `<${first}> <${last}> [${"<0020> ".repeat(count)}]`;
        }) + "endbfrange");
    object.set(PDFName.of("ToUnicode"), context.register(context.flateStream(source)));
  }
  const page = doc.getPage(0);
  const characters = Array.from(new Set(words.flatMap(word => Array.from(word.text))));
  const glyphs = new Map<string, { font: string; code: string }>();
  for (let start = 0; start < characters.length; start += 200) {
    const batch = characters.slice(start, start + 200);
    const mappings = batch.map((character, index) =>
      `<${(index + 1).toString(16).padStart(2, "0")}> <${Buffer.from(character, "utf16le").swap16().toString("hex")}>`);
    const cmap = context.register(context.flateStream(`/CIDInit /ProcSet findresource begin 12 dict begin begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /BoardSource def /CMapType 2 def
1 begincodespacerange <01> <c8> endcodespacerange
${mappings.slice(0,100).length} beginbfchar ${mappings.slice(0,100).join("\n")} endbfchar
${mappings.length > 100 ? `${mappings.length - 100} beginbfchar ${mappings.slice(100).join("\n")} endbfchar` : ""}
endcmap CMapName currentdict /CMap defineresource pop end end`));
    const font = context.register(context.obj({ Type: "Font", Subtype: "Type1", BaseFont: "Helvetica",
      Encoding: { Type: "Encoding", Differences: [1, ...batch.map(() => "M")] },
      FirstChar: 1, LastChar: batch.length, Widths: batch.map(() => 1000), ToUnicode: cmap,
    }));
    const name = page.node.newFontDictionary("BoardSource", font).toString();
    batch.forEach((character, index) => glyphs.set(character, { font: name, code: (index + 1).toString(16).padStart(2, "0") }));
  }
  const operators = words.map(word => {
    const characters = Array.from(word.text);
    if (!characters.length) return "";
    const x = word.x * .75, height = word.height * .75;
    const y = page.getHeight() - word.y * .75 - height * .8;
    const runs: { font: string; codes: string }[] = [];
    for (const character of characters) {
      const glyph = glyphs.get(character)!;
      const previous = runs.at(-1);
      if (previous?.font === glyph.font) previous.codes += glyph.code;
      else runs.push({ font: glyph.font, codes: glyph.code });
    }
    return `BT 3 Tr ${word.width / (word.height * characters.length)} 0 0 1 ${x} ${y} Tm ${runs.map(run => `${run.font} ${height} Tf <${run.codes}> Tj`).join(" ")} ET`;
  });
  page.node.addContentStream(context.register(context.flateStream(operators.join("\n"))));
  return doc.save();
}
