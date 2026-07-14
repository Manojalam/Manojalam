import assert from "node:assert/strict";
import test from "node:test";
import { Buffer } from "node:buffer";
import { createSvgRasterDataUrl } from "./svg-raster-source";

const PREFIX = "data:image/svg+xml;charset=utf-8;base64,";

function decodeSvgDataUrl(value: string): string {
  assert.ok(value.startsWith(PREFIX));
  return Buffer.from(value.slice(PREFIX.length), "base64").toString("utf8");
}

test("foreignObject SVG raster sources are data URLs rather than Blob URLs", () => {
  const source = '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div xmlns="http://www.w3.org/1999/xhtml">content</div></foreignObject></svg>';
  const result = createSvgRasterDataUrl(source);

  assert.match(result, /^data:image\/svg\+xml/);
  assert.doesNotMatch(result, /^blob:/);
  assert.equal(decodeSvgDataUrl(result), source);
});

test("SVG raster data URLs preserve large Devanagari content without truncation", () => {
  const label = "अनुष्णाशीतस्पर्शः पृथिवी आपः तेजः वायुः आकाशः ".repeat(4_000);
  const source = `<svg xmlns="http://www.w3.org/2000/svg"><text>${label}</text></svg>`;

  assert.equal(decodeSvgDataUrl(createSvgRasterDataUrl(source)), source);
});

test("malformed lone surrogates are safely replaced during SVG URL encoding", () => {
  const source = "<svg>before\ud800after</svg>";
  const decoded = decodeSvgDataUrl(createSvgRasterDataUrl(source));

  assert.equal(decoded, "<svg>before�after</svg>");
});
