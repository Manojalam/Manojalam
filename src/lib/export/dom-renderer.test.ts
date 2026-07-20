import assert from "node:assert/strict";
import test from "node:test";
import {
  compositeExportColor,
  DOM_EXPORT_COMPUTED_STYLE_PROPERTIES,
  parseExportCssColor,
  waitForDomExportFontReadiness,
} from "./dom-renderer";
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

test("preserves the CSS exclusion geometry used by dense diamond labels", () => {
  assert.ok(DOM_EXPORT_COMPUTED_STYLE_PROPERTIES.includes("float"));
  assert.ok(DOM_EXPORT_COMPUTED_STYLE_PROPERTIES.includes("shape-outside"));
  assert.ok(DOM_EXPORT_COMPUTED_STYLE_PROPERTIES.includes("shape-margin"));
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

test("precomposites translucent node paint against the visible board matte", () => {
  assert.equal(
    compositeExportColor("rgba(239, 68, 68, 0.18)", "rgb(240, 238, 234)"),
    "rgb(240, 207, 204)"
  );
});

test("combines SVG paint opacity with the color alpha", () => {
  assert.equal(
    compositeExportColor("rgba(0, 100, 200, 0.4)", "#ffffff", 0.5),
    "rgb(204, 224, 244)"
  );
});

test("keeps fully transparent paint transparent instead of adding a rectangular matte", () => {
  assert.equal(compositeExportColor("transparent", "#ffffff"), null);
});

test("parses modern computed color syntax used by color-mix", () => {
  assert.deepEqual(parseExportCssColor("color(srgb 0.2 0.4 0.6 / 25%)"), {
    r: 51,
    g: 102,
    b: 153,
    a: 0.25,
  });
});
