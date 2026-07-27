import assert from "node:assert/strict";
import test from "node:test";

import {
  exportFormatSupportsTransparency,
  OPAQUE_EXPORT_FALLBACK_BACKGROUND,
  resolveExportBackgroundColors,
  resolveFormatExportBackground,
} from "./background";

test("only PNG and SVG preserve an authored transparent canvas", () => {
  assert.equal(exportFormatSupportsTransparency("png"), true);
  assert.equal(exportFormatSupportsTransparency("svg"), true);
  assert.equal(exportFormatSupportsTransparency("jpg"), false);
  assert.equal(exportFormatSupportsTransparency("pdf"), false);
});

test("PDF and JPG use a black matte when no background is requested", () => {
  assert.equal(resolveFormatExportBackground("png", null), null);
  assert.equal(resolveFormatExportBackground("svg", "transparent"), "transparent");
  assert.equal(
    resolveFormatExportBackground("jpg", null),
    OPAQUE_EXPORT_FALLBACK_BACKGROUND
  );
  assert.equal(
    resolveFormatExportBackground("pdf", "rgba(0, 0, 0, 0)"),
    OPAQUE_EXPORT_FALLBACK_BACKGROUND
  );
  assert.equal(
    resolveFormatExportBackground("jpg", "rgb(250, 250, 250)"),
    "rgb(250, 250, 250)"
  );
});

test("a transparent board exports no background but uses the light page matte", () => {
  assert.deepEqual(
    resolveExportBackgroundColors("rgba(0, 0, 0, 0)", ["rgba(0, 0, 0, 0)", "rgb(240, 238, 234)"]),
    { background: null, appearanceBackground: "rgb(240, 238, 234)" }
  );
});

test("a transparent board uses the dark page matte in dark mode", () => {
  assert.deepEqual(
    resolveExportBackgroundColors("transparent", ["rgb(28, 28, 34)"]),
    { background: null, appearanceBackground: "rgb(28, 28, 34)" }
  );
});

test("an opaque board remains the export background and appearance matte", () => {
  assert.deepEqual(
    resolveExportBackgroundColors("rgb(240, 238, 234)", ["rgb(28, 28, 34)"]),
    { background: "rgb(240, 238, 234)", appearanceBackground: "rgb(240, 238, 234)" }
  );
});
