import assert from "node:assert/strict";
import test from "node:test";
import {
  destroyExportAssetTransfer,
  ExportAssetProxyError,
  hasRecognizedFontSignature,
  isAllowedExportAssetContentType,
  validateExportAssetUrl,
} from "./server-asset-proxy";

test("accepts public HTTP and HTTPS image locations", () => {
  assert.equal(validateExportAssetUrl("https://example.com/image.png").hostname, "example.com");
  assert.equal(validateExportAssetUrl("http://8.8.8.8/image.png").hostname, "8.8.8.8");
});

test("rejects unsupported protocols and embedded credentials", () => {
  for (const url of [
    "file:///etc/passwd",
    "data:image/png;base64,AAAA",
    "https://user:secret@example.com/image.png",
  ]) {
    assert.throws(
      () => validateExportAssetUrl(url),
      (cause: unknown) => cause instanceof ExportAssetProxyError && cause.code === "INVALID_URL"
    );
  }
});

test("rejects local hostnames and private, link-local, or loopback IP literals", () => {
  for (const url of [
    "http://localhost/image.png",
    "http://printer.local/image.png",
    "http://service.internal/image.png",
    "http://127.0.0.1/image.png",
    "http://2130706433/image.png",
    "http://10.0.0.8/image.png",
    "http://169.254.169.254/latest/meta-data",
    "http://192.168.1.10/image.png",
    "http://[::1]/image.png",
    "http://[::ffff:127.0.0.1]/image.png",
    "http://[fe80::1]/image.png",
    "http://[fc00::1]/image.png",
  ]) {
    assert.throws(
      () => validateExportAssetUrl(url),
      (cause: unknown) => cause instanceof ExportAssetProxyError && cause.code === "BLOCKED_TARGET"
    );
  }
});

test("keeps image and font response MIME types separate", () => {
  assert.equal(isAllowedExportAssetContentType("image/png", "image"), true);
  assert.equal(isAllowedExportAssetContentType("font/woff2", "image"), false);
  assert.equal(isAllowedExportAssetContentType("font/woff2; charset=binary", "font"), true);
  assert.equal(isAllowedExportAssetContentType("application/font-woff", "font"), true);
  assert.equal(isAllowedExportAssetContentType("image/svg+xml", "font"), false);
  assert.equal(isAllowedExportAssetContentType("text/html", "font"), false);
});

test("only accepts recognizable font bytes for generic binary responses", () => {
  assert.equal(hasRecognizedFontSignature(Uint8Array.from([0x77, 0x4f, 0x46, 0x32])), true);
  assert.equal(hasRecognizedFontSignature(Uint8Array.from([0x00, 0x01, 0x00, 0x00])), true);
  assert.equal(hasRecognizedFontSignature(new TextEncoder().encode("<html>not a font")), false);
});

test("destroys both halves of a rejected upstream transfer exactly once", () => {
  const destroyed: Array<"request" | "response"> = [];
  let requestDestroyed = false;
  let responseDestroyed = false;
  const request = {
    get destroyed() {
      return requestDestroyed;
    },
    destroy() {
      requestDestroyed = true;
      destroyed.push("request");
    },
  };
  const response = {
    get destroyed() {
      return responseDestroyed;
    },
    destroy() {
      responseDestroyed = true;
      destroyed.push("response");
    },
  };

  destroyExportAssetTransfer(response, request);
  destroyExportAssetTransfer(response, request);

  assert.deepEqual(destroyed, ["response", "request"]);
});
