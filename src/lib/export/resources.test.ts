import assert from "node:assert/strict";
import test from "node:test";
import { validateFetchedExportAsset } from "./resources";

const pngBytes = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const jpegBytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]);
const woff2Bytes = Uint8Array.from([0x77, 0x4f, 0x46, 0x32]);
const htmlBytes = new TextEncoder().encode("<!doctype html><html><body>not an asset</body></html>");

test("accepts recognizable image bytes and supplies a renderable MIME for binary responses", () => {
  assert.equal(validateFetchedExportAsset("image/png", pngBytes, "image"), "image/png");
  assert.equal(
    validateFetchedExportAsset("application/octet-stream", pngBytes, "style"),
    "image/png"
  );
});

test("rejects HTML and mismatched image bytes even when the response claims to be an image", () => {
  assert.throws(
    () => validateFetchedExportAsset("image/png", htmlBytes, "image"),
    /recognizable image bytes/i
  );
  assert.throws(
    () => validateFetchedExportAsset("image/png", jpegBytes, "image"),
    /declared image\/png but contained image\/jpeg/i
  );
  assert.throws(
    () => validateFetchedExportAsset("text/html", pngBytes, "image"),
    /image MIME type/i
  );
});

test("requires both a supported font MIME and a recognizable font signature", () => {
  assert.equal(validateFetchedExportAsset("font/woff2", woff2Bytes, "font"), "font/woff2");
  assert.equal(
    validateFetchedExportAsset("application/octet-stream", woff2Bytes, "font"),
    "font/woff2"
  );
  assert.throws(
    () => validateFetchedExportAsset("font/woff2", htmlBytes, "font"),
    /recognizable font bytes/i
  );
  assert.throws(
    () => validateFetchedExportAsset("text/html", woff2Bytes, "font"),
    /font MIME type/i
  );
});

test("accepts an SVG root but rejects HTML that merely contains an SVG element", () => {
  const svg = new TextEncoder().encode("<?xml version=\"1.0\"?><svg xmlns=\"http://www.w3.org/2000/svg\"/>");
  const htmlWithSvg = new TextEncoder().encode("<html><body><svg></svg></body></html>");
  assert.equal(validateFetchedExportAsset("image/svg+xml", svg, "image"), "image/svg+xml");
  assert.throws(
    () => validateFetchedExportAsset("image/svg+xml", htmlWithSvg, "image"),
    /recognizable image bytes/i
  );
});
