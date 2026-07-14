import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyExportError,
  exportErrorUserMessage,
} from "./errors";

test("distinguishes remote font failures from remote image failures", () => {
  assert.equal(
    classifyExportError("prepare-assets", new TypeError("CORS blocked remote font")),
    "REMOTE_FONT_CORS"
  );
  assert.equal(
    classifyExportError("prepare-assets", new TypeError("CORS blocked remote image")),
    "REMOTE_IMAGE_CORS"
  );
});

test("does not describe a font failure as a remote image", () => {
  const fontMessage = exportErrorUserMessage("REMOTE_FONT_CORS");
  const imageMessage = exportErrorUserMessage("REMOTE_IMAGE_CORS");
  assert.match(fontMessage, /font/i);
  assert.doesNotMatch(fontMessage, /remote image/i);
  assert.match(imageMessage, /image/i);
});

test("does not assume every tainted canvas was caused by a remote image", () => {
  const message = exportErrorUserMessage("CANVAS_TAINTED");

  assert.match(message, /PNG/i);
  assert.doesNotMatch(message, /remote image/i);
});
