export interface LocalFontData {
  family: string;
  style: string;
  blob(): Promise<Blob>;
}

export interface EmbeddedLocalFont {
  family: string;
  cssText: string;
  baseUrl: string;
}

/** Read the font's own weight, italic and embedding flags, not guessed style names. */
export function localFontDescriptors(buffer: ArrayBuffer) {
  const data = new DataView(buffer);
  if (data.byteLength < 12) throw new Error("Invalid font file.");
  if (![0x00010000, 0x4f54544f, 0x74727565].includes(data.getUint32(0))) throw new Error("This font container cannot be embedded. Use image PDF to preserve its appearance.");
  const count = data.getUint16(4);
  for (let i = 0; i < count; i++) {
    const record = 12 + i * 16;
    if (record + 16 > data.byteLength) throw new Error("Invalid font table.");
    // Local Font Access can expose several named instances of the same
    // variable file without their axis coordinates. Do not guess an instance.
    if (data.getUint32(record) === 0x66766172) throw new Error("This local variable font needs its exact variation settings. Use image PDF to preserve its appearance.");
  }
  for (let i = 0; i < count; i++) {
    const record = 12 + i * 16;
    if (record + 16 > data.byteLength) throw new Error("Invalid font table.");
    if (data.getUint32(record) !== 0x4f532f32) continue;
    const offset = data.getUint32(record + 8);
    const length = data.getUint32(record + 12);
    if (length < 64 || offset + length > data.byteLength) throw new Error("Invalid font metrics.");
    const flags = data.getUint16(offset + 8);
    // Chromium subsets fonts, so no-subsetting and bitmap-only faces cannot
    // take this route either. Image PDF remains available without embedding.
    if ((flags & 0x0e) === 2 || (flags & 0x300)) throw new Error("This font restricts PDF font embedding. Use image PDF to preserve its appearance.");
    const widths = [100, 50, 62.5, 75, 87.5, 100, 112.5, 125, 150, 200];
    return { weight: Math.max(1, Math.min(1000, data.getUint16(offset + 4))),
      stretch: widths[data.getUint16(offset + 6)] ?? 100,
      style: data.getUint16(offset + 62) & 1 ? "italic" : data.getUint16(offset + 62) & 0x200 ? "oblique" : "normal" };
  }
  throw new Error("This font format cannot be embedded reliably. Use image PDF to preserve its appearance.");
}

export async function readLocalPdfFonts(
  families: Set<string>,
  query?: () => Promise<LocalFontData[]>,
): Promise<EmbeddedLocalFont[]> {
  if (!families.size) return [];
  const names = Array.from(families).join(", ");
  if (!query) throw new Error(`PDF needs the fonts installed on your device: ${names}. Use desktop Chrome or Edge and allow local font access, or choose image PDF.`);
  let local: LocalFontData[];
  try { local = await query(); }
  catch { throw new Error(`Local font access was not granted. PDF needs: ${names}. Allow access and retry, or choose image PDF to keep the same appearance.`); }
  const result: EmbeddedLocalFont[] = [];
  for (const family of families) {
    const matches = local.filter(font => font.family.toLowerCase() === family.toLowerCase());
    if (!matches.length) throw new Error(`The font “${family}” is not available for embedding. Choose image PDF to preserve the font currently displayed.`);
    for (const font of matches) {
      const blob = await font.blob();
      const buffer = await blob.arrayBuffer();
      let descriptors: ReturnType<typeof localFontDescriptors>;
      try { descriptors = localFontDescriptors(buffer); }
      catch (error) { throw new Error(`${family}: ${error instanceof Error ? error.message : "Unable to read font."}`); }
      const { weight, style, stretch } = descriptors;
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
      result.push({ family: family.toLowerCase(), baseUrl: "",
        cssText: `@font-face{font-family:${JSON.stringify(family)};font-weight:${weight};font-style:${style};font-stretch:${stretch}%;src:url(data:font/otf;base64,${btoa(binary)})}` });
    }
  }
  return result;
}
