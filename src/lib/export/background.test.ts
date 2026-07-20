import assert from "node:assert/strict";
import test from "node:test";

import { resolveExportBackgroundColors } from "./background";

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
