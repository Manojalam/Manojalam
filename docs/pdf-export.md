# Board PDF export

Export PDF downloads one continuous custom-size PDF directly, without a print
dialog. The client prepares the full scope at identity zoom, embeds fonts and
images, removes controls, and unwraps SVG foreignObject into real HTML.
/api/export-pdf renders it using serverless Chromium and Puppeteer. Fonts,
HTML/SVG images and CSS backgrounds finish loading before capture.

## Searchable Sanskrit

Chromium's native mappings lose some Devanagari characters and split clusters.
The submitted PDF reproduced this with thousands of fragments and NUL characters.
Native vector text alone is insufficient.

The renderer measures source words and adds an invisible standard-font text layer with
explicit UTF-16 Unicode mappings. Original glyph mappings and ActualText become
neutral whitespace to prevent duplicate/broken extraction; visible drawing operators remain
unchanged. No substitute font, OCR or reshaping is needed. Each source Unicode character has an explicit mapping for Chrome selection.
Rotated text, wrapped words and unusual SVG arrangements can have approximate
selection rectangles. Readers differ in whitespace and reading order. This is
not a tagged-accessibility PDF. Text inside images has no source layer.

## Deployment and limits

- Node 24, @sparticuz/chromium and puppeteer-core. Browser binaries are traced
  into the PDF route only. No separate rendering service is needed.
- Local Windows/macOS: set PDF_CHROMIUM_EXECUTABLE_PATH to Chrome/Edge.
  Linux deployments use the bundled binary.
- Same-origin requests and verified Supabase users are required when cloud auth
  is configured. Local-only installations work without Supabase. Guests can use
  image PDF export.
- Scripts are disabled. Resource requests allow only data: and about:blank;
  external network and filesystem requests are blocked. Rendering has a timeout
  and per-instance concurrency limit. The route does not persist board HTML.
- Compressed requests are capped at 4 MB and decompressed HTML at 40 MB, beneath
  Vercel's 4.5 MB request limit. PDF responses stream. Oversized/failed exports
  report an error and offer the explicit fallback; no silent raster conversion.
- Page size follows board bounds; above 14,400 points the board scales
  proportionally onto one page. Unexpected pagination is rejected.
- Glows/filters can be rasterized by Chromium. Vector text has no resolution
  setting. Image fallback retains resolution controls, lossless PNG, links,
  and canvas limits (16,384 pixels / 96 million pixels).
- Image/SVG, PowerPoint and explicit multi-page hierarchy export are unchanged.

References: [Puppeteer PDF options](https://pptr.dev/api/puppeteer.pdfoptions),
[serverless Chromium](https://github.com/Sparticuz/chromium),
[Vercel limits](https://vercel.com/docs/functions/limitations),
[streaming responses](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions).

## Verification

npm run test:browser-pdf covers Unicode mappings, page bounds, document
construction, inert content and existing DOM/raster/PDF regressions.

The direct renderer was exercised on a 12-panel React Flow/TipTap Sanskrit board
with off-screen content, conjuncts, vowel marks, colored text, underlined sutras,
rounded panels and glows. Output remained one page. Complete Sanskrit words
extracted without NULs. Browser PDF.js rendering at the board's display scale
had a mean RGB difference of 0.63/255 in the inspected top region, matching the
previous native-vector comparison; the text layer did not change the artwork.

For the native-renderer integration test, run `node scripts/run-direct-pdf-smoke.mjs`
after building (set `PDF_CHROMIUM_EXECUTABLE_PATH` on Windows/macOS). It checks a
14,400-point single page, complete Sanskrit phrases at both ends, inert scripts,
and rejection of an external image. Browser PDF.js search also found all 12
occurrences of a conjunct-bearing word in the full board fixture, and selection
copied it without missing characters.

## Portable fonts

Server PDF preparation keeps the authored font stacks. App-provided fonts are
embedded automatically. Desktop Chrome/Edge can read device fonts with the
Local Font Access API after the user's permission; only the requested families'
font bytes are included in that export, with weight, italic and width descriptors
from the font's OS/2 table. Font bytes are not saved to the board or a library.
`node scripts/check-local-pdf-fonts.mjs` tests actual local font access and
unchanged regular/bold/italic metrics on a desktop with Arial and Georgia,
after the direct PDF smoke test has prepared the renderer modules.

Missing fonts, denied permission, unsupported containers/local variable instances,
and embedding restrictions produce an error rather than a substitute. The image
PDF option remains available to preserve appearance without font embedding.
App-provided variable web fonts continue to use their existing CSS descriptors.
The server also checks the actual glyph fonts with Chromium's CSS domain and
rejects platform fallback, including missing glyphs in otherwise loaded fonts.
This avoids silently changing an Indic font, punctuation or other script.

References: [Chrome Local Font Access](https://developer.chrome.com/docs/capabilities/web-apis/local-fonts),
[OpenType OS/2 embedding flags](https://learn.microsoft.com/en-us/typography/opentype/spec/os2#fstype).

Vercel postbuild runs the native renderer smoke test using the shipped Linux
Chromium binary. The test requires a visible Devanagari font in the PDF, intact
Unicode at both ends, and rejection when the required embedded face is absent.

Chrome/PDFium regression checks use `scripts/check-pdfium-copy.py` (pypdfium2)
against the native smoke-test PDF. The test requires the complete reported
Sanskrit sentence, including a wrapped line, to copy without lost characters.
PDF.js tests alone are insufficient: Chrome honors native ActualText fragments
and ignores empty Type3 glyphs. PDF viewers may add whitespace or line breaks.
