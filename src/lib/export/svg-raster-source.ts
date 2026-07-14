const SVG_DATA_URL_PREFIX = "data:image/svg+xml;charset=utf-8;base64,";
const BINARY_CHUNK_SIZE = 0x8000;

/**
 * Build the image source used to rasterize an SVG into a canvas.
 *
 * Chromium intentionally taints a canvas when an SVG containing
 * `<foreignObject>` was decoded through a Blob URL, even when the SVG is
 * completely self-contained. The same SVG is origin-clean when decoded from
 * a data URL. Board exports rely on foreignObject for their HTML content, so
 * they must never use URL.createObjectURL for this decode step.
 *
 * TextEncoder preserves arbitrary Unicode (including Devanagari) and replaces
 * malformed lone surrogates with U+FFFD. Chunking avoids spreading a large
 * export into a single function call and the base64 form is considerably more
 * compact than percent-encoding non-ASCII chart text.
 */
export function createSvgRasterDataUrl(source: string): string {
  const bytes = new TextEncoder().encode(source);
  const chunks: string[] = [];

  for (let offset = 0; offset < bytes.length; offset += BINARY_CHUNK_SIZE) {
    const end = Math.min(bytes.length, offset + BINARY_CHUNK_SIZE);
    let chunk = "";
    for (let index = offset; index < end; index += 1) {
      chunk += String.fromCharCode(bytes[index]!);
    }
    chunks.push(chunk);
  }

  return `${SVG_DATA_URL_PREFIX}${btoa(chunks.join(""))}`;
}
