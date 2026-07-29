import assert from "node:assert/strict";
import test from "node:test";

import { normalizeAppSettings } from "./app-settings";

test("hydrates old app preferences with a validated global color palette", () => {
  const settings = normalizeAppSettings({
    theme: "dark",
    customColors: ["#AABBCC", "invalid", "#aabbcc", "#123456"],
  });

  assert.equal(settings.theme, "dark");
  assert.equal(settings.autosaveEnabled, true);
  assert.deepEqual(settings.customColors, ["#aabbcc", "#123456"]);
});
