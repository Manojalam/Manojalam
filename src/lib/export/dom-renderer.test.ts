import assert from "node:assert/strict";
import test from "node:test";
import { waitForDomExportFontReadiness } from "./dom-renderer";
import { ExportError } from "./errors";

function fontFailure(code: "FONT_LOAD_TIMEOUT" | "FONT_LOAD_FAILED"): ExportError {
  return new ExportError({
    stage: "prepare-assets",
    code,
    message: code === "FONT_LOAD_TIMEOUT"
      ? "Fonts did not finish loading before the deadline."
      : "A document font failed to load.",
  });
}

test("continues a non-strict export after the font readiness wait times out", async () => {
  const timeout = fontFailure("FONT_LOAD_TIMEOUT");
  const warnings = await waitForDomExportFontReadiness(
    { strictFontEmbedding: false },
    async () => { throw timeout; }
  );

  assert.equal(warnings.length, 1);
  assert.equal(warnings[0]?.kind, "font-resource");
  assert.match(warnings[0]?.message ?? "", /continued/i);
  assert.match(warnings[0]?.message ?? "", /fallback/i);
});

test("continues a non-strict export after the document font set rejects", async () => {
  const warnings = await waitForDomExportFontReadiness(
    {},
    async () => { throw fontFailure("FONT_LOAD_FAILED"); }
  );

  assert.equal(warnings.length, 1);
  assert.equal(warnings[0]?.kind, "font-resource");
});

test("strict font readiness failures remain fatal", async () => {
  const timeout = fontFailure("FONT_LOAD_TIMEOUT");
  await assert.rejects(
    waitForDomExportFontReadiness(
      { strictFontEmbedding: true },
      async () => { throw timeout; }
    ),
    (cause: unknown) => cause === timeout
  );
});

test("cancellation remains fatal even for non-strict exports", async () => {
  const aborted = new ExportError({
    stage: "prepare-assets",
    code: "ABORTED",
    message: "The export was canceled.",
  });
  await assert.rejects(
    waitForDomExportFontReadiness(
      { strictFontEmbedding: false },
      async () => { throw aborted; }
    ),
    (cause: unknown) => cause === aborted
  );
});

test("an aborted signal wins a simultaneous font timeout", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    waitForDomExportFontReadiness(
      { signal: controller.signal, strictFontEmbedding: false },
      async () => { throw fontFailure("FONT_LOAD_TIMEOUT"); }
    ),
    (cause: unknown) => cause instanceof DOMException && cause.name === "AbortError"
  );
});

test("does not hide unrelated font preflight bugs", async () => {
  const unexpected = new Error("Unexpected preflight bug");
  await assert.rejects(
    waitForDomExportFontReadiness(
      { strictFontEmbedding: false },
      async () => { throw unexpected; }
    ),
    (cause: unknown) => cause === unexpected
  );
});
