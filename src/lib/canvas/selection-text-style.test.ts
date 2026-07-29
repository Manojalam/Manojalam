import assert from "node:assert/strict";
import test from "node:test";
import type { Node } from "@xyflow/react";

import {
  selectionNodeTextStylePatch,
  selectionNodeTextStyleValue,
  supportsSelectionTextStyle,
} from "./selection-text-style";

function node(
  type: string,
  data: Record<string, unknown> = {}
): Node {
  return {
    id: `${type}-1`,
    type,
    position: { x: 0, y: 0 },
    data,
  };
}

test("supports every text-bearing canvas node and excludes junctions", () => {
  for (const type of [
    "mindmap",
    "sticky",
    "text",
    "shape",
    "sanskrit",
    "shloka",
    "grammar",
    "frame",
    "sunburst",
    "relationshipDiagram",
  ]) {
    assert.equal(supportsSelectionTextStyle(node(type)), true, type);
  }
  assert.equal(supportsSelectionTextStyle(node("junction")), false);
});

test("whole-shape styling reaches the main, concentric, radial, and center labels", () => {
  const shape = node("shape", {
    textColor: "#111111",
    concentricLayers: [
      { id: "layer-1", text: "Inner", textColor: "#222222" },
    ],
    radialChart: {
      enabled: true,
      centerText: "Center",
      centerTextColor: "#333333",
      rings: [
        {
          id: "ring-1",
          segmentCount: 1,
          segments: [{ id: "segment-1", text: "Sector", textColor: "#444444" }],
        },
      ],
    },
  });

  assert.equal(selectionNodeTextStyleValue(shape, "textColor"), undefined);
  const patch = selectionNodeTextStylePatch(
    shape,
    "textColor",
    "#abcdef",
    { textColor: "#abcdef" }
  );
  assert.equal(patch.textColor, "#abcdef");
  assert.equal(
    (patch.concentricLayers as Array<Record<string, unknown>>)[0].textColor,
    "#abcdef"
  );
  const chart = patch.radialChart as Record<string, unknown>;
  assert.equal(chart.centerTextColor, "#abcdef");
  const rings = chart.rings as Array<Record<string, unknown>>;
  const segments = rings[0].segments as Array<Record<string, unknown>>;
  assert.equal(segments[0].textColor, "#abcdef");
});

test("relationship diagram styling uses the rendered spec and clears item overrides", () => {
  const diagram = node("relationshipDiagram", {
    relationshipDiagramSpec: {
      title: "Relations",
      textSize: 16,
      itemStyles: {
        item1: { fontSize: 11, textColor: "#ff0000", borderWidth: 2 },
      },
    },
  });

  const sizePatch = selectionNodeTextStylePatch(
    diagram,
    "fontSize",
    24,
    { fontSize: 24 }
  );
  const sizeSpec = sizePatch.relationshipDiagramSpec as Record<string, unknown>;
  assert.equal(sizeSpec.textSize, 24);
  assert.equal(
    (sizeSpec.itemStyles as Record<string, Record<string, unknown>>).item1.fontSize,
    undefined
  );
  assert.equal(
    (sizeSpec.itemStyles as Record<string, Record<string, unknown>>).item1.borderWidth,
    2
  );

  const colorPatch = selectionNodeTextStylePatch(
    diagram,
    "textColor",
    "#123456",
    { textColor: "#123456" }
  );
  const colorSpec = colorPatch.relationshipDiagramSpec as Record<string, unknown>;
  assert.equal(colorSpec.textColor, "#123456");
  assert.equal(
    (colorSpec.itemStyles as Record<string, Record<string, unknown>>).item1.textColor,
    undefined
  );
});
