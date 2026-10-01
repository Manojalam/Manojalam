# Board PDF export

The direct **Export PDF** download remains a continuous custom-size page made
from a lossless PNG, with link annotations. It preserves the existing renderer
and canvas safety planning (16,384 pixels per dimension / 96 million pixels).
It can reduce the requested raster scale on oversized boards. Raising this
scale does not turn text into vector text.

The additional **Print PDF with selectable text** action prepares an isolated,
sandboxed HTML document and asks the browser to print it. It reuses the export
scope, computed styles, embedded fonts/images, editor exclusion and identity
viewport transform. The outer SVG foreignObject wrapper is removed, so the
browser receives actual HTML text and nested SVG shapes, not a board image.
Native CSS effects are retained for the print compositor. Fonts and images are
awaited in both the source and destination documents; failed resources stop
printing rather than silently substituting Sanskrit fonts.

## Approach evaluation

* Browser HTML printing: keeps the browser's shaping engine and can emit text
  and simple shapes as PDF vectors. No added server or transfer of board content.
  Custom page size, backgrounds and headers remain subject to browser settings.
* Headless Chromium/Puppeteer service: uses the same shaping/print engine and
  can set `preferCSSPageSize`, `printBackground`, and margins explicitly. A
  reliable deployment needs browser binaries, memory/time budgets, authenticated
  upload handling and isolation for user HTML. That infrastructure is not part
  of the current browser exporter; none was added in this change.
* jsPDF plus SVG conversion: does not solve HTML export. svg2pdf lists
  foreignObject as unsupported. Rebuilding the board as PDF drawing commands
  would also require a shaping/layout engine, not just font embedding.
* Higher-resolution PNG: useful as a compatibility fallback, but still lacks
  text selection and is constrained by browser canvas memory/dimensions.

References: [Puppeteer PDF options](https://pptr.dev/api/puppeteer.pdfoptions),
[Chrome paged-media controls](https://developer.chrome.com/blog/print-margins),
[svg2pdf unsupported features](https://github.com/yWorks/svg2pdf.js/issues/82).

## Print settings and limits

Use Chrome/Edge's **Save as PDF**, backgrounds enabled, no margins or
headers/footers, and 100% scale. Confirm the preview shows exactly one page.
CSS requests a custom page matching board bounds. Above the existing PDF
14,400-point dimension limit, it scales the entire board proportionally onto
one page. No new pagination is introduced. Browser rounding can change the
physical page size slightly. Printer drivers and some browsers can override
CSS page sizes; the web app cannot force or inspect print-dialog settings.
Use the direct image PDF download when the browser cannot honor them.

Effects such as blurred glows may be rasterized locally by the browser. Some
filter combinations can also rasterize text. Text selection is therefore
content/browser dependent. Even when text remains vector and selectable,
Sanskrit copy/paste can split clusters or contain missing mappings in a PDF
viewer. This is not a promise of lossless searchable Unicode extraction.
Browser printing reports a print request, not a confirmed save; canceling the
system dialog does not generate a downloaded file.

Image/SVG exports, PowerPoint, and the separate multi-page hierarchy exporter
continue through their existing paths.

## Verification

`npm run test:browser-pdf` covers document construction, custom-size scaling,
inert content, and existing PDF/raster/DOM renderer regressions.

An Edge/Chromium integration fixture used actual React Flow/ShapeNode/TipTap
content: 12 panels over 5,350 CSS pixels, Devanagari conjuncts and vowel marks,
colored text, underlined sutra links, rounded borders, and glows. Native output
was one approximately 690 x 4,013 point page with 2,100 text drawing operations;
the fallback was one page with one image and no text operations. All 12 panels,
including the last off-screen panel, were present. Editor controls were absent.

At an equivalent 96-DPI display scale, browser PDF rendering and the actual board
had a mean RGB-channel difference of 0.63/255 in the inspected top region;
about 0.3% of pixels differed by more than 30/255. Visual review checked first
and last panels for clipping and glyph placement. Changing the source viewport
from 0.6x to 1.4x produced identical rendered pixels in the compared region.
The same comparison against printable HTML gave the same result. A second
25,550-pixel-long board remained one page at the proportional 14,400-point cap,
including its last panel; the raster fallback safely reduced output to
590 x 16,384 pixels. Underline offset, position, thickness and skip-ink settings
are now copied into all export clones after the app comparison exposed their
absence.

Text extraction confirmed selectable text objects but also found split clusters
and missing Unicode mappings; that limitation is exposed in the export UI.
Automated PDF generation used Chromium's print backend with CSS page sizes
enabled. OS print-dialog settings and Firefox/Safari were not validated.
