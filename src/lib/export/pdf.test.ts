import assert from "node:assert/strict";
import test from "node:test";

import {
  createBoardPdf,
  pdfRectForExportLink,
  resolvePdfLinkHref,
  resolvePdfPageSize,
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
