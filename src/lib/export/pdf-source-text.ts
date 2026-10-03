import { PDFDict, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream, type PDFRef } from "pdf-lib";

export interface PdfSourceWord { text: string; x: number; y: number; width: number; height: number }

/** Keep Chromium's shaped vector artwork; use source Unicode for selection/search.
 * Glyph IDs cannot reliably be reversed to Indic source clusters. A positioned,
 * invisible Type3 word layer needs no substitute font and never changes artwork.
 */
export async function addPdfSourceText(bytes: Uint8Array, words: PdfSourceWord[]) {
  const doc = await PDFDocument.load(bytes);
  if (doc.getPageCount() !== 1) throw new Error("The board did not fit on one PDF page.");
  const context = doc.context;
  // Suppress duplicate, incorrectly mapped text without changing glyph painting.
  // Empty mappings trigger font fallback in readers; explicit zero-width spaces
  // are ignored by PDF.js search/extraction instead.
  for (const [, object] of context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFDict) || object.get(PDFName.of("Type")) !== PDFName.of("Font")) continue;
    const map = object.lookup(PDFName.of("ToUnicode"));
    if (!(map instanceof PDFRawStream)) continue;
    let source = Buffer.from(decodePDFRawStream(map).decode()).toString();
    source = source.replace(/beginbfchar([\s\S]*?)endbfchar/g, (_, body: string) =>
      "beginbfchar" + body.replace(/(<[\da-f]+>)\s*<[\da-f]+>/gi, "$1 <200B>") + "endbfchar");
    source = source.replace(/beginbfrange([\s\S]*?)endbfrange/g, (_, body: string) =>
      "beginbfrange" + body.replace(/<([\da-f]+)>\s*<([\da-f]+)>\s*(?:<[\da-f]+>|\[[^\]]*\])/gi,
        (_, first: string, last: string) => {
          const count = parseInt(last, 16) - parseInt(first, 16) + 1;
          if (count < 1 || count > 65536) throw new Error("Invalid PDF font mapping.");
          return `<${first}> <${last}> [${"<200B> ".repeat(count)}]`;
        }) + "endbfrange");
    object.set(PDFName.of("ToUnicode"), context.register(context.flateStream(source)));
  }
  const page = doc.getPage(0);
  for (let start = 0; start < words.length; start += 100) {
    const batch = words.slice(start, start + 100);
    const charProcs: Record<string, PDFRef> = {};
    const differences: (number | string)[] = [1];
    const mappings: string[] = [];
    batch.forEach((word, index) => {
      const code = index + 1;
      charProcs[`w${code}`] = context.register(context.flateStream("1000 0 d0"));
      differences.push(`w${code}`);
      mappings.push(`<${code.toString(16).padStart(2, "0")}> <${Buffer.from(word.text, "utf16le").swap16().toString("hex")}>`);
    });
    const cmap = context.register(context.flateStream(`/CIDInit /ProcSet findresource begin 12 dict begin begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /BoardSource def /CMapType 2 def
1 begincodespacerange <01> <fa> endcodespacerange
${batch.length} beginbfchar ${mappings.join("\n")} endbfchar
endcmap CMapName currentdict /CMap defineresource pop end end`));
    const font = context.register(context.obj({ Type: "Font", Subtype: "Type3",
      FontBBox: [0, -200, 1000, 800], FontMatrix: [.001, 0, 0, .001, 0, 0],
      CharProcs: charProcs, Encoding: { Type: "Encoding", Differences: differences },
      FirstChar: 1, LastChar: batch.length, Widths: batch.map(() => 1000), ToUnicode: cmap, Resources: {},
    }));
    const name = page.node.newFontDictionary("BoardSource", font);
    const operators = batch.map((word, index) => {
      const x = word.x * .75, height = word.height * .75;
      const y = page.getHeight() - word.y * .75 - height * .8;
      return `BT ${name} ${height} Tf 3 Tr ${word.width / word.height} 0 0 1 ${x} ${y} Tm <${(index + 1).toString(16).padStart(2, "0")}> Tj ET`;
    });
    page.node.addContentStream(context.register(context.flateStream(operators.join("\n"))));
  }
  return doc.save();
}
