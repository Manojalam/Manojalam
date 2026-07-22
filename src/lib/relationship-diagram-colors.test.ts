import assert from "node:assert/strict";
import test from "node:test";

import {
  relationshipDiagramItemColor,
  relationshipDiagramItemStyle,
} from "./relationship-diagram-colors";

const item = {
  itemId: "relationship:source:target",
  sourceNodeId: "source",
  sourceColor: "#14b8a6",
};

test("resolved item color follows the visible palette color", () => {
  assert.equal(relationshipDiagramItemColor(item, 2, {
    palette: "pastel",
  }), "#b8d3e7");
});

test("calm palette cycles through coordinated muted colors", () => {
  assert.equal(relationshipDiagramItemColor({ ...item, sourceColor: undefined }, 0, {
    palette: "calm",
  }), "#d08a83");
  assert.equal(relationshipDiagramItemColor({ ...item, sourceColor: undefined }, 7, {
    palette: "calm",
  }), "#d08a83");
});

test("source palette uses the item's source color", () => {
  assert.equal(relationshipDiagramItemColor(item, 2, {
    palette: "source",
  }), "#14b8a6");
});

test("manual item fill overrides the palette and legacy source style", () => {
  const spec = {
    palette: "pastel" as const,
    itemStyles: {
      source: { fillColor: "#6366f1", borderColor: "#22c55e" },
      [item.itemId]: { fillColor: "#134e4a" },
    },
  };

  assert.equal(relationshipDiagramItemColor(item, 2, spec), "#134e4a");
  assert.deepEqual(relationshipDiagramItemStyle(item, spec), {
    fillColor: "#134e4a",
    borderColor: "#22c55e",
  });
});

test("a transparent item fill does not fall back to the palette", () => {
  assert.equal(relationshipDiagramItemColor(item, 2, {
    palette: "pastel",
    itemStyles: {
      [item.itemId]: { fillColor: "transparent" },
    },
  }), "transparent");
});
