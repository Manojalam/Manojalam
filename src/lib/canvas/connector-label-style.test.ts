import assert from "node:assert/strict";
import test from "node:test";
import { MarkerType, type Edge } from "@xyflow/react";
import {
  applyConnectorLabelStyleUpdate,
  resolveConnectorLabelPresentation,
} from "./connector-label-style";

function edge(id = "edge", data: Record<string, unknown> = {}): Edge {
  return {
    id,
    source: "source",
    target: "target",
    markerEnd: { type: MarkerType.ArrowClosed, color: "#64748b" },
    data,
  };
}

test("an independent label color does not recolor its connector", () => {
  const original = edge("edge", { color: "#64748b", label: "Yes" });
  const updated = applyConnectorLabelStyleUpdate([original], original.id, { labelColor: "#ef4444" });

  assert.equal(updated[0].data?.labelColor, "#ef4444");
  assert.equal(updated[0].data?.color, "#64748b");
  assert.equal((updated[0].markerEnd as { color?: string }).color, "#64748b");
});

test("enabling sync applies the label color to every logical connector segment", () => {
  const incoming = edge("incoming", {
    label: "Approved",
    labelColor: "#22c55e",
    connectorGroupId: "group",
    connectorJunctionId: "junction",
    connectorJunctionSegment: "incoming",
  });
  const outgoing: Edge = {
    ...edge("outgoing", {
      connectorGroupId: "group",
      connectorJunctionId: "junction",
      connectorJunctionSegment: "outgoing",
    }),
    source: "junction",
  };
  const updated = applyConnectorLabelStyleUpdate(
    [incoming, outgoing],
    outgoing.id,
    { labelColorSynced: true }
  );

  assert.equal(updated[0].data?.labelColorSynced, true);
  assert.equal(updated[0].data?.color, "#22c55e");
  assert.equal(updated[1].data?.color, "#22c55e");
  assert.equal((updated[1].markerEnd as { color?: string }).color, "#22c55e");
});

test("a connector color change keeps a synced label matched", () => {
  const original = edge("edge", {
    color: "#3b82f6",
    labelColor: "#3b82f6",
    labelColorSynced: true,
  });
  const updated = applyConnectorLabelStyleUpdate([original], original.id, { connectorColor: "#8b5cf6" });

  assert.equal(updated[0].data?.color, "#8b5cf6");
  assert.equal(updated[0].data?.labelColor, "#8b5cf6");
});

test("turning sync off allows the connector color to override independently", () => {
  const original = edge("edge", {
    color: "#3b82f6",
    labelColor: "#3b82f6",
    labelColorSynced: true,
  });
  const updated = applyConnectorLabelStyleUpdate([original], original.id, {
    connectorColor: "#f97316",
    labelColorSynced: false,
  });

  assert.equal(updated[0].data?.labelColorSynced, false);
  assert.equal(updated[0].data?.color, "#f97316");
  assert.equal(updated[0].data?.labelColor, "#3b82f6");
});

test("clearing an independent label color removes its override", () => {
  const original = edge("edge", {
    color: "#3b82f6",
    labelColor: "#ef4444",
  });
  const updated = applyConnectorLabelStyleUpdate([original], original.id, { labelColor: null });

  assert.equal(updated[0].data?.labelColor, undefined);
  assert.equal(updated[0].data?.color, "#3b82f6");
});

test("clearing a synced connector color removes both overrides and refreshes markers", () => {
  const original = edge("edge", {
    color: "#3b82f6",
    labelColor: "#3b82f6",
    labelColorSynced: true,
  });
  const updated = applyConnectorLabelStyleUpdate([original], original.id, { connectorColor: null });

  assert.equal(updated[0].data?.color, undefined);
  assert.equal(updated[0].data?.labelColor, undefined);
  assert.equal((updated[0].markerEnd as { color?: string }).color, "#94a3b8");
});

test("label fonts persist independently and font size is constrained", () => {
  const original = edge();
  const updated = applyConnectorLabelStyleUpdate([original], original.id, {
    labelFontFamily: "Georgia, serif",
    labelFontSize: 200,
    labelFontWeight: "bold",
    labelFontStyle: "italic",
  });
  const presentation = resolveConnectorLabelPresentation(updated[0].data ?? {});

  assert.equal(presentation.fontFamily, "Georgia, serif");
  assert.equal(presentation.fontSize, 48);
  assert.equal(presentation.fontWeight, "bold");
  assert.equal(presentation.fontStyle, "italic");
});
