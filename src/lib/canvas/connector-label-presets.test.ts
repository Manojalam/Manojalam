import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_CONNECTOR_LABEL_PRESETS,
  MAX_CONNECTOR_LABEL_PRESETS,
  normalizeConnectorLabelPresets,
} from "./connector-label-presets";

test("connector label presets accept custom multilingual shortcuts", () => {
  assert.deepEqual(
    normalizeConnectorLabelPresets(["  Yes ", "आम्", "न", "आम्", ""]),
    ["Yes", "आम्", "न"]
  );
});

test("connector label presets fall back and stay bounded", () => {
  assert.deepEqual(normalizeConnectorLabelPresets(null), [...DEFAULT_CONNECTOR_LABEL_PRESETS]);
  assert.equal(
    normalizeConnectorLabelPresets(Array.from({ length: 30 }, (_, index) => `Option ${index}`)).length,
    MAX_CONNECTOR_LABEL_PRESETS
  );
});
