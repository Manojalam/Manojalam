import assert from "node:assert/strict";
import test from "node:test";
import type { Edge } from "@xyflow/react";
import {
  DEFAULT_CONNECTOR_LABEL_PRESETS,
  MAX_CONNECTOR_LABEL_PRESETS,
  applyConnectorLabelPreset,
  connectorLabelPresetUpdate,
  normalizeConnectorLabelPresets,
} from "./connector-label-presets";

test("connector label presets migrate strings and accept styled multilingual shortcuts", () => {
  assert.deepEqual(
    normalizeConnectorLabelPresets([
      "  Yes ",
      { label: "आम्", color: "#22C55E", syncConnectorColor: true },
      { label: "न", color: "not-a-color", syncConnectorColor: true },
      "आम्",
      "",
    ]),
    [
      { label: "Yes" },
      { label: "आम्", color: "#22c55e", syncConnectorColor: true },
      { label: "न" },
    ]
  );
});

test("connector label presets fall back and stay bounded", () => {
  assert.deepEqual(normalizeConnectorLabelPresets(null), [...DEFAULT_CONNECTOR_LABEL_PRESETS]);
  assert.equal(
    normalizeConnectorLabelPresets(Array.from({ length: 30 }, (_, index) => `Option ${index}`)).length,
    MAX_CONNECTOR_LABEL_PRESETS
  );
});

test("styled presets apply label defaults while plain presets preserve connector styling", () => {
  assert.deepEqual(
    connectorLabelPresetUpdate({
      label: "Yes",
      color: "#22c55e",
      syncConnectorColor: true,
    }),
    {
      label: "Yes",
      labelColor: "#22c55e",
      labelColorSynced: true,
    }
  );
  assert.deepEqual(connectorLabelPresetUpdate({ label: "Review" }), { label: "Review" });
});

test("a synced preset colors the label and every segment of its logical connector", () => {
  const edges: Edge[] = [
    {
      id: "incoming",
      source: "source",
      target: "junction",
      data: {
        connectorGroupId: "group",
        connectorJunctionId: "junction",
        connectorJunctionSegment: "incoming",
      },
    },
    {
      id: "outgoing",
      source: "junction",
      target: "target",
      data: {
        connectorGroupId: "group",
        connectorJunctionId: "junction",
        connectorJunctionSegment: "outgoing",
      },
    },
  ];

  const updated = applyConnectorLabelPreset(edges, "outgoing", {
    label: "No",
    color: "#ef4444",
    syncConnectorColor: true,
  });

  assert.equal(updated[1].data?.label, "No");
  assert.equal(updated[1].data?.labelColor, "#ef4444");
  assert.equal(updated[1].data?.labelColorSynced, true);
  assert.equal(updated[0].data?.color, "#ef4444");
  assert.equal(updated[1].data?.color, "#ef4444");
});
