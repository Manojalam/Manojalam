import assert from "node:assert/strict";
import test from "node:test";
import {
  ExportAssetProxyError,
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
