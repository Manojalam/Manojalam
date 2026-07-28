import assert from "node:assert/strict";
import test from "node:test";

import {
  createBoardPdf,
  createMultiPageBoardPdf,
  pdfRectForExportLink,
  pdfRectForPlacedExportLink,
  resolvePdfLinkHref,
  resolvePdfPageSize,
  resolvePrintPdfPagePlacement,
} from "./pdf";

const ONE_PIXEL_PNG = Uint8Array.from(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
));

test("creates a single proportional PDF page and caps oversized dimensions", () => {
  assert.deepEqual(resolvePdfPageSize(2_000, 1_000), {
    width: 1_500,
    height: 750,
    pointsPerPixel: 0.75,
  });
  const huge = resolvePdfPageSize(40_000, 20_000);
  assert.equal(huge.width, 14_400);
  assert.equal(huge.height, 7_200);
});

test("maps a clipped chart link into PDF page coordinates", () => {
  const page = resolvePdfPageSize(1_000, 500);
  assert.deepEqual(
    pdfRectForExportLink(
      { x: 150, y: 75, width: 200, height: 40 },
      { x: 100, y: 50, width: 1_000, height: 500 },
      page
    ),
    { x: 37.5, y: 18.75, width: 150, height: 30 }
  );
  assert.equal(
    pdfRectForExportLink(
      { x: -200, y: -100, width: 20, height: 20 },
      { x: 100, y: 50, width: 1_000, height: 500 },
      page
    ),
    null
  );
});

test("fits a wide Matrix section onto a printable Letter page", () => {
  const page = resolvePrintPdfPagePlacement(1_600, 900, "letter", "auto", 24);

  assert.equal(page.pageWidth, 792);
  assert.equal(page.pageHeight, 612);
  assert.equal(page.imageX, 24);
  assert.equal(page.imageWidth, 744);
  assert.equal(page.imageHeight, 418.5);
  assert.equal(page.imageY, 96.75);
  assert.equal(page.pointsPerPixel, 0.465);
  assert.deepEqual(
    pdfRectForPlacedExportLink(
      { x: 200, y: 100, width: 160, height: 40 },
      { x: 100, y: 50, width: 1_600, height: 900 },
      page
    ),
    { x: 70.5, y: 120, width: 74.4, height: 18.6 }
  );
});

test("keeps safe PDF destinations and resolves app-relative links", () => {
  assert.equal(
    resolvePdfLinkHref("https://example.com/docs", "https://manojalam.app/app/boards/1"),
    "https://example.com/docs"
  );
  assert.equal(
    resolvePdfLinkHref("/help/shortcuts", "https://manojalam.app/app/boards/1"),
    "https://manojalam.app/help/shortcuts"
  );
  assert.equal(
    resolvePdfLinkHref("javascript:alert(1)", "https://manojalam.app/app/boards/1"),
    null
  );
});

test("writes clickable URL annotations into the generated PDF", async () => {
  const result = await createBoardPdf({
    png: ONE_PIXEL_PNG,
    sourceWidth: 800,
    sourceHeight: 400,
    exportBounds: { x: 100, y: 50, width: 800, height: 400 },
    links: [{
      href: "https://example.com/docs",
      bounds: { x: 180, y: 90, width: 220, height: 36 },
    }],
    title: "Clickable chart",
  });
  const bytes = new Uint8Array(await result.blob.arrayBuffer());
  const source = Buffer.from(bytes).toString("latin1");

  assert.equal(Buffer.from(bytes.subarray(0, 4)).toString("ascii"), "%PDF");
  assert.ok(result.blob.size > 500);
  assert.equal(result.linkAnnotationCount, 1);
  assert.match(source, /\/URI\s*\(https:\/\/example\.com\/docs\)/);
});

test("creates one printable PDF page per selected Matrix section", async () => {
  const result = await createMultiPageBoardPdf({
    pages: [
      {
        png: ONE_PIXEL_PNG,
        sourceWidth: 1_200,
        sourceHeight: 700,
        exportBounds: { x: 0, y: 0, width: 1_200, height: 700 },
      },
      {
        png: ONE_PIXEL_PNG,
        sourceWidth: 700,
        sourceHeight: 1_200,
        exportBounds: { x: 0, y: 0, width: 700, height: 1_200 },
      },
    ],
    paperSize: "letter",
    orientation: "auto",
    title: "Matrix sections",
  });
  const bytes = new Uint8Array(await result.blob.arrayBuffer());

  assert.equal(Buffer.from(bytes.subarray(0, 4)).toString("ascii"), "%PDF");
  assert.equal(result.pageCount, 2);
  assert.equal(result.pageWidth, 792);
  assert.equal(result.pageHeight, 612);
  assert.equal(result.linkAnnotationCount, 0);
});
