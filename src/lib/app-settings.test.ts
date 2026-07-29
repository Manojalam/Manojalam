import assert from "node:assert/strict";
import test from "node:test";

import {
  mergeBoardColorsIntoAppPalette,
  normalizeAppSettings,
} from "./app-settings";

test("hydrates old app preferences with a validated global color palette", () => {
  const settings = normalizeAppSettings({
    theme: "dark",
    customColors: ["#AABBCC", "invalid", "#aabbcc", "#123456"],
  });

  assert.equal(settings.theme, "dark");
  assert.equal(settings.autosaveEnabled, true);
  assert.deepEqual(settings.customColors, ["#aabbcc", "#123456"]);
});

test("migrates board colors while preserving app-palette priority", () => {
  assert.deepEqual(
    mergeBoardColorsIntoAppPalette(
      ["#123456", "#abcdef"],
      {
        customColors: ["#AABBCC"],
        customTextColors: ["#234567"],
        customHighlightColors: ["#abcdef"],
      }
    ),
    ["#aabbcc", "#234567", "#123456", "#abcdef"]
  );
});
